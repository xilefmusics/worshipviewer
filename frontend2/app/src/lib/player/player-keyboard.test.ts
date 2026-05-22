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
  const body = mockTarget('BODY')

  it('maps navigation keys on body', () => {
    expect(playerKeyboardAction('ArrowRight', body)).toBe('next')
    expect(playerKeyboardAction('ArrowDown', body)).toBe('next')
    expect(playerKeyboardAction('PageDown', body)).toBe('next')
    expect(playerKeyboardAction('Enter', body)).toBe('next')
    expect(playerKeyboardAction('j', body)).toBe('next')

    expect(playerKeyboardAction('PageUp', body)).toBe('prev')
    expect(playerKeyboardAction('ArrowUp', body)).toBe('prev')
    expect(playerKeyboardAction('ArrowLeft', body)).toBe('prev')
    expect(playerKeyboardAction('Backspace', body)).toBe('prev')
    expect(playerKeyboardAction('k', body)).toBe('prev')

    expect(playerKeyboardAction('Home', body)).toBe('home')
    expect(playerKeyboardAction('End', body)).toBe('end')
  })

  it('maps chrome, scroll, edit, like, and chord format shortcuts', () => {
    expect(playerKeyboardAction('m', body)).toBe('toggleChrome')
    expect(playerKeyboardAction('s', body)).toBe('cycleScroll')
    expect(playerKeyboardAction('e', body)).toBe('edit')
    expect(playerKeyboardAction('l', body)).toBe('toggleLike')
    expect(playerKeyboardAction('n', body)).toBe('toggleChordFormat')
  })

  it('maps transpose shortcuts with case sensitivity', () => {
    expect(playerKeyboardAction('B', body)).toEqual({ type: 'setTransposeKey', key: 'B' })
    expect(playerKeyboardAction('b', body)).toBe('transposeDown')
    expect(playerKeyboardAction('-', body)).toBe('transposeDown')
    expect(playerKeyboardAction('#', body)).toBe('transposeUp')
    expect(playerKeyboardAction('+', body)).toBe('transposeUp')
    expect(playerKeyboardAction('r', body)).toBe('resetTranspose')
    expect(playerKeyboardAction('G', body)).toEqual({ type: 'setTransposeKey', key: 'G' })
  })

  it('returns escape for Escape key', () => {
    expect(playerKeyboardAction('Escape', body)).toBe('escape')
    expect(playerKeyboardAction('Escape', body, { popoverOpen: true })).toBe('escape')
  })

  it('ignores shortcuts when an input is focused', () => {
    const input = mockTarget('INPUT')
    expect(playerKeyboardAction('ArrowRight', input)).toBeNull()
    expect(playerKeyboardAction('m', input)).toBeNull()
    expect(playerKeyboardAction('G', input)).toBeNull()
  })

  it('allows transpose keys when popover is open but blocks navigation', () => {
    expect(playerKeyboardAction('G', body, { popoverOpen: true })).toEqual({
      type: 'setTransposeKey',
      key: 'G',
    })
    expect(playerKeyboardAction('r', body, { popoverOpen: true })).toBe('resetTranspose')
    expect(playerKeyboardAction('ArrowRight', body, { popoverOpen: true })).toBeNull()
    expect(playerKeyboardAction('m', body, { popoverOpen: true })).toBeNull()
  })

  it('returns null for unmapped keys', () => {
    expect(playerKeyboardAction('t', body)).toBeNull()
    expect(playerKeyboardAction('q', body)).toBeNull()
  })
})
