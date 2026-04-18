/**
 * WebHID communication layer for Vial-enabled QMK keyboards.
 *
 * Mirrors vial-web/src/index.html + worker.js glue code exactly:
 *   - Filter: { usagePage: 0xFF60, usage: 0x61 }
 *   - sendReport(0, new Uint8Array(32))
 *   - oninputreport read handler set once after open
 *   - 500 ms read timeout matching vial-web's read_timeout()
 *
 * XZ decompression: the keyboard firmware compresses its definition JSON with
 * Python's lzma.compress() which produces XZ/LZMA2 format (magic FD 37 7A 58
 * 5A 00).  The older `lzma` npm package only handles raw LZMA1 (.lzma files)
 * and misinterprets the XZ magic bytes as LZMA1 property bytes (pb=5 is out
 * of range → "corrupted input").  We therefore use `xz-decompress`, a
 * WebAssembly port of liblzma that fully supports XZ + CRC64 in the browser.
 */

import { XzReadableStream } from 'xz-decompress'

import type { KeyboardDefinition, VilFile } from './types'
import { createBlankVil } from './vil'
import {
  MSG_LEN,
  BUFFER_FETCH_CHUNK,
  CMD_VIA_GET_PROTOCOL_VERSION,
  CMD_VIA_GET_KEYBOARD_VALUE,
  CMD_VIA_GET_LAYER_COUNT,
  CMD_VIA_KEYMAP_GET_BUFFER,
  CMD_VIA_SET_KEYCODE,
  CMD_VIA_VIAL_PREFIX,
  CMD_VIAL_GET_KEYBOARD_ID,
  CMD_VIAL_GET_SIZE,
  CMD_VIAL_GET_DEFINITION,
  VIA_LAYOUT_OPTIONS,
  VIAL_HID_FILTERS,
  SUPPORTED_VIA_PROTOCOL,
  SUPPORTED_VIAL_PROTOCOL,
} from './vial-protocol'

// ── XZ decompression ─────────────────────────────────────────────────────────

/**
 * Decompress XZ/LZMA2-encoded data using the `xz-decompress` WebAssembly
 * library.  This is the format produced by Python's lzma.compress() (FORMAT_XZ
 * with CRC64), which is what vial firmware uses for the keyboard definition.
 */
async function xzDecompress(data: Uint8Array): Promise<Uint8Array> {
  const compressed = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer])
  const decompressedStream = new XzReadableStream(compressed.stream())
  const response   = new Response(decompressedStream)
  const buf        = await response.arrayBuffer()
  return new Uint8Array(buf)
}

// ── Debugging helpers ─────────────────────────────────────────────────────────

