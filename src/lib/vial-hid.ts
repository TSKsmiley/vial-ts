/**
 * WebHID communication layer for Vial-enabled QMK keyboards.
 *
 * Mirrors vial-web/src/index.html + worker.js glue code exactly:
 *   - Filter: { usagePage: 0xFF60, usage: 0x61 }
 *   - sendReport(0, new Uint8Array(32))
 *   - oninputreport read handler set once after open
 *   - 500 ms read timeout matching vial-web's read_timeout()
 *
 * LZMA/XZ decompression: lzma_worker.js is loaded as a raw string via
 * Vite's `?raw` import and executed with a controlled `this` context so we
 * can call LZMA_WORKER.decompress() directly without Web Worker overhead.
 */

// Vite ?raw – bundled as a plain string, no Web Worker involved.
import lzmaWorkerSrc from 'lzma/src/lzma_worker.js?raw'

import type { KeyboardDefinition, VilFile } from './types'
import { createBlankVil } from './vil'
import {
  MSG_LEN,
  BUFFER_FETCH_CHUNK,
  CMD_VIA_GET_PROTOCOL_VERSION,
  CMD_VIA_GET_LAYER_COUNT,
  CMD_VIA_KEYMAP_GET_BUFFER,
  CMD_VIA_SET_KEYCODE,
  CMD_VIA_VIAL_PREFIX,
  CMD_VIAL_GET_KEYBOARD_ID,
  CMD_VIAL_GET_SIZE,
  CMD_VIAL_GET_DEFINITION,
  VIAL_HID_FILTERS,
  SUPPORTED_VIA_PROTOCOL,
  SUPPORTED_VIAL_PROTOCOL,
} from './vial-protocol'

// ── LZMA / XZ decompression ──────────────────────────────────────────────────
//
// lzma_worker.js ends with:  this.LZMA = this.LZMA_WORKER = LZMA
// Executing it with `container` as `this` gives us the LZMA algorithm object
// without creating any Workers.  Matches the Python lzma.decompress() call in
// keyboard_comm.py which defaults to FORMAT_XZ (LZMA2) – the same format
// produced by `lzma.compress(data)` in vial_generate_definition.py.

interface LzmaApi {
  decompress(
    data: number[],
    onFinish: (result: number[] | string, error?: Error) => void,
    onProgress?: (progress: number) => void,
  ): void
}

let _lzma: LzmaApi | null = null

/**
 * Bootstrap the LZMA algorithm from the bundled worker source.
 *
 * WHY new Function() here?
 * `lzma_worker.js` is a CommonJS/UMD script designed to run inside a Web
 * Worker.  It ends with `this.LZMA = this.LZMA_WORKER = LZMA`, assigning
 * the algorithm object onto its `this` context.  Vite bundles it as a raw
 * string (`?raw`) so we can execute it with a plain object as `this` to
 * capture LZMA_WORKER without spinning up an actual Worker thread.
 *
 * SECURITY: `lzmaWorkerSrc` is a compile-time constant imported from the
 * `lzma` npm package via Vite's `?raw` loader.  It is never derived from
 * user input, network data, or dynamic runtime values, so this use of
 * `new Function` carries no injection risk.
 */
function getLzma(): LzmaApi {
  if (_lzma) return _lzma
  const ctx: Record<string, unknown> = {}
  // lzmaWorkerSrc is a bundled, static string – see comment above.
  // eslint-disable-next-line no-new-func
  ;(new Function(lzmaWorkerSrc)).call(ctx)
  const api = ctx['LZMA_WORKER'] as LzmaApi | undefined
  if (!api?.decompress) throw new Error('Failed to initialise LZMA decompressor')
  _lzma = api
  return api
}

function lzmaDecompress(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    getLzma().decompress(Array.from(data), (result, error) => {
      if (error) { reject(error); return }
      resolve(
        typeof result === 'string'
          ? new TextEncoder().encode(result)
          : new Uint8Array(result),
      )
    })
  })
}

// ── HID helpers ──────────────────────────────────────────────────────────────

/** Zero-pad `msg` to exactly MSG_LEN bytes, matching vial-web worker.js. */
function pad(msg: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(MSG_LEN)
  new Uint8Array(buf).set(msg.slice(0, MSG_LEN))
  return buf
}

// ── VialKeyboard ─────────────────────────────────────────────────────────────

export class ProtocolError extends Error {}

/**
 * A connected Vial keyboard, communicating via WebHID.
 *
 * Mirrors keyboard_comm.py (vial-gui) with HID transport matching
 * index.html in vial-web:
 *
 *   device.sendReport(0, new Uint8Array(32))      // write
 *   device.oninputreport = ev => ev.data.getUint8(i)  // read
 */
export class VialKeyboard {
  readonly device: HIDDevice

  uid = 0
  vialProtocol = -1
  viaProtocol = -1
  rows = 0
  cols = 0
  layers = 0
  definition: KeyboardDefinition | null = null

