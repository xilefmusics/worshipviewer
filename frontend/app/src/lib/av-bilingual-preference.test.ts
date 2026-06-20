import { describe, expect, it, vi } from 'vitest'

import {
  AV_BILINGUAL_STORAGE_KEY,
  readAvBilingualPreference,
  writeAvBilingualPreference,
} from '@/lib/av-bilingual-preference'

describe('readAvBilingualPreference', () => {
  it('defaults to false when unset', () => {
    expect(readAvBilingualPreference({ getItem: () => null })).toBe(false)
  })

  it('reads stored boolean strings', () => {
    expect(readAvBilingualPreference({ getItem: () => 'true' })).toBe(true)
    expect(readAvBilingualPreference({ getItem: () => 'false' })).toBe(false)
  })

  it('falls back to false for malformed storage', () => {
    expect(readAvBilingualPreference({ getItem: () => 'yes' })).toBe(false)
  })
})

describe('writeAvBilingualPreference', () => {
  it('stores and clears the preference', () => {
    const storage = new Map<string, string>()
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    }

    writeAvBilingualPreference(true, mockStorage)
    expect(storage.get(AV_BILINGUAL_STORAGE_KEY)).toBe('true')
    writeAvBilingualPreference(false, mockStorage)
    expect(storage.has(AV_BILINGUAL_STORAGE_KEY)).toBe(false)
  })

  it('notifies listeners when window is available', () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    writeAvBilingualPreference(true, { setItem: vi.fn(), removeItem: vi.fn() })

    expect(dispatchEvent).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