/** Format a Uint8Array as a compact hex string, e.g. "FE 00 A1 …" */
function toHex(data: Uint8Array, maxBytes = 32): string {
  const slice = data.slice(0, maxBytes)
  const hex   = Array.from(slice, b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
  return data.length > maxBytes ? hex + ` … (+${data.length - maxBytes} more)` : hex
}

/** Known XZ magic: fd 37 7a 58 5a 00.  LZMA1 magic: first byte is properties (0x5d typical). */
function describeCompressedFormat(data: Uint8Array): string {
  if (data.length < 6) return `too short (${data.length} bytes)`
  if (data[0] === 0xFD && data[1] === 0x37 && data[2] === 0x7A &&
      data[3] === 0x58 && data[4] === 0x5A && data[5] === 0x00) {
    return 'XZ format ✓'
  }
  if (data[0] === 0x5D) return 'LZMA1 (.lzma) format'
  return `unknown format (first byte 0x${data[0].toString(16).padStart(2,'0').toUpperCase()})`
}

// ── HID helpers ──────────────────────────────────────────────────────────────

/** Zero-pad `msg` to exactly MSG_LEN bytes, matching vial-web worker.js. */
function pad(msg: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(MSG_LEN)
  new Uint8Array(buf).set(msg.slice(0, MSG_LEN))
  return buf
}

// ── Error type ────────────────────────────────────────────────────────────────

/**
 * Thrown by requestVialKeyboard() when the connection fails.
 * Carries the full debug log collected during the attempt.
 */
export class VialConnectionError extends Error {
  readonly log: string[]
  constructor(message: string, log: string[]) {
    super(message)
    this.name = 'VialConnectionError'
    this.log  = log
  }
}

export class ProtocolError extends Error {}

// ── VialKeyboard ─────────────────────────────────────────────────────────────

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
  layoutOptions = 0
  definition: KeyboardDefinition | null = null

  /** keymap[layer][row][col] = QMK keycode (uint16, big-endian on wire) */
  keymap: number[][][] = []

  /** Debug log lines collected during connect().  Inspect after failure. */
  readonly log: string[] = []

  /** Optional real-time callback – called for every log line as it is written. */
  onLog?: (line: string) => void

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
    this.log.length = 0  // reset log on each attempt
    this._dbg(`Device: ${this.device.productName || '(unnamed)'} `
      + `VID=0x${this.device.vendorId.toString(16).padStart(4,'0').toUpperCase()} `
      + `PID=0x${this.device.productId.toString(16).padStart(4,'0').toUpperCase()}`)
    this._dbg(`Collections: ${this.device.collections.length} — `
      + this.device.collections.map(c =>
          `usagePage=0x${(c.usagePage ?? 0).toString(16)} usage=0x${(c.usage ?? 0).toString(16)}`
        ).join(', '))

    if (!this.device.opened) {
      this._dbg('Opening device…')
      await this.device.open()
    }
    this._dbg('Device opened ✓')

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
        // Safely read up to MSG_LEN bytes; ev.data.byteLength may differ
        const available = ev.data.byteLength
        const data = new Uint8Array(MSG_LEN)
        for (let i = 0; i < Math.min(MSG_LEN, available); i++) {
          data[i] = ev.data.getUint8(i)
        }
        resolve(data)
      }
    }

    await this._reloadViaProtocol()
    await this._reloadLayout()
    this._checkProtocol()
    await this._reloadLayers()
    await this._reloadLayoutOptions()
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

  // ── Debug logging ──────────────────────────────────────────────────────────

  private _dbg(line: string): void {
    const ts  = new Date().toISOString().slice(11, 23)  // HH:MM:SS.mmm
    const msg = `[${ts}] ${line}`
    this.log.push(msg)
    this.onLog?.(msg)
    console.log('[vial-hid]', line)
  }

  // ── Private transport ──────────────────────────────────────────────────────

  /**
   * Send one 32-byte report and await the response.
   * Matches vial-web:
   *   g_device.sendReport(0, new Uint8Array(data))
   *   g_read_timeout = setTimeout(read_timeout, 500)
   */
  private _send(msg: Uint8Array): Promise<Uint8Array> {
    this._dbg(`→ TX [${toHex(msg)}]`)
    return new Promise((resolve, reject) => {
      this._resolve = (data: Uint8Array) => {
        this._dbg(`← RX [${toHex(data)}]`)
        resolve(data)
      }
      this._reject = reject

      // 500 ms timeout, matching vial-web's read_timeout()
      this._readTimeout = setTimeout(() => {
        this._resolve = this._reject = null
        this._readTimeout = null
        this._dbg('✗ HID read timed out after 500 ms')
        reject(new Error('HID read timed out'))
      }, 500)

      // sendReport(reportId=0, data=ArrayBuffer(32))
      this.device.sendReport(0, pad(msg)).catch((err: Error) => {
        if (this._readTimeout !== null) { clearTimeout(this._readTimeout); this._readTimeout = null }
        this._resolve = this._reject = null
        this._dbg(`✗ sendReport failed: ${err.message}`)
        reject(err)
      })
    })
  }

  // ── Protocol helpers ───────────────────────────────────────────────────────

  /** CMD_VIA_GET_PROTOCOL_VERSION → big-endian uint16 at [1:3] */
  private async _reloadViaProtocol(): Promise<void> {
    this._dbg('Step 1 – GET_PROTOCOL_VERSION (0x01)')
    const d = await this._send(new Uint8Array([CMD_VIA_GET_PROTOCOL_VERSION]))
    this.viaProtocol = (d[1] << 8) | d[2]
    this._dbg(`  VIA protocol version: ${this.viaProtocol} (0x${this.viaProtocol.toString(16).padStart(4,'0').toUpperCase()})`)
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
    // Step 2 – identity
    this._dbg('Step 2 – VIAL_GET_KEYBOARD_ID (0xFE 0x00)')
    const id = await this._send(new Uint8Array([CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_KEYBOARD_ID]))
    this.vialProtocol = id[0] | (id[1] << 8) | (id[2] << 16) | (id[3] << 24)
    this.uid = (id[4] | (id[5] << 8) | (id[6] << 16) | (id[7] << 24)) >>> 0
    this._dbg(`  Vial protocol version: ${this.vialProtocol}`)
    this._dbg(`  UID (low 32 bits): 0x${this.uid.toString(16).padStart(8,'0').toUpperCase()}`)

    // Step 3 – compressed size
    this._dbg('Step 3 – VIAL_GET_SIZE (0xFE 0x01)')
    const sz = await this._send(new Uint8Array([CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_SIZE]))
    const totalSize = sz[0] | (sz[1] << 8) | (sz[2] << 16) | (sz[3] << 24)
    this._dbg(`  Compressed definition size: ${totalSize} bytes`)
    if (totalSize === 0 || totalSize > 65536) {
      this._dbg(`  ⚠ Suspicious size value – may indicate command mismatch or unsupported firmware`)
    }

    // Step 4 – fetch in MSG_LEN-byte blocks (little-endian block number)
    this._dbg(`Step 4 – VIAL_GET_DEFINITION (0xFE 0x02), ${Math.ceil(totalSize / MSG_LEN)} block(s)`)
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
    this._dbg(`  Received ${fetched} compressed bytes`)
    this._dbg(`  Compressed header: [${toHex(compressed.slice(0, 8))}] → ${describeCompressedFormat(compressed)}`)

    // Step 5 – Decompress XZ/LZMA2 → JSON → definition
    this._dbg('Step 5 – XZ decompress')
    let jsonBytes: Uint8Array
    try {
      jsonBytes = await xzDecompress(compressed)
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      this._dbg(`  ✗ LZMA decompression failed: ${msg}`)
      this._dbg(`  Full compressed data (first 64 bytes): [${toHex(compressed.slice(0, 64), 64)}]`)
      throw new Error(`LZMA decompression failed: ${msg}`)
    }
    this._dbg(`  Decompressed ${jsonBytes.length} bytes`)

    const jsonStr = new TextDecoder('utf-8').decode(jsonBytes)
    this._dbg(`  JSON preview: ${jsonStr.slice(0, 120)}…`)
    try {
      this.definition = JSON.parse(jsonStr) as KeyboardDefinition
    } catch (e) {
      this._dbg(`  ✗ JSON parse failed: ${(e as Error).message}`)
      throw new Error(`Definition JSON parse failed: ${(e as Error).message}`)
    }
    this.rows = this.definition.matrix.rows
    this.cols = this.definition.matrix.cols
    this._dbg(`  Definition OK – matrix ${this.rows}r × ${this.cols}c, name: ${this.definition.name ?? '(unnamed)'}`)
  }

  /** CMD_VIA_GET_LAYER_COUNT → byte [1] */
  private async _reloadLayers(): Promise<void> {
    this._dbg('Step 6 – GET_LAYER_COUNT (0x11)')
    const d = await this._send(new Uint8Array([CMD_VIA_GET_LAYER_COUNT]))
    this.layers = d[1]
    this._dbg(`  Layers: ${this.layers}`)
  }

  /** CMD_VIA_GET_KEYBOARD_VALUE(VIA_LAYOUT_OPTIONS) → big-endian uint32 at [1:5] */
  private async _reloadLayoutOptions(): Promise<void> {
    this._dbg('Step 6a – GET_LAYOUT_OPTIONS (0x02 0x02)')
    try {
      const d = await this._send(new Uint8Array([CMD_VIA_GET_KEYBOARD_VALUE, VIA_LAYOUT_OPTIONS]))
      this.layoutOptions = ((d[1] << 24) | (d[2] << 16) | (d[3] << 8) | d[4]) >>> 0
      this._dbg(`  Layout options: 0x${this.layoutOptions.toString(16).padStart(8, '0').toUpperCase()}`)
    } catch {
      this._dbg('  ⚠ Could not read layout options (defaulting to 0)')
      this.layoutOptions = 0
    }
  }

  private _checkProtocol(): void {
    this._dbg(`Protocol check – VIA=${this.viaProtocol}, Vial=${this.vialProtocol}`)
    if (!SUPPORTED_VIA_PROTOCOL.has(this.viaProtocol)) {
      this._dbg(`  ✗ VIA protocol ${this.viaProtocol} not in supported set`)
      throw new ProtocolError(`Unsupported VIA protocol: ${this.viaProtocol}`)
    }
    if (!SUPPORTED_VIAL_PROTOCOL.has(this.vialProtocol)) {
      this._dbg(`  ✗ Vial protocol ${this.vialProtocol} not in supported set`)
      throw new ProtocolError(`Unsupported Vial protocol: ${this.vialProtocol}`)
    }
    this._dbg('  Protocol versions OK ✓')
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
    this._dbg(`Step 7 – GET_KEYMAP_BUFFER: ${layers}L × ${rows}R × ${cols}C = ${totalBytes} bytes`)
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
    this._dbg('  Keymap loaded ✓')
  }
}

// ── Device picker ─────────────────────────────────────────────────────────────

/**
 * Open the browser's WebHID device picker and return a fully-connected
 * VialKeyboard.  Matches the connect() function in vial-web index.html:
 *
 *   navigator.hid.requestDevice({filters:[{usagePage:0xFF60,usage:0x61}]})
 *   devices[0].open()
 *
 * On failure, throws VialConnectionError which carries the full debug log.
 */
export async function requestVialKeyboard(onLog?: (line: string) => void): Promise<VialKeyboard> {
  if (!('hid' in navigator)) {
    throw new VialConnectionError(
      'WebHID is not supported in this browser. Use Chrome or Edge 89+.',
      [],
    )
  }
  const devices = await navigator.hid.requestDevice({ filters: VIAL_HID_FILTERS })
  if (!devices.length) throw new VialConnectionError('No device selected.', [])
  const kb = new VialKeyboard(devices[0])
  if (onLog) kb.onLog = onLog
  try {
    await kb.connect()
  } catch (e) {
    throw new VialConnectionError((e as Error).message, kb.log)
  }
  return kb
}
