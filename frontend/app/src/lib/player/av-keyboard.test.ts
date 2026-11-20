import { describe, expect, it } from 'vitest'

import {
  avKeyboardAction,
  avAvailableSectionJumpShortcuts,
  avSectionJumpShortcutForEvent,
  avSectionJumpTitle,
} from '@/lib/player/av-keyboard'
import type { AvSectionOutline } from '@/lib/player/av-lyric-slides'

function mockTarget(tagName: string): EventTarget {
  return {
    tagName,
    isContentEditable: false,
    closest: () => null,
  } as unknown as EventTarget
}

function section(title: string, len = 1): AvSectionOutline {
  return {
    title,
    textIdx: 0,
    outlineIdx: 0,
    len,
    duplicate: false,
    hasText: true,
  }
}

function keyboardEvent(
  key: string,
  code: string,
  modifiers: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
): Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'> {
  return {
    key,
    code,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    metaKey: modifiers.metaKey ?? false,
  }
}

describe('avKeyboardAction', () => {
  const body = mockTarget('BODY')

  it('maps navigation keys', () => {
    expect(avKeyboardAction('ArrowRight', body)).toBe('next')
    expect(avKeyboardAction('ArrowLeft', body)).toBe('prev')
    expect(avKeyboardAction('Home', body)).toBe('home')
    expect(avKeyboardAction('End', body)).toBe('end')
  })

  it('maps blank, blackout, output, and section jump keys', () => {
    expect(avKeyboardAction('r', body)).toBe('toggleBlank')
    expect(avKeyboardAction('R', body)).toBe('toggleBlackout')
    expect(avKeyboardAction('o', body)).toBe('openOutput')
    expect(avKeyboardAction('b', body)).toBe('jumpSection')
    expect(avKeyboardAction('c', body)).toBe('jumpSection')
    expect(avKeyboardAction('p', body)).toBe('jumpSection')
    expect(avKeyboardAction('5', body)).toBe('jumpSection')
    expect(avKeyboardAction('9', body)).toBe('jumpSection')
    expect(avKeyboardAction('t', body)).toBe('jumpSection')
    expect(avKeyboardAction('e', body)).toBe('jumpSection')
  })

  it('recognizes direct occurrence modifier variants', () => {
    expect(avKeyboardAction(keyboardEvent('C', 'KeyC', { shiftKey: true }), body)).toBe('jumpSection')
    expect(avKeyboardAction(keyboardEvent('ç', 'KeyC', { altKey: true }), body)).toBe('jumpSection')
    expect(avKeyboardAction(
      keyboardEvent('Ç', 'KeyC', { shiftKey: true, altKey: true }),
      body,
    )).toBe('jumpSection')
    expect(avKeyboardAction(keyboardEvent('C', 'KeyC', { ctrlKey: true }), body)).toBeNull()
  })

  it('keeps the language-mode Tag shortcut on G rather than T', () => {
    expect(avKeyboardAction(
      keyboardEvent('G', 'KeyG', { shiftKey: true }),
      body,
      { languageShortcuts: true },
    )).toBe('jumpSection')
    expect(avKeyboardAction(
      keyboardEvent('T', 'KeyT', { shiftKey: true }),
      body,
      { languageShortcuts: true },
    )).toBeNull()
  })

  it('ignores input targets', () => {
    expect(avKeyboardAction('ArrowRight', mockTarget('INPUT'))).toBeNull()
    expect(avKeyboardAction('R', mockTarget('INPUT'))).toBeNull()
  })
})

describe('avSectionJumpTitle', () => {
  it('returns section titles for base jump keys', () => {
    expect(avSectionJumpTitle('c')).toBe('Chorus')
    expect(avSectionJumpTitle('1')).toBe('Verse 1')
    expect(avSectionJumpTitle('p')).toBe('Pre-Chorus')
    expect(avSectionJumpTitle('5')).toBe('Verse 5')
    expect(avSectionJumpTitle('9')).toBe('Verse 9')
    expect(avSectionJumpTitle('b')).toBe('Bridge')
    expect(avSectionJumpTitle('t')).toBe('Tag')
    expect(avSectionJumpTitle('e')).toBe('Ending')
    expect(avSectionJumpTitle('g', true)).toBe('Tag')
  })
})

