import { describe, expect, it } from 'vitest'

import { avKeyboardAction, avSectionJumpTitle } from '@/lib/player/av-keyboard'

function mockTarget(tagName: string): EventTarget {
  return {
    tagName,
    isContentEditable: false,
    closest: () => null,
  } as unknown as EventTarget
}

describe('avKeyboardAction', () => {
  const body = mockTarget('BODY')

  it('maps navigation keys', () => {
    expect(avKeyboardAction('ArrowRight', body)).toBe('next')
    expect(avKeyboardAction('ArrowLeft', body)).toBe('prev')
    expect(avKeyboardAction('Home', body)).toBe('home')
    expect(avKeyboardAction('End', body)).toBe('end')
  })

  it('maps blackout keys', () => {
    expect(avKeyboardAction('R', body)).toBe('blackoutOn')
    expect(avKeyboardAction('r', body)).toBe('blackoutOff')
    expect(avKeyboardAction('b', body)).toBe('toggleBlackout')
  })

  it('ignores input targets', () => {
    expect(avKeyboardAction('ArrowRight', mockTarget('INPUT'))).toBeNull()
  })
})

describe('avSectionJumpTitle', () => {
  it('returns section titles for jump keys', () => {
    expect(avSectionJumpTitle('c')).toBe('Chorus')
    expect(avSectionJumpTitle('1')).toBe('Verse 1')
  })
})
