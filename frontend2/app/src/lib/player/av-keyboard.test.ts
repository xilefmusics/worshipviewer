import { describe, expect, it } from 'vitest'

import { avKeyboardAction, avAvailableSectionJumpShortcuts, avSectionJumpTitle } from '@/lib/player/av-keyboard'
import type { AvSectionOutline } from '@/lib/player/av-lyric-slides'

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

  it('maps blackout and section jump keys', () => {
    expect(avKeyboardAction('r', body)).toBe('toggleBlackout')
    expect(avKeyboardAction('b', body)).toBe('jumpSection')
    expect(avKeyboardAction('c', body)).toBe('jumpSection')
    expect(avKeyboardAction('t', body)).toBe('jumpSection')
    expect(avKeyboardAction('e', body)).toBe('jumpSection')
  })

  it('ignores input targets', () => {
    expect(avKeyboardAction('ArrowRight', mockTarget('INPUT'))).toBeNull()
  })
})

describe('avSectionJumpTitle', () => {
  it('returns section titles for jump keys', () => {
    expect(avSectionJumpTitle('c')).toBe('Chorus')
    expect(avSectionJumpTitle('1')).toBe('Verse 1')
    expect(avSectionJumpTitle('b')).toBe('Bridge')
    expect(avSectionJumpTitle('t')).toBe('Tag')
    expect(avSectionJumpTitle('e')).toBe('Ending')
  })
})

describe('avAvailableSectionJumpShortcuts', () => {
  const outline: AvSectionOutline[] = [
    {
      title: 'Verse 1',
      textIdx: 0,
      outlineIdx: 0,
      len: 1,
      duplicate: false,
      hasText: true,
    },
    {
      title: 'Chorus',
      textIdx: 1,
      outlineIdx: 1,
      len: 2,
      duplicate: false,
      hasText: true,
    },
  ]

  it('returns shortcuts only for sections present in the outline', () => {
    expect(avAvailableSectionJumpShortcuts(outline)).toEqual([
      { key: 'c', sectionTitle: 'Chorus' },
      { key: '1', sectionTitle: 'Verse 1' },
    ])
  })
})