describe('avAvailableSectionJumpShortcuts', () => {
  it('offers separate keys and slide targets for repeated exact titles', () => {
    const outline = [section('Chorus'), section('Verse 1'), section('Chorus')]

    expect(avAvailableSectionJumpShortcuts(outline)).toEqual([
      {
        key: 'c',
        sectionTitle: 'Chorus',
        occurrence: 1,
        slideIndex: 0,
        keyLabel: 'C',
      },
      {
        key: 'c',
        sectionTitle: 'Chorus (2)',
        occurrence: 2,
        slideIndex: 2,
        keyLabel: 'Shift+C',
      },
      {
        key: '1',
        sectionTitle: 'Verse 1',
        occurrence: 1,
        slideIndex: 1,
        keyLabel: '1',
      },
    ])
  })

  it('groups explicitly numbered titles while preserving Verse 1–9 keys', () => {
    const outline = [
      section('Chorus 1'),
      section('Chorus 2'),
      section('Verse 1'),
      section('Verse 2'),
    ]
    const shortcuts = avAvailableSectionJumpShortcuts(outline)

    expect(shortcuts.filter((shortcut) => shortcut.key === 'c').map((shortcut) => [
      shortcut.sectionTitle,
      shortcut.occurrence,
      shortcut.keyLabel,
      shortcut.slideIndex,
    ])).toEqual([
      ['Chorus 1', 1, 'C', 0],
      ['Chorus 2', 2, 'Shift+C', 1],
    ])
    expect(shortcuts.filter((shortcut) => ['1', '2'].includes(shortcut.key)).map((shortcut) => [
      shortcut.key,
      shortcut.sectionTitle,
      shortcut.slideIndex,
    ])).toEqual([
      ['1', 'Verse 1', 2],
      ['2', 'Verse 2', 3],
    ])
    expect(shortcuts.some((shortcut) => shortcut.key === 'v')).toBe(false)
  })

  it('assigns the selected modifier scheme and leaves later repeats button-only', () => {
    const outline = Array.from({ length: 5 }, () => section('Chorus'))
    const shortcuts = avAvailableSectionJumpShortcuts(outline)

    expect(shortcuts.map((shortcut) => shortcut.keyLabel)).toEqual([
      'C',
      'Shift+C',
      'Alt+C',
      'Shift+Alt+C',
      null,
    ])
    expect(shortcuts[4]?.sectionTitle).toBe('Chorus (5)')
    expect(shortcuts[4]?.keyLabel).toBeNull()
  })

  it('remaps Tag to G when language shortcuts are active', () => {
    const shortcuts = avAvailableSectionJumpShortcuts([section('Tag'), section('Tag')], true)

    expect(shortcuts.map((shortcut) => [shortcut.key, shortcut.keyLabel])).toEqual([
      ['g', 'G'],
      ['g', 'Shift+G'],
    ])
  })
})

describe('avSectionJumpShortcutForEvent', () => {
  const outline = [section('Chorus 1'), section('Chorus 2'), section('Chorus 3'), section('Chorus 4')]

  it('resolves each direct modifier shortcut to its matching occurrence', () => {
    expect(avSectionJumpShortcutForEvent(keyboardEvent('c', 'KeyC'), outline)?.sectionTitle).toBe('Chorus 1')
    expect(avSectionJumpShortcutForEvent(
      keyboardEvent('C', 'KeyC', { shiftKey: true }),
      outline,
    )?.sectionTitle).toBe('Chorus 2')
    expect(avSectionJumpShortcutForEvent(
      keyboardEvent('ç', 'KeyC', { altKey: true }),
      outline,
    )?.sectionTitle).toBe('Chorus 3')
    expect(avSectionJumpShortcutForEvent(
      keyboardEvent('Ç', 'KeyC', { shiftKey: true, altKey: true }),
      outline,
    )?.sectionTitle).toBe('Chorus 4')
  })

  it('supports the Tag alias and ignores modified shortcuts when unavailable', () => {
    const tagOutline = [section('Tag'), section('Tag')]
    expect(avSectionJumpShortcutForEvent(keyboardEvent('g', 'KeyG'), tagOutline, true)?.sectionTitle)
      .toBe('Tag')
    expect(avSectionJumpShortcutForEvent(
      keyboardEvent('G', 'KeyG', { shiftKey: true }),
      tagOutline,
      true,
    )?.occurrence).toBe(2)
    expect(avSectionJumpShortcutForEvent(
      keyboardEvent('C', 'KeyC', { shiftKey: true }),
      [section('Chorus')],
    )).toBeNull()
    expect(avSectionJumpShortcutForEvent(
      keyboardEvent('c', 'KeyC', { ctrlKey: true }),
      outline,
    )).toBeNull()
  })
})
