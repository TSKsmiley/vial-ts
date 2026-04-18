// Protocol constants mirroring vial-gui src/main/python/protocol/constants.py

/** Raw HID message length in bytes */
export const MSG_LEN = 32

/** Maximum keymap/macro bytes read per HID packet */
export const BUFFER_FETCH_CHUNK = 28

// ── VIA commands ────────────────────────────────────────────────────────────

export const CMD_VIA_GET_PROTOCOL_VERSION  = 0x01
export const CMD_VIA_GET_KEYBOARD_VALUE    = 0x02
export const CMD_VIA_SET_KEYBOARD_VALUE    = 0x03
export const CMD_VIA_GET_KEYCODE           = 0x04
export const CMD_VIA_SET_KEYCODE           = 0x05
export const CMD_VIA_LIGHTING_SET_VALUE    = 0x07
export const CMD_VIA_LIGHTING_GET_VALUE    = 0x08
export const CMD_VIA_LIGHTING_SAVE         = 0x09
export const CMD_VIA_MACRO_GET_COUNT       = 0x0C
export const CMD_VIA_MACRO_GET_BUFFER_SIZE = 0x0D
export const CMD_VIA_MACRO_GET_BUFFER      = 0x0E
export const CMD_VIA_MACRO_SET_BUFFER      = 0x0F
export const CMD_VIA_GET_LAYER_COUNT       = 0x11
export const CMD_VIA_KEYMAP_GET_BUFFER     = 0x12
export const CMD_VIA_VIAL_PREFIX           = 0xFE

// ── VIA keyboard-value sub-ids ───────────────────────────────────────────────

export const VIA_LAYOUT_OPTIONS      = 0x02
export const VIA_SWITCH_MATRIX_STATE = 0x03

// ── Vial sub-commands (prefixed with CMD_VIA_VIAL_PREFIX) ───────────────────

export const CMD_VIAL_GET_KEYBOARD_ID    = 0x00
export const CMD_VIAL_GET_SIZE           = 0x01
export const CMD_VIAL_GET_DEFINITION     = 0x02
export const CMD_VIAL_GET_ENCODER        = 0x03
export const CMD_VIAL_SET_ENCODER        = 0x04
export const CMD_VIAL_GET_UNLOCK_STATUS  = 0x05
export const CMD_VIAL_UNLOCK_START       = 0x06
export const CMD_VIAL_UNLOCK_POLL        = 0x07
export const CMD_VIAL_LOCK               = 0x08
export const CMD_VIAL_QMK_SETTINGS_QUERY = 0x09
export const CMD_VIAL_QMK_SETTINGS_GET   = 0x0A
export const CMD_VIAL_QMK_SETTINGS_SET   = 0x0B
export const CMD_VIAL_QMK_SETTINGS_RESET = 0x0C
export const CMD_VIAL_DYNAMIC_ENTRY_OP   = 0x0D

// ── Dynamic entry sub-ids ────────────────────────────────────────────────────

export const DYNAMIC_VIAL_GET_NUMBER_OF_ENTRIES  = 0x00
export const DYNAMIC_VIAL_TAP_DANCE_GET          = 0x01
export const DYNAMIC_VIAL_TAP_DANCE_SET          = 0x02
export const DYNAMIC_VIAL_COMBO_GET              = 0x03
export const DYNAMIC_VIAL_COMBO_SET              = 0x04
export const DYNAMIC_VIAL_KEY_OVERRIDE_GET       = 0x05
export const DYNAMIC_VIAL_KEY_OVERRIDE_SET       = 0x06
export const DYNAMIC_VIAL_ALT_REPEAT_KEY_GET     = 0x07
export const DYNAMIC_VIAL_ALT_REPEAT_KEY_SET     = 0x08

// ── Protocol version gates ───────────────────────────────────────────────────

export const VIAL_PROTOCOL_ADVANCED_MACROS = 2
export const VIAL_PROTOCOL_MATRIX_TESTER   = 3
export const VIAL_PROTOCOL_DYNAMIC         = 4
export const VIAL_PROTOCOL_QMK_SETTINGS    = 4
export const VIAL_PROTOCOL_EXT_MACROS      = 5
export const VIAL_PROTOCOL_KEY_OVERRIDE    = 5

export const SUPPORTED_VIA_PROTOCOL  = new Set([-1, 9])
export const SUPPORTED_VIAL_PROTOCOL = new Set([-1, 0, 1, 2, 3, 4, 5, 6])

// ── WebHID ───────────────────────────────────────────────────────────────────

/** WebHID filter – matches VIA/Vial raw-HID interface (usage page 0xFF60, usage 0x61) */
export const VIAL_HID_FILTERS: HIDDeviceFilter[] = [
  { usagePage: 0xFF60, usage: 0x61 },
]
