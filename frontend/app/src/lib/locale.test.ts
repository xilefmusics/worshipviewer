import { describe, expect, it } from 'vitest'

import {
  BROWSER_LOCALE_FLAG_KEY,
  LOCALE_STORAGE_KEY,
  ensureBrowserLocaleStorage,
  mapLanguagesToLocale,
  readLocalePreference,
  resolveInitialLocale,
  resolveLocalePreference,
  writeBrowserLocalePreference,
  writeExplicitLocalePreference,
} from '@/lib/locale'

describe('mapLanguagesToLocale', () => {
  it('maps de variants', () => {
    expect(mapLanguagesToLocale(['de-DE', 'en-US'])).toBe('de')
  })
  it('maps en variants', () => {
    expect(mapLanguagesToLocale(['en-GB'])).toBe('en')
  })
  it('falls back to english for unknown', () => {
    expect(mapLanguagesToLocale(['fr-FR'])).toBe('en')
  })
})

describe('resolveInitialLocale', () => {
  it('prefers lang query over storage', () => {
    const p = new URLSearchParams('lang=de')
    expect(resolveInitialLocale(p, 'en', ['en-US'], '1')).toBe('de')
  })
  it('uses stored locale', () => {
    const p = new URLSearchParams('')
    expect(resolveInitialLocale(p, 'de', ['en-US'])).toBe('de')
  })
  it('uses browser languages when browser default is selected', () => {
    const p = new URLSearchParams('')
    expect(resolveInitialLocale(p, 'en', ['de-DE'], '1')).toBe('de')
  })
})

describe('resolveLocalePreference', () => {
  it('prefers browser mode when the flag is set', () => {
    expect(resolveLocalePreference('de', '1')).toBe('browser')
  })
  it('uses stored locale when browser mode is not set', () => {
    expect(resolveLocalePreference('de', null)).toBe('de')
  })
  it('falls back to browser mode for invalid stored values', () => {
    expect(resolveLocalePreference('fr', null)).toBe('browser')
  })
})

describe('locale preference storage', () => {
  it('defaults to browser without an explicit locale key', () => {
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

    expect(readLocalePreference(mockStorage)).toBe('browser')
    ensureBrowserLocaleStorage(mockStorage)
    expect(storage.get(BROWSER_LOCALE_FLAG_KEY)).toBe('1')
    expect(storage.has(LOCALE_STORAGE_KEY)).toBe(false)
  })

  it('stores explicit locales without the browser flag', () => {
    const storage = new Map<string, string>([[BROWSER_LOCALE_FLAG_KEY, '1']])
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    }

    writeExplicitLocalePreference('de', mockStorage)
    expect(storage.get(LOCALE_STORAGE_KEY)).toBe('de')
    expect(storage.has(BROWSER_LOCALE_FLAG_KEY)).toBe(false)
    expect(readLocalePreference(mockStorage)).toBe('de')
  })

  it('clears explicit locale when switching back to browser', () => {
    const storage = new Map<string, string>([[LOCALE_STORAGE_KEY, 'en']])
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    }

    writeBrowserLocalePreference(mockStorage)
    expect(storage.get(BROWSER_LOCALE_FLAG_KEY)).toBe('1')
    expect(storage.has(LOCALE_STORAGE_KEY)).toBe(false)
    expect(readLocalePreference(mockStorage)).toBe('browser')
  })
})
