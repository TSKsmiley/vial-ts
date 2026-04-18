/**
 * WebHID communication layer for Vial-enabled QMK keyboards.
 *
 * Mirrors the behaviour of keyboard_comm.py / util.py in the Python Vial GUI.
 * Requires a browser with WebHID support (Chrome / Edge 89+).
 */

// Vite ?raw import – bundled as a plain string so we can execute it in a
// controlled scope without any Web Worker plumbing.
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
// lzma_worker.js is designed to run either inside a Web Worker or in the main
// thread.  We load it via `?raw`, execute it with a plain object as `this`,
// and the last line of the file does `this.LZMA = this.LZMA_WORKER = LZMA`,
// giving us direct access to the decompression algorithm without Workers.

interface LzmaApi {
  decompress(
    data: number[],
    onFinish: (result: number[] | string, error?: Error) => void,
    onProgress?: (progress: number) => void,
  ): void
}

let _lzma: LzmaApi | null = null

function getLzma(): LzmaApi {
  if (_lzma) return _lzma
  const ctx: Record<string, unknown> = {}
  // eslint-disable-next-line no-new-func
  ;(new Function(lzmaWorkerSrc)).call(ctx)
  _lzma = ctx['LZMA_WORKER'] as LzmaApi
  if (!_lzma?.decompress) throw new Error('Failed to load LZMA decompressor')
  return _lzma
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

// ── Raw HID helpers ──────────────────────────────────────────────────────────

/** Zero-pad `msg` to MSG_LEN bytes. */
function pad(msg: Uint8Array): Uint8Array {
  const buf = new Uint8Array(MSG_LEN)
  buf.set(msg.slice(0, MSG_LEN))
  return buf
}

/**
 * Send a report to the keyboard and await the single response report.
 *
 * Vial uses report ID 0 with 32-byte payloads (matching the Python
 * `dev.write(b"\x00" + msg)` / `dev.read(32)` pattern in util.py).
 */
function hidSend(device: HIDDevice, msg: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const handler = (event: HIDInputReportEvent) => {
      device.removeEventListener('inputreport', handler as EventListener)
      resolve(new Uint8Array(event.data.buffer))
    }
    device.addEventListener('inputreport', handler as EventListener)
    device.sendReport(0, pad(msg) as unknown as BufferSource).catch((err: Error) => {
      device.removeEventListener('inputreport', handler as EventListener)
      reject(err)
    })
  })
}

// ── Public classes ───────────────────────────────────────────────────────────

export class ProtocolError extends Error {}