  /** keymap[layer][row][col] = QMK keycode (uint16, big-endian on wire) */
  keymap: number[][][] = []

  // Per-request response promise plumbing (one in-flight request at a time)
  private _resolve: ((data: Uint8Array) => void) | null = null
  private _reject: ((err: Error) => void) | null = null
  private _readTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(device: HIDDevice) {
    this.device = device
  }

  get name(): string { return this.device.productName || 'Unknown keyboard' }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Open the device and fully load definition + keymap. */
  async connect(): Promise<void> {
    if (!this.device.opened) await this.device.open()

    // Set up the response handler once, exactly like vial-web index.html:
    //   devices[0].oninputreport = function(ev) { ev.data.getUint8(i) ... }
    this.device.oninputreport = (ev: HIDInputReportEvent) => {
      if (this._readTimeout !== null) {
        clearTimeout(this._readTimeout)
        this._readTimeout = null
      }
      if (this._resolve) {
        const resolve = this._resolve
        this._resolve = this._reject = null
        const data = new Uint8Array(MSG_LEN)
        for (let i = 0; i < MSG_LEN; i++) data[i] = ev.data.getUint8(i)
        resolve(data)
      }
    }

    await this._reloadViaProtocol()
    await this._reloadLayout()
    this._checkProtocol()
    await this._reloadLayers()
    await this._reloadKeymap()
  }

  async disconnect(): Promise<void> {
    this.device.oninputreport = null
    if (this.device.opened) await this.device.close()
  }

  /**
   * Write a single keycode to the keyboard firmware.
   * cmd: CMD_VIA_SET_KEYCODE, layer, row, col, keycode_hi, keycode_lo  (big-endian)
   * Matches set_key() in keyboard_comm.py.
   */
  async setKey(layer: number, row: number, col: number, code: number): Promise<void> {
    if (this.keymap[layer]?.[row]?.[col] === code) return
    await this._send(new Uint8Array([
      CMD_VIA_SET_KEYCODE,
      layer, row, col,
      (code >> 8) & 0xFF,
      code & 0xFF,
    ]))
    this.keymap[layer][row][col] = code
  }

  /** Serialise current state to a VilFile (matches save_layout() in keyboard_comm.py). */
  saveLayout(): VilFile {
    const { uid, layers, rows, cols, vialProtocol, viaProtocol, keymap } = this
    const vil = createBlankVil(uid, layers, rows, cols, vialProtocol, viaProtocol)
    for (let l = 0; l < layers; l++)
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          vil.layout[l][r][c] = keymap[l]?.[r]?.[c] ?? 0x0001
    return vil
  }

  /** Apply a VilFile to the keyboard, pushing only changed keys (restore_layout). */
  async restoreLayout(vil: VilFile): Promise<void> {
    const { layers, rows, cols } = this
    for (let l = 0; l < Math.min(layers, vil.layout.length); l++)
      for (let r = 0; r < Math.min(rows, vil.layout[l].length); r++)
        for (let c = 0; c < Math.min(cols, vil.layout[l][r].length); c++)
          await this.setKey(l, r, c, vil.layout[l][r][c])
  }

  // ── Private transport ──────────────────────────────────────────────────────

