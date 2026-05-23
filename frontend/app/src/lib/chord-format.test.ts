import { describe, expect, it, vi } from 'vitest'

import {
  CHORD_FORMAT_STORAGE_KEY,
  chordFormatToRepresentation,
  resolveChordFormatPreference,
  writeChordFormatPreference,
} from '@/lib/chord-format'

describe('resolveChordFormatPreference', () => {
  it('keeps valid preferences', () => {
    expect(resolveChordFormatPreference('letters')).toBe('letters')
    expect(resolveChordFormatPreference('nashville')).toBe('nashville')
  })

  it('falls back to letters for missing or invalid values', () => {
    expect(resolveChordFormatPreference(null)).toBe('letters')
    expect(resolveChordFormatPreference('roman')).toBe('letters')
  })
})

describe('chordFormatToRepresentation', () => {
  it('maps settings values to chord engine representation', () => {
    expect(chordFormatToRepresentation('letters')).toBe('default')
    expect(chordFormatToRepresentation('nashville')).toBe('nashville')
  })
})

describe('writeChordFormatPreference', () => {
  it('stores the preference', () => {
    const storage = { setItem: vi.fn() }

    writeChordFormatPreference('nashville', storage)
    expect(storage.setItem).toHaveBeenCalledWith(CHORD_FORMAT_STORAGE_KEY, 'nashville')
  })

  it('notifies listeners when window is available', () => {
    const listener = vi.fn()
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    vi.stubGlobal('window', { addEventListener, removeEventListener, dispatchEvent: vi.fn() })

    globalThis.window.addEventListener('wv-chord-format-change', listener)
    writeChordFormatPreference('nashville', { setItem: vi.fn() })

    expect(globalThis.window.dispatchEvent).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
