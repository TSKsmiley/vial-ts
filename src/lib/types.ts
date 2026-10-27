// TypeScript interfaces for vial-ts, mirroring vial-gui data models.

// ── .vil file ────────────────────────────────────────────────────────────────

/**
 * Serialised representation of a saved keyboard layout.
 * Matches the JSON produced by keyboard_comm.py save_layout() in the Python Vial GUI.
 */
export interface VilFile {
  /** Format version (always 1 for current Vial) */
  version: number
  /** 64-bit keyboard UID as a JS number (safe up to 2^53-1) */
  uid: number
  /** Keymap: layout[layer][row][col] = QMK keycode integer */
  layout: number[][][]
  /** Encoder keymap: encoder_layout[layer][encoderIndex][dir] (0=CW, 1=CCW) */
  encoder_layout: number[][][]
  /** Layout options bitmask */
  layout_options: number
  /** Serialised macro actions (nested arrays from save_macro) */
  macro: MacroAction[][]
  vial_protocol: number
  via_protocol: number
  tap_dance: TapDanceEntry[]
  combo: ComboEntry[]
  key_override: KeyOverrideEntry[]
  alt_repeat_key: AltRepeatKeyEntry[]
  settings: Record<string, unknown>
}

/** A single macro step as saved by the Python Vial GUI */
export type MacroAction = [string, ...unknown[]]

/** Tap-dance tuple: [onTap, onHold, onDoubleTap, onTapHold, tappingTerm] */
export type TapDanceEntry = [number, number, number, number, number]

/** Combo entry as saved (variable structure, kept as-is for round-tripping) */
export type ComboEntry = unknown[]

/** Key-override entry as saved */
export type KeyOverrideEntry = unknown[]

/** Alt-repeat key entry as saved */
export type AltRepeatKeyEntry = unknown[]

// ── Keyboard definition (downloaded from firmware) ───────────────────────────

/** Matrix dimensions */
export interface MatrixConfig {
  rows: number
  cols: number
}

/** KLE key as parsed from the keyboard definition */
export interface LayoutKey {
  row: number
  col: number
  /** Physical X position in key units */
  x: number
  /** Physical Y position in key units */
  y: number
  /** Width in key units (default 1) */
  w: number
  /** Height in key units (default 1) */
  h: number
  /** Rotation in degrees (default 0) */
  r: number
  /** Rotation origin X in key units (default 0) */
  rx: number
  /** Rotation origin Y in key units (default 0) */
  ry: number
}

/** Full keyboard definition JSON (LZMA-compressed in firmware, unpacked here) */
export interface KeyboardDefinition {
  name?: string
  matrix: MatrixConfig
  layouts: {
    keymap: unknown[]
    /** Layout option group labels: labels[i][0] = group name, labels[i][1..] = choice names */
    labels?: string[][]
  }
  customKeycodes?: Array<{ name: string; title: string; shortName: string }>
  vial?: {
    vibl?: boolean
    midi?: unknown
  }
  lighting?: string
}

// ── Runtime keyboard state ───────────────────────────────────────────────────

export interface KeyboardState {
  /** Connected HID device */
  device: HIDDevice
  /** Keyboard definition from firmware */
  definition: KeyboardDefinition
  /** Keyboard UID */
  uid: number
  rows: number
  cols: number
  layers: number
  vialProtocol: number
  viaProtocol: number
  /** keymap[layer][row][col] = QMK keycode */
  keymap: number[][][]
}
