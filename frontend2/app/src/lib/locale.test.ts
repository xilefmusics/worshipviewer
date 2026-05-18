import { describe, expect, it } from 'vitest'

import {
  mapLanguagesToLocale,
  resolveInitialLocale,
  resolveLocalePreference,
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
