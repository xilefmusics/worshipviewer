import { describe, expect, it, vi } from 'vitest'

import {
  APPEARANCE_STORAGE_KEY,
  applyAppearancePreference,
  readAppearancePreference,
  resolveAppearancePreference,
  writeAppearancePreference,
} from '@/lib/appearance'

describe('resolveAppearancePreference', () => {
  it('keeps valid preferences', () => {
    expect(resolveAppearancePreference('light')).toBe('light')
    expect(resolveAppearancePreference('dark')).toBe('dark')
    expect(resolveAppearancePreference('system')).toBe('system')
  })

  it('falls back to system for missing or invalid values', () => {
    expect(resolveAppearancePreference(null)).toBe('system')
    expect(resolveAppearancePreference('sepia')).toBe('system')
  })
})

describe('applyAppearancePreference', () => {
  it('sets explicit light and dark themes', () => {
    const root = {
      dataset: {} as DOMStringMap,
      removeAttribute: vi.fn(),
    } as unknown as HTMLElement

    applyAppearancePreference('dark', root)
    expect(root.dataset.theme).toBe('dark')

    applyAppearancePreference('light', root)
    expect(root.dataset.theme).toBe('light')
  })

  it('removes the theme attribute for system mode', () => {
    const root = {
      dataset: { theme: 'dark' } as DOMStringMap,
      removeAttribute: vi.fn(),
    } as unknown as HTMLElement

    applyAppearancePreference('system', root)
    expect(root.removeAttribute).toHaveBeenCalledWith('data-theme')
  })
})

describe('writeAppearancePreference', () => {
  it('stores explicit preferences and removes system mode', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    writeAppearancePreference('dark', storage)
    expect(storage.setItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY, 'dark')

    writeAppearancePreference('system', storage)
    expect(storage.removeItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY)
  })
})

describe('appearance storage safety', () => {
  it('falls back to system when storage reads throw', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
    }

    expect(readAppearancePreference(storage)).toBe('system')
  })

  it('ignores storage write failures', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError')
      }),
      removeItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
    }

    expect(() => writeAppearancePreference('dark', storage)).not.toThrow()
    expect(() => writeAppearancePreference('system', storage)).not.toThrow()
  })
})