  /**
   * Send one 32-byte report and await the response.
   * Matches vial-web:
   *   g_device.sendReport(0, new Uint8Array(data))
   *   g_read_timeout = setTimeout(read_timeout, 500)
   */
  private _send(msg: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject  = reject

      // 500 ms timeout, matching vial-web's read_timeout()
      this._readTimeout = setTimeout(() => {
        this._resolve = this._reject = null
        this._readTimeout = null
        reject(new Error('HID read timed out'))
      }, 500)

      // sendReport(reportId=0, data=ArrayBuffer(32))
      this.device.sendReport(0, pad(msg)).catch((err: Error) => {
        if (this._readTimeout !== null) { clearTimeout(this._readTimeout); this._readTimeout = null }
        this._resolve = this._reject = null
        reject(err)
      })
    })
  }

  // ── Protocol helpers ───────────────────────────────────────────────────────

  /** CMD_VIA_GET_PROTOCOL_VERSION → big-endian uint16 at [1:3] */
  private async _reloadViaProtocol(): Promise<void> {
    const d = await this._send(new Uint8Array([CMD_VIA_GET_PROTOCOL_VERSION]))
    this.viaProtocol = (d[1] << 8) | d[2]
  }

  /**
   * Download and LZMA-decompress the keyboard definition JSON.
   * Matches reload_layout() in keyboard_comm.py:
   *
   *  1. CMD_VIA_VIAL_PREFIX + CMD_VIAL_GET_KEYBOARD_ID
   *       → vialProtocol (LE uint32, bytes 0-3)
   *         uid (LE uint64, bytes 4-11 – we keep lower 32 bits)
   *
   *  2. CMD_VIA_VIAL_PREFIX + CMD_VIAL_GET_SIZE
   *       → total compressed size (LE uint32, bytes 0-3)
   *
   *  3. CMD_VIA_VIAL_PREFIX + CMD_VIAL_GET_DEFINITION + block (LE uint32)
   *       → MSG_LEN bytes of LZMA/XZ compressed definition (repeat until done)
   */
  private async _reloadLayout(): Promise<void> {
    // Step 1 – identity
    const id = await this._send(new Uint8Array([CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_KEYBOARD_ID]))
    this.vialProtocol = id[0] | (id[1] << 8) | (id[2] << 16) | (id[3] << 24)
    this.uid = (id[4] | (id[5] << 8) | (id[6] << 16) | (id[7] << 24)) >>> 0

    // Step 2 – compressed size
    const sz = await this._send(new Uint8Array([CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_SIZE]))
    const totalSize = sz[0] | (sz[1] << 8) | (sz[2] << 16) | (sz[3] << 24)

    // Step 3 – fetch in MSG_LEN-byte blocks (little-endian block number)
    const compressed = new Uint8Array(totalSize)
    let fetched = 0
    for (let block = 0; fetched < totalSize; block++) {
      const blkView = new DataView(new ArrayBuffer(4))
      blkView.setUint32(0, block, /* littleEndian */ true)
      const cmd = new Uint8Array(6)
      cmd[0] = CMD_VIA_VIAL_PREFIX
      cmd[1] = CMD_VIAL_GET_DEFINITION
      cmd[2] = blkView.getUint8(0); cmd[3] = blkView.getUint8(1)
      cmd[4] = blkView.getUint8(2); cmd[5] = blkView.getUint8(3)

      const chunk = await this._send(cmd)
      const take  = Math.min(totalSize - fetched, MSG_LEN)
      compressed.set(chunk.slice(0, take), fetched)
      fetched += take
    }

    // Decompress LZMA/XZ → JSON → definition
    const jsonBytes = await lzmaDecompress(compressed)
    this.definition = JSON.parse(new TextDecoder('utf-8').decode(jsonBytes)) as KeyboardDefinition
    this.rows = this.definition.matrix.rows
    this.cols = this.definition.matrix.cols
  }

  /** CMD_VIA_GET_LAYER_COUNT → byte [1] */
  private async _reloadLayers(): Promise<void> {
    const d = await this._send(new Uint8Array([CMD_VIA_GET_LAYER_COUNT]))
    this.layers = d[1]
  }

  private _checkProtocol(): void {
    if (!SUPPORTED_VIA_PROTOCOL.has(this.viaProtocol))
      throw new ProtocolError(`Unsupported VIA protocol: ${this.viaProtocol}`)
    if (!SUPPORTED_VIAL_PROTOCOL.has(this.vialProtocol))
      throw new ProtocolError(`Unsupported Vial protocol: ${this.vialProtocol}`)
  }

  /**
   * Bulk-read the full keymap buffer (CMD_VIA_KEYMAP_GET_BUFFER).
   * Matches reload_keymap() in keyboard_comm.py:
   *   struct.pack(">BHB", CMD_VIA_KEYMAP_GET_BUFFER, offset, sz)
   *   keymap data at response[4 : 4+sz]
   *   each keycode: big-endian uint16
   */
  private async _reloadKeymap(): Promise<void> {
    const { layers, rows, cols } = this
    const totalBytes = layers * rows * cols * 2
    const buf = new Uint8Array(totalBytes)

    for (let offset = 0; offset < totalBytes; offset += BUFFER_FETCH_CHUNK) {
      const sz  = Math.min(totalBytes - offset, BUFFER_FETCH_CHUNK)
      // Big-endian: CMD, offset_hi, offset_lo, size
      const msg = new Uint8Array([
        CMD_VIA_KEYMAP_GET_BUFFER,
        (offset >> 8) & 0xFF,
        offset & 0xFF,
        sz,
      ])
      const data = await this._send(msg)
      buf.set(data.slice(4, 4 + sz), offset)
    }

    // Unpack: layer * rows * cols + row * cols + col → big-endian uint16
    this.keymap = Array.from({ length: layers }, (_, l) =>
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const off = (l * rows * cols + r * cols + c) * 2
          return (buf[off] << 8) | buf[off + 1]
        }),
      ),
    )
  }
}

// ── Device picker ─────────────────────────────────────────────────────────────

/**
 * Open the browser's WebHID device picker and return a fully-connected
 * VialKeyboard.  Matches the connect() function in vial-web index.html:
 *
 *   navigator.hid.requestDevice({filters:[{usagePage:0xFF60,usage:0x61}]})
 *   devices[0].open()
 */
export async function requestVialKeyboard(): Promise<VialKeyboard> {
  if (!('hid' in navigator)) {
    throw new Error(
      'WebHID is not supported in this browser. ' +
      'Use Chrome or Edge 89+.',
    )
  }
  const devices = await navigator.hid.requestDevice({ filters: VIAL_HID_FILTERS })
  if (!devices.length) throw new Error('No device selected.')
  const kb = new VialKeyboard(devices[0])
  await kb.connect()
  return kb
}
