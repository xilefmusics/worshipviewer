import { describe, expect, it } from 'vitest'

import { playerKeyboardAction } from '@/lib/player/player-keyboard'

function mockTarget(tagName: string): EventTarget {
  return {
    tagName,
    isContentEditable: false,
    closest: () => null,
  } as unknown as EventTarget
}

describe('playerKeyboardAction', () => {
  it('maps navigation keys on body', () => {
    const body = mockTarget('BODY')
    expect(playerKeyboardAction('ArrowRight', body)).toBe('next')
    expect(playerKeyboardAction('PageUp', body)).toBe('prev')
    expect(playerKeyboardAction('t', body)).toBeNull()
  })

  it('ignores shortcuts when an input is focused', () => {
    const input = mockTarget('INPUT')
    expect(playerKeyboardAction('ArrowRight', input)).toBeNull()
  })

  it('returns escape when popover is open and blocks other keys', () => {
    const body = mockTarget('BODY')
    expect(playerKeyboardAction('Escape', body, { popoverOpen: true })).toBe('escape')
    expect(playerKeyboardAction('ArrowRight', body, { popoverOpen: true })).toBeNull()
  })
})
