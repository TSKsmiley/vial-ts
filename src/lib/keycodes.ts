/**
 * QMK / Vial keycode definitions.
 *
 * Numeric values follow the USB HID usage table for basic keycodes,
 * plus QMK layer/modifier extensions above 0x00FF.
 * Sources: QMK docs, vial-gui keycodes/keycodes.py.
 */

// ── Basic keycodes ───────────────────────────────────────────────────────────

export const KC_NO           = 0x0000
export const KC_TRANSPARENT  = 0x0001

// Letters
export const KC_A = 0x0004
export const KC_B = 0x0005
export const KC_C = 0x0006
export const KC_D = 0x0007
export const KC_E = 0x0008
export const KC_F = 0x0009
export const KC_G = 0x000A
export const KC_H = 0x000B
export const KC_I = 0x000C
export const KC_J = 0x000D
export const KC_K = 0x000E
export const KC_L = 0x000F
export const KC_M = 0x0010
export const KC_N = 0x0011
export const KC_O = 0x0012
export const KC_P = 0x0013
export const KC_Q = 0x0014
export const KC_R = 0x0015
export const KC_S = 0x0016
export const KC_T = 0x0017
export const KC_U = 0x0018
export const KC_V = 0x0019
export const KC_W = 0x001A
export const KC_X = 0x001B
export const KC_Y = 0x001C
export const KC_Z = 0x001D

// Digits
export const KC_1 = 0x001E
export const KC_2 = 0x001F
export const KC_3 = 0x0020
export const KC_4 = 0x0021
export const KC_5 = 0x0022
export const KC_6 = 0x0023
export const KC_7 = 0x0024
export const KC_8 = 0x0025
export const KC_9 = 0x0026
export const KC_0 = 0x0027

// Control / editing
export const KC_ENTER  = 0x0028
export const KC_ESC    = 0x0029
export const KC_BSPC   = 0x002A
export const KC_TAB    = 0x002B
export const KC_SPC    = 0x002C

// Punctuation / symbols
export const KC_MINUS  = 0x002D
export const KC_EQUAL  = 0x002E
export const KC_LBRC   = 0x002F  // [
export const KC_RBRC   = 0x0030  // ]
export const KC_BSLS   = 0x0031  // backslash
export const KC_NUHS   = 0x0032  // # ~  (ISO)
export const KC_SCLN   = 0x0033  // ;
export const KC_QUOT   = 0x0034  // '
export const KC_GRV    = 0x0035  // `
export const KC_COMM   = 0x0036  // ,
export const KC_DOT    = 0x0037  // .
export const KC_SLSH   = 0x0038  // /

// Lock / system
export const KC_CAPS   = 0x0039

// Function keys
export const KC_F1  = 0x003A
export const KC_F2  = 0x003B
export const KC_F3  = 0x003C
export const KC_F4  = 0x003D
export const KC_F5  = 0x003E
export const KC_F6  = 0x003F
export const KC_F7  = 0x0040
export const KC_F8  = 0x0041
export const KC_F9  = 0x0042
export const KC_F10 = 0x0043
export const KC_F11 = 0x0044
export const KC_F12 = 0x0045

// Navigation / media cluster
export const KC_PSCR = 0x0046
export const KC_SCRL = 0x0047
export const KC_PAUS = 0x0048
export const KC_INS  = 0x0049
export const KC_HOME = 0x004A
export const KC_PGUP = 0x004B
export const KC_DEL  = 0x004C
export const KC_END  = 0x004D
export const KC_PGDN = 0x004E
export const KC_RGHT = 0x004F
export const KC_LEFT = 0x0050
export const KC_DOWN = 0x0051
export const KC_UP   = 0x0052

// Numpad
export const KC_NLCK = 0x0053
export const KC_PSLS = 0x0054
export const KC_PAST = 0x0055
export const KC_PMNS = 0x0056
export const KC_PPLS = 0x0057
export const KC_PENT = 0x0058
export const KC_P1   = 0x0059
export const KC_P2   = 0x005A
export const KC_P3   = 0x005B
export const KC_P4   = 0x005C
export const KC_P5   = 0x005D
export const KC_P6   = 0x005E
export const KC_P7   = 0x005F
export const KC_P8   = 0x0060
export const KC_P9   = 0x0061
export const KC_P0   = 0x0062
export const KC_PDOT = 0x0063
export const KC_NUBS = 0x0064  // ISO \ |
export const KC_APP  = 0x0065

