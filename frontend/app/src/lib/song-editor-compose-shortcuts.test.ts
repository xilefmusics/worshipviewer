import { describe, expect, it, vi } from 'vitest'

import {
  chordEraserModeShortcutLabel,
  chordPlacementModeShortcutLabel,
  chordSimplifyModeShortcutLabel,
  isChordEraserModeShortcut,
  isChordPlacementModeShortcut,
  isChordSimplifyModeShortcut,
} from '@/lib/song-editor-compose-shortcuts'

describe('isChordPlacementModeShortcut', () => {
  it('matches Meta+P and Ctrl+P without modifiers', () => {
    expect(
      isChordPlacementModeShortcut({
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: 'KeyP',
      }),
    ).toBe(true)
    expect(
      isChordPlacementModeShortcut({
        altKey: false,
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        code: 'KeyP',
      }),
    ).toBe(true)
  })

  it('rejects Alt+C and plain P', () => {
    expect(
      isChordPlacementModeShortcut({
        altKey: true,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        code: 'KeyC',
      }),
    ).toBe(false)
    expect(
      isChordPlacementModeShortcut({
        altKey: false,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        code: 'KeyP',
      }),
    ).toBe(false)
  })
})

describe('isChordEraserModeShortcut', () => {
  it('matches Meta+E and Ctrl+E without modifiers', () => {
    expect(
      isChordEraserModeShortcut({
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: 'KeyE',
      }),
    ).toBe(true)
    expect(
      isChordEraserModeShortcut({
        altKey: false,
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        code: 'KeyE',
      }),
    ).toBe(true)
  })

  it('rejects plain E', () => {
    expect(
      isChordEraserModeShortcut({
        altKey: false,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        code: 'KeyE',
      }),
    ).toBe(false)
  })
})

describe('chordPlacementModeShortcutLabel', () => {
  it('uses the command symbol on macOS', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(chordPlacementModeShortcutLabel()).toBe('⌘P')
    vi.unstubAllGlobals()
  })

  it('uses Ctrl on other platforms', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(chordPlacementModeShortcutLabel()).toBe('Ctrl+P')
    vi.unstubAllGlobals()
  })
})

describe('chordEraserModeShortcutLabel', () => {
  it('uses the command symbol on macOS', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(chordEraserModeShortcutLabel()).toBe('⌘E')
    vi.unstubAllGlobals()
  })

  it('uses Ctrl on other platforms', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(chordEraserModeShortcutLabel()).toBe('Ctrl+E')
    vi.unstubAllGlobals()
  })
})

describe('isChordSimplifyModeShortcut', () => {
  it('matches Meta+S and Ctrl+S without modifiers', () => {
    expect(
      isChordSimplifyModeShortcut({
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: 'KeyS',
      }),
    ).toBe(true)
    expect(
      isChordSimplifyModeShortcut({
        altKey: false,
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        code: 'KeyS',
      }),
    ).toBe(true)
  })

  it('rejects plain S', () => {
    expect(
      isChordSimplifyModeShortcut({
        altKey: false,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        code: 'KeyS',
      }),
    ).toBe(false)
  })
})

describe('chordSimplifyModeShortcutLabel', () => {
  it('uses the command symbol on macOS', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(chordSimplifyModeShortcutLabel()).toBe('⌘S')
    vi.unstubAllGlobals()
  })

  it('uses Ctrl on other platforms', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(chordSimplifyModeShortcutLabel()).toBe('Ctrl+S')
    vi.unstubAllGlobals()
  })
})