/**
 * A connected Vial keyboard.
 *
 * Lifecycle:
 *   const kb = new VialKeyboard(device)
 *   await kb.connect()      // opens device, downloads definition + keymap
 *   await kb.setKey(...)    // live edits
 *   const vil = kb.saveLayout()
 *   await kb.disconnect()
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

  /** keymap[layer][row][col] = QMK keycode (uint16) */
  keymap: number[][][] = []

  constructor(device: HIDDevice) {
    this.device = device
  }

  get name(): string {
    return this.device.productName || 'Unknown keyboard'
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Open the HID device and fully load the keyboard state. */
  async connect(): Promise<void> {
    if (!this.device.opened) await this.device.open()
    await this._reloadViaProtocol()
    await this._reloadLayout()
    this._checkProtocol()
    await this._reloadLayers()
    await this._reloadKeymap()
  }

  /** Close the HID device. */
  async disconnect(): Promise<void> {
    if (this.device.opened) await this.device.close()
  }

  /**
   * Write a single keycode to the keyboard firmware.
   * Matches `set_key()` in keyboard_comm.py (CMD_VIA_SET_KEYCODE).
   */
  async setKey(layer: number, row: number, col: number, code: number): Promise<void> {
    if (this.keymap[layer]?.[row]?.[col] === code) return
    // Big-endian: CMD_VIA_SET_KEYCODE, layer, row, col, keycode_hi, keycode_lo
    const msg = new Uint8Array([
      CMD_VIA_SET_KEYCODE,
      layer,
      row,
      col,
      (code >> 8) & 0xFF,
      code & 0xFF,
    ])
    await this._send(msg)
    this.keymap[layer][row][col] = code
  }

  /** Serialise current keyboard state as a VilFile object ready to save. */
  saveLayout(): VilFile {
    const { uid, layers, rows, cols, vialProtocol, viaProtocol, keymap } = this
    const vil = createBlankVil(uid, layers, rows, cols, vialProtocol, viaProtocol)
    for (let l = 0; l < layers; l++)
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          vil.layout[l][r][c] = keymap[l]?.[r]?.[c] ?? 0x0001
    return vil
  }

  /**
   * Apply a VilFile to the keyboard, writing any changed keycodes.
   * Matches `restore_layout()` in keyboard_comm.py.
   */
  async restoreLayout(vil: VilFile): Promise<void> {
    const { layers, rows, cols } = this
    for (let l = 0; l < Math.min(layers, vil.layout.length); l++)
      for (let r = 0; r < Math.min(rows, vil.layout[l].length); r++)
        for (let c = 0; c < Math.min(cols, vil.layout[l][r].length); c++)
          await this.setKey(l, r, c, vil.layout[l][r][c])
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _send(msg: Uint8Array): Promise<Uint8Array> {
    return hidSend(this.device, msg)
  }

  /** CMD_VIA_GET_PROTOCOL_VERSION → 2-byte big-endian version at [1:3] */
  private async _reloadViaProtocol(): Promise<void> {
    const data = await this._send(new Uint8Array([CMD_VIA_GET_PROTOCOL_VERSION]))
    this.viaProtocol = (data[1] << 8) | data[2]
  }

  /**
   * Download and decompress the keyboard definition JSON from firmware.
   * Matches `reload_layout()` in keyboard_comm.py.
   *
   *  1. CMD_VIA_VIAL_PREFIX + CMD_VIAL_GET_KEYBOARD_ID
   *       → vial_protocol (LE uint32, bytes 0-3) + uid (LE uint64, bytes 4-11)
   *  2. CMD_VIA_VIAL_PREFIX + CMD_VIAL_GET_SIZE
   *       → total compressed size (LE uint32, bytes 0-3)
   *  3. CMD_VIA_VIAL_PREFIX + CMD_VIAL_GET_DEFINITION + block (LE uint32)
   *       → 32 bytes of LZMA/XZ compressed definition (repeated until complete)
   */
  private async _reloadLayout(): Promise<void> {
    // Step 1 – keyboard identity
    const idData = await this._send(new Uint8Array([CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_KEYBOARD_ID]))
    this.vialProtocol =
      idData[0] | (idData[1] << 8) | (idData[2] << 16) | (idData[3] << 24)
    // uid lower 32 bits (safe for JS – full 64-bit UID would need BigInt)
    this.uid = (idData[4] | (idData[5] << 8) | (idData[6] << 16) | (idData[7] << 24)) >>> 0

    // Step 2 – compressed definition size
    const sizeData = await this._send(new Uint8Array([CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_SIZE]))
    const totalSize =
      sizeData[0] | (sizeData[1] << 8) | (sizeData[2] << 16) | (sizeData[3] << 24)

    // Step 3 – fetch compressed definition in MSG_LEN-byte blocks
    let compressed = new Uint8Array(totalSize)
    let fetched = 0
    let block = 0
    while (fetched < totalSize) {
      const blockLE = new Uint8Array(4)
      new DataView(blockLE.buffer).setUint32(0, block, /* littleEndian */ true)
      const chunkData = await this._send(
        new Uint8Array([CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_DEFINITION, ...blockLE]),
      )
      const take = Math.min(totalSize - fetched, MSG_LEN)
      compressed.set(chunkData.slice(0, take), fetched)
      fetched += take
      block++
    }

    // Decompress LZMA/XZ → JSON → definition object
    const jsonBytes = await lzmaDecompress(compressed)
    this.definition = JSON.parse(new TextDecoder('utf-8').decode(jsonBytes)) as KeyboardDefinition
    this.rows = this.definition.matrix.rows
    this.cols = this.definition.matrix.cols
  }

  /** CMD_VIA_GET_LAYER_COUNT → layer count at byte [1] */
  private async _reloadLayers(): Promise<void> {
    const data = await this._send(new Uint8Array([CMD_VIA_GET_LAYER_COUNT]))
    this.layers = data[1]
  }

  private _checkProtocol(): void {
    if (!SUPPORTED_VIA_PROTOCOL.has(this.viaProtocol))
      throw new ProtocolError(`Unsupported VIA protocol: ${this.viaProtocol}`)
    if (!SUPPORTED_VIAL_PROTOCOL.has(this.vialProtocol))
      throw new ProtocolError(`Unsupported Vial protocol: ${this.vialProtocol}`)
  }

  /**
   * Bulk-read the full keymap buffer from the keyboard.
   * Matches `reload_keymap()` in keyboard_comm.py (CMD_VIA_KEYMAP_GET_BUFFER).
   *
   * Buffer format: big-endian uint16 per key, ordered
   *   layer * rows * cols + row * cols + col
   */
  private async _reloadKeymap(): Promise<void> {
    const { layers, rows, cols } = this
    const totalBytes = layers * rows * cols * 2
    const keymapBuf = new Uint8Array(totalBytes)

    for (let offset = 0; offset < totalBytes; offset += BUFFER_FETCH_CHUNK) {
      const sz = Math.min(totalBytes - offset, BUFFER_FETCH_CHUNK)
      // Big-endian: CMD, offset_hi, offset_lo, size
      const msg = new Uint8Array([
        CMD_VIA_KEYMAP_GET_BUFFER,
        (offset >> 8) & 0xFF,
        offset & 0xFF,
        sz,
      ])
      const data = await this._send(msg)
      keymapBuf.set(data.slice(4, 4 + sz), offset)
    }

    // Unpack flat buffer → 3D keymap array
    this.keymap = Array.from({ length: layers }, (_, l) =>
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const off = (l * rows * cols + r * cols + c) * 2
          return (keymapBuf[off] << 8) | keymapBuf[off + 1]
        }),
      ),
    )
  }
}

// ── Device discovery ─────────────────────────────────────────────────────────

/**
 * Prompt the user to select a Vial-compatible keyboard via the browser's
 * WebHID picker and return a fully-connected VialKeyboard instance.
 *
 * Throws if:
 * - WebHID is not supported in this browser
 * - The user cancels the picker
 * - The selected device does not speak a supported VIA/Vial protocol
 */
export async function requestVialKeyboard(): Promise<VialKeyboard> {
  if (!('hid' in navigator)) {
    throw new Error(
      'WebHID is not supported in this browser. ' +
      'Please use Google Chrome or Microsoft Edge (version 89+).',
    )
  }
  const devices = await navigator.hid.requestDevice({ filters: VIAL_HID_FILTERS })
  if (!devices.length) throw new Error('No device selected.')
  const kb = new VialKeyboard(devices[0])
  await kb.connect()
  return kb
}