// Extended function keys
export const KC_F13 = 0x0068
export const KC_F14 = 0x0069
export const KC_F15 = 0x006A
export const KC_F16 = 0x006B
export const KC_F17 = 0x006C
export const KC_F18 = 0x006D
export const KC_F19 = 0x006E
export const KC_F20 = 0x006F
export const KC_F21 = 0x0070
export const KC_F22 = 0x0071
export const KC_F23 = 0x0072
export const KC_F24 = 0x0073

// Modifier keys (HID usage 0xE0–0xE7)
export const KC_LCTL = 0x00E0
export const KC_LSFT = 0x00E1
export const KC_LALT = 0x00E2
export const KC_LGUI = 0x00E3
export const KC_RCTL = 0x00E4
export const KC_RSFT = 0x00E5
export const KC_RALT = 0x00E6
export const KC_RGUI = 0x00E7

// ── QMK layer / special keycodes ────────────────────────────────────────────

/** Momentary layer activation: MO(n) */
export const QK_MOMENTARY        = 0x5100
/** Switch to layer: TO(n) */
export const QK_TO               = 0x5000
/** Toggle layer: TG(n) */
export const QK_TOGGLE_LAYER     = 0x5200
/** One-shot layer: OSL(n) */
export const QK_ONE_SHOT_LAYER   = 0x5400
/** Tap-toggle layer: TT(n) */
export const QK_TAP_TOGGLE       = 0x5800
/** One-shot modifier: OSM(mod) */
export const QK_ONE_SHOT_MOD     = 0x5500

// ── Lookup tables ────────────────────────────────────────────────────────────

/** Map from QMK keycode value to its display name */
export const KEYCODE_NAMES: ReadonlyMap<number, string> = new Map([
  [KC_NO,          'KC_NO'],
  [KC_TRANSPARENT, 'KC_TRNS'],
  // Letters
  [KC_A, 'A'], [KC_B, 'B'], [KC_C, 'C'], [KC_D, 'D'], [KC_E, 'E'],
  [KC_F, 'F'], [KC_G, 'G'], [KC_H, 'H'], [KC_I, 'I'], [KC_J, 'J'],
  [KC_K, 'K'], [KC_L, 'L'], [KC_M, 'M'], [KC_N, 'N'], [KC_O, 'O'],
  [KC_P, 'P'], [KC_Q, 'Q'], [KC_R, 'R'], [KC_S, 'S'], [KC_T, 'T'],
  [KC_U, 'U'], [KC_V, 'V'], [KC_W, 'W'], [KC_X, 'X'], [KC_Y, 'Y'],
  [KC_Z, 'Z'],
  // Digits
  [KC_1, '1'], [KC_2, '2'], [KC_3, '3'], [KC_4, '4'], [KC_5, '5'],
  [KC_6, '6'], [KC_7, '7'], [KC_8, '8'], [KC_9, '9'], [KC_0, '0'],
  // Control
  [KC_ENTER, 'Enter'], [KC_ESC, 'Esc'],   [KC_BSPC, 'BkSp'],
  [KC_TAB,   'Tab'],   [KC_SPC, 'Space'],
  // Punctuation
  [KC_MINUS, '-'],  [KC_EQUAL, '='],  [KC_LBRC, '['],  [KC_RBRC, ']'],
  [KC_BSLS, '\\'], [KC_SCLN, ';'],  [KC_QUOT, "'"],  [KC_GRV,  '`'],
  [KC_COMM, ','],  [KC_DOT,  '.'],  [KC_SLSH, '/'],  [KC_NUHS, '#'],
  [KC_NUBS, '\\|'],
  // Lock / sys
  [KC_CAPS, 'Caps'],
  // Function keys
  [KC_F1,  'F1'],  [KC_F2,  'F2'],  [KC_F3,  'F3'],  [KC_F4,  'F4'],
  [KC_F5,  'F5'],  [KC_F6,  'F6'],  [KC_F7,  'F7'],  [KC_F8,  'F8'],
  [KC_F9,  'F9'],  [KC_F10, 'F10'], [KC_F11, 'F11'], [KC_F12, 'F12'],
  [KC_F13, 'F13'], [KC_F14, 'F14'], [KC_F15, 'F15'], [KC_F16, 'F16'],
  [KC_F17, 'F17'], [KC_F18, 'F18'], [KC_F19, 'F19'], [KC_F20, 'F20'],
  [KC_F21, 'F21'], [KC_F22, 'F22'], [KC_F23, 'F23'], [KC_F24, 'F24'],
  // Navigation
  [KC_PSCR, 'PrtSc'], [KC_SCRL, 'ScrLk'], [KC_PAUS, 'Pause'],
  [KC_INS,  'Ins'],   [KC_HOME, 'Home'],  [KC_PGUP, 'PgUp'],
  [KC_DEL,  'Del'],   [KC_END,  'End'],   [KC_PGDN, 'PgDn'],
  [KC_RGHT, '→'],    [KC_LEFT, '←'],    [KC_DOWN, '↓'],   [KC_UP, '↑'],
  [KC_APP,  'Menu'],
  // Numpad
  [KC_NLCK, 'NumLk'], [KC_PSLS, 'N/'],  [KC_PAST, 'N*'],
  [KC_PMNS, 'N-'],    [KC_PPLS, 'N+'],  [KC_PENT, 'N↵'],
  [KC_P1, 'N1'], [KC_P2, 'N2'], [KC_P3, 'N3'], [KC_P4, 'N4'],
  [KC_P5, 'N5'], [KC_P6, 'N6'], [KC_P7, 'N7'], [KC_P8, 'N8'],
  [KC_P9, 'N9'], [KC_P0, 'N0'], [KC_PDOT, 'N.'],
  // Modifiers
  [KC_LCTL, 'LCtrl'],  [KC_LSFT, 'LShft'], [KC_LALT, 'LAlt'],  [KC_LGUI, 'LGui'],
  [KC_RCTL, 'RCtrl'],  [KC_RSFT, 'RShft'], [KC_RALT, 'RAlt'],  [KC_RGUI, 'RGui'],
])

