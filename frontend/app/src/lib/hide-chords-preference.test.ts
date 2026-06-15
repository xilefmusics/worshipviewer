import { describe, expect, it, vi } from 'vitest'

import {
  HIDE_CHORDS_STORAGE_KEY,
  readHideChordsPreference,
  writeHideChordsPreference,
} from '@/lib/hide-chords-preference'

describe('readHideChordsPreference', () => {
  it('returns false when unset', () => {
    expect(readHideChordsPreference({ getItem: () => null })).toBe(false)
  })

  it('returns true when stored as true', () => {
    expect(readHideChordsPreference({ getItem: () => 'true' })).toBe(true)
  })
})

describe('writeHideChordsPreference', () => {
  it('stores enabled preference', () => {
    const storage = { setItem: vi.fn(), removeItem: vi.fn() }

    writeHideChordsPreference(true, storage)
    expect(storage.setItem).toHaveBeenCalledWith(HIDE_CHORDS_STORAGE_KEY, 'true')
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('removes preference when disabled', () => {
    const storage = { setItem: vi.fn(), removeItem: vi.fn() }

    writeHideChordsPreference(false, storage)
    expect(storage.removeItem).toHaveBeenCalledWith(HIDE_CHORDS_STORAGE_KEY)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('notifies listeners when window is available', () => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })

    writeHideChordsPreference(true, { setItem: vi.fn(), removeItem: vi.fn() })

    expect(globalThis.window.dispatchEvent).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
