import { describe, expect, it } from 'vitest'

import {
  AV_BLACKOUT_SHORTCUT_KEY,
  AV_BLANK_SHORTCUT_KEY,
  AV_OPEN_OUTPUT_SHORTCUT_KEY,
  AV_SECTION_JUMP_SHORTCUTS,
  avKeyboardAction,
} from '@/lib/player/av-keyboard'

// Flow: J3 — Player AV tab option surfaces
describe('J3: Player AV tab options', () => {
  it('J3: live screen shortcut keys (blank, blackout, output)', () => {
    expect(avKeyboardAction(AV_BLANK_SHORTCUT_KEY, null)).toBe('toggleBlank')
    expect(avKeyboardAction(AV_BLACKOUT_SHORTCUT_KEY, null)).toBe('toggleBlackout')
    expect(avKeyboardAction(AV_OPEN_OUTPUT_SHORTCUT_KEY, null)).toBe('openOutput')
  })

  it('J3: section jump shortcuts c/v/p/1-9/b/t/e', () => {
    const keys = AV_SECTION_JUMP_SHORTCUTS.map((s) => s.key)
    expect(keys).toContain('c')
    expect(keys).toContain('v')
    expect(keys).toContain('1')
    expect(keys.length).toBeGreaterThanOrEqual(9)
  })
})
