import { describe, expect, it, vi } from 'vitest'

import {
  TOC_MULTILINGUAL_STORAGE_KEY,
  readTocMultilingualPreference,
  writeTocMultilingualPreference,
} from '@/lib/toc-multilingual-preference'

describe('readTocMultilingualPreference', () => {
  it('defaults to false when unset', () => {
    expect(readTocMultilingualPreference({ getItem: () => null })).toBe(false)
  })

  it('reads stored boolean strings', () => {
    expect(readTocMultilingualPreference({ getItem: () => 'true' })).toBe(true)
    expect(readTocMultilingualPreference({ getItem: () => 'false' })).toBe(false)
  })

  it('falls back to false for malformed storage', () => {
    expect(readTocMultilingualPreference({ getItem: () => 'yes' })).toBe(false)
  })
})

describe('writeTocMultilingualPreference', () => {
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

    writeTocMultilingualPreference(true, mockStorage)
    expect(storage.get(TOC_MULTILINGUAL_STORAGE_KEY)).toBe('true')
    writeTocMultilingualPreference(false, mockStorage)
    expect(storage.has(TOC_MULTILINGUAL_STORAGE_KEY)).toBe(false)
  })

  it('notifies listeners when window is available', () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    writeTocMultilingualPreference(true, { setItem: vi.fn(), removeItem: vi.fn() })

    expect(dispatchEvent).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
