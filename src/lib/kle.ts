/**
 * KLE (Keyboard Layout Editor) parser for Vial keyboard definitions.
 *
 * The Vial firmware embeds a KLE-format keymap in the keyboard definition JSON
 * (`layouts.keymap`).  Each key's label is "row,col" (the matrix position).
 * Physical positions and rotations are expressed with KLE property objects.
 *
 * KLE state machine rules:
 *   - The outer array contains rows (sub-arrays).  Non-array outer items
 *     (e.g. metadata objects) are skipped.
 *   - Within a row, an object before a string key sets modifiers:
 *       x / y  – add to the cursor position for the next key (then reset to 0)
 *       w / h  – set key width/height (reset to 1 after each key)
 *       r      – set rotation degrees (persists across keys/rows)
 *       rx     – set rotation-origin X and reset cursor X to rx (persists)
 *       ry     – set rotation-origin Y and reset cursor Y to ry (persists)
 *   - After placing a key, cursor X advances by w.
 *   - After each row, cursor Y advances by 1 and cursor X resets to rx.
 *
 * Layout options:
 *   Vial keyboards can have alternative physical positions for certain keys
 *   (e.g. splay vs. straight thumb cluster).  A key that belongs to a layout
 *   option group has a third '\n'-separated label segment "groupIdx,optionValue".
 *   The `selectedOptions` parameter specifies which option value is active for
 *   each group (index = group index, value = selected option).  Keys whose
 *   option value doesn't match are skipped.  Defaults to all-zeros (the
 *   firmware's default layout option).
 */

import type { LayoutKey } from './types'

export function parseKleLayout(
  kleRows: unknown[],
  selectedOptions: readonly number[] = [],
): LayoutKey[] {
  if (!Array.isArray(kleRows)) return []
  const keys: LayoutKey[] = []

  // Persistent rotation-cluster state
  let r = 0, rx = 0, ry = 0
  // Cursor position
  let x = 0, y = 0

  for (const row of kleRows) {
    if (!Array.isArray(row)) continue   // skip metadata/label objects

    let w = 1, h = 1   // key size – reset to 1 after each key
    let dx = 0, dy = 0 // pending cursor delta – reset after each key

    for (const item of row) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const mod = item as Record<string, unknown>
        if (typeof mod['r']  === 'number') r  = mod['r']
        if (typeof mod['rx'] === 'number') { rx = mod['rx']; x = rx }
        if (typeof mod['ry'] === 'number') { ry = mod['ry']; y = ry }
        if (typeof mod['x']  === 'number') dx += mod['x']
        if (typeof mod['y']  === 'number') dy += mod['y']
        if (typeof mod['w']  === 'number') w  = mod['w']
        if (typeof mod['h']  === 'number') h  = mod['h']
      } else if (typeof item === 'string') {
        // Apply pending deltas before placing the key
        x += dx; dx = 0
        y += dy; dy = 0

        // Vial labels are "row,col[\nlayout_label[\ngroupIdx,optionValue]]"
        const lines = item.split('\n')
        const label = lines[0] ?? ''
        const match = /^(\d+),(\d+)$/.exec(label)
        if (match) {
          // Check layout option filter (3rd line, e.g. "0,1")
          let include = true
          const optLine = (lines[2] ?? '').trim()
          if (optLine) {
            const optMatch = /^(\d+),(\d+)$/.exec(optLine)
            if (optMatch) {
              const groupIdx   = +optMatch[1]
              const optionVal  = +optMatch[2]
              const selected   = selectedOptions[groupIdx] ?? 0
              if (optionVal !== selected) include = false
            }
          }
          if (include) {
            keys.push({ row: +match[1], col: +match[2], x, y, w, h, r, rx, ry })
          }
        }

        x += w   // advance cursor by key width (even for skipped keys)
        w = 1; h = 1
      }
    }

    // End of row: advance Y, reset X to the current rotation-cluster origin
    y += 1
    x = rx
  }

  return keys
}