/** Map from display name (upper-cased) back to keycode value */
const NAME_TO_CODE = new Map<string, number>(
  Array.from(KEYCODE_NAMES.entries()).map(([code, name]) => [name.toUpperCase(), code])
)

/**
 * Return the display name for a raw QMK keycode.
 * Falls back to "0x{hex}" for unknown codes.
 */
export function keycodeName(code: number): string {
  if (KEYCODE_NAMES.has(code)) return KEYCODE_NAMES.get(code)!

  // Layer operations
  if ((code & 0xFF00) === QK_MOMENTARY)    return `MO(${code & 0xFF})`
  if ((code & 0xFF00) === QK_TO)           return `TO(${code & 0xFF})`
  if ((code & 0xFF00) === QK_TOGGLE_LAYER) return `TG(${code & 0xFF})`
  if ((code & 0xFF00) === QK_TAP_TOGGLE)   return `TT(${code & 0xFF})`
  if ((code & 0xFF00) === QK_ONE_SHOT_LAYER) return `OSL(${code & 0xFF})`
  if ((code & 0xFF00) === QK_ONE_SHOT_MOD)   return `OSM(${code & 0xFF})`

  return `0x${code.toString(16).padStart(4, '0').toUpperCase()}`
}

/**
 * Attempt to resolve a keycode name string to its numeric value.
 * Returns `undefined` for unknown names.
 */
export function keycodeFromName(name: string): number | undefined {
  const upper = name.toUpperCase()
  if (NAME_TO_CODE.has(upper)) return NAME_TO_CODE.get(upper)!

  // Layer operations  e.g. "MO(1)"
  const layerMatch = upper.match(/^(MO|TO|TG|TT|OSL)\((\d+)\)$/)
  if (layerMatch) {
    const n = parseInt(layerMatch[2], 10)
    const map: Record<string, number> = {
      MO: QK_MOMENTARY, TO: QK_TO, TG: QK_TOGGLE_LAYER,
      TT: QK_TAP_TOGGLE, OSL: QK_ONE_SHOT_LAYER,
    }
    return (map[layerMatch[1]] | n)
  }

  // Hex literal e.g. "0x003A"
  if (upper.startsWith('0X')) return parseInt(upper, 16)

  return undefined
}
