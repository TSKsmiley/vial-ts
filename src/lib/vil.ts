/**
 * .vil file parser and serialiser.
 *
 * A .vil file is a UTF-8 JSON document produced by keyboard_comm.py save_layout()
 * in the vial-gui Python application.  This module provides type-safe load/save helpers
 * and a helper that creates a blank VilFile from keyboard dimensions.
 */

import type { VilFile } from './types'

/** Current .vil format version */
const VIL_VERSION = 1

/**
 * Parse a .vil file text (UTF-8 JSON) into a typed VilFile object.
 * Throws if the content is not valid JSON or is missing required fields.
 */
export function loadVil(text: string): VilFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new Error(`Invalid .vil file: JSON parse error – ${(e as Error).message}`)
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid .vil file: root must be an object')
  }

  const obj = raw as Record<string, unknown>

  if (obj['version'] !== VIL_VERSION) {
    throw new Error(
      `Unsupported .vil version: expected ${VIL_VERSION}, got ${obj['version']}`
    )
  }

  if (!Array.isArray(obj['layout'])) {
    throw new Error('Invalid .vil file: missing or invalid "layout" field')
  }

  return {
    version: obj['version'] as number,
    uid: (obj['uid'] as number) ?? 0,
    layout: obj['layout'] as number[][][],
    encoder_layout: (obj['encoder_layout'] as number[][][]) ?? [],
    layout_options: (obj['layout_options'] as number) ?? -1,
    macro: (obj['macro'] as VilFile['macro']) ?? [],
    vial_protocol: (obj['vial_protocol'] as number) ?? -1,
    via_protocol: (obj['via_protocol'] as number) ?? -1,
    tap_dance: (obj['tap_dance'] as VilFile['tap_dance']) ?? [],
    combo: (obj['combo'] as VilFile['combo']) ?? [],
    key_override: (obj['key_override'] as VilFile['key_override']) ?? [],
    alt_repeat_key: (obj['alt_repeat_key'] as VilFile['alt_repeat_key']) ?? [],
    settings: (obj['settings'] as Record<string, unknown>) ?? {},
  }
}

/**
 * Serialise a VilFile to its canonical UTF-8 JSON string.
 * The output is compatible with the Python Vial GUI's restore_layout().
 */
export function saveVil(data: VilFile): string {
  return JSON.stringify(data)
}

/**
 * Create a blank VilFile pre-filled with KC_TRANSPARENT (0x0001) for all positions.
 * Useful when building a new save from a live keyboard before all fields are populated.
 */
export function createBlankVil(
  uid: number,
  layers: number,
  rows: number,
  cols: number,
  vialProtocol = -1,
  viaProtocol = -1
): VilFile {
  const KC_TRNS = 0x0001

  const layout: number[][][] = Array.from({ length: layers }, () =>
    Array.from({ length: rows }, () => Array(cols).fill(KC_TRNS))
  )

  return {
    version: VIL_VERSION,
    uid,
    layout,
    encoder_layout: [],
    layout_options: -1,
    macro: [],
    vial_protocol: vialProtocol,
    via_protocol: viaProtocol,
    tap_dance: [],
    combo: [],
    key_override: [],
    alt_repeat_key: [],
    settings: {},
  }
}

/**
 * Trigger a browser download of the given .vil file content.
 * @param content  JSON string to download
 * @param filename Suggested filename (default: "keymap.vil")
 */
export function downloadVil(content: string, filename = 'keymap.vil'): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Read a .vil file from a browser File object and return its parsed content.
 */
export function readVilFile(file: File): Promise<VilFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(loadVil(reader.result as string))
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsText(file, 'utf-8')
  })
}
