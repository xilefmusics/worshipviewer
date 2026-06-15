import { describe, expect, it, vi } from 'vitest'

import {
  applySheetBackgroundPreference,
  readSheetBackgroundPreference,
  resolveSheetBackgroundPreference,
  SHEET_BACKGROUND_STORAGE_KEY,
  writeSheetBackgroundPreference,
} from '@/lib/sheet-background'

describe('resolveSheetBackgroundPreference', () => {
  it('keeps valid preferences', () => {
    expect(resolveSheetBackgroundPreference('white')).toBe('white')
    expect(resolveSheetBackgroundPreference('app')).toBe('app')
  })

  it('falls back to app for missing or invalid values', () => {
    expect(resolveSheetBackgroundPreference(null)).toBe('app')
    expect(resolveSheetBackgroundPreference('paper')).toBe('app')
  })
})

describe('applySheetBackgroundPreference', () => {
  it('sets the app background attribute', () => {
    const root = {
      dataset: {} as DOMStringMap,
      removeAttribute: vi.fn(),
    } as unknown as HTMLElement

    applySheetBackgroundPreference('app', root)
    expect(root.dataset.sheetBackground).toBe('app')
  })

  it('removes the attribute for white', () => {
    const root = {
      dataset: { sheetBackground: 'app' } as DOMStringMap,
      removeAttribute: vi.fn(),
    } as unknown as HTMLElement

    applySheetBackgroundPreference('white', root)
    expect(root.removeAttribute).toHaveBeenCalledWith('data-sheet-background')
  })
})

describe('writeSheetBackgroundPreference', () => {
  it('stores white and clears app', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    writeSheetBackgroundPreference('white', storage)
    expect(storage.setItem).toHaveBeenCalledWith(SHEET_BACKGROUND_STORAGE_KEY, 'white')

    writeSheetBackgroundPreference('app', storage)
    expect(storage.removeItem).toHaveBeenCalledWith(SHEET_BACKGROUND_STORAGE_KEY)
  })

  it('notifies listeners when window is available', () => {
    const root = {
      dataset: {} as DOMStringMap,
      removeAttribute: vi.fn(),
    } as unknown as HTMLElement
    vi.stubGlobal('document', { documentElement: root })
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })

    writeSheetBackgroundPreference('app', { setItem: vi.fn(), removeItem: vi.fn() })

    expect(globalThis.window.dispatchEvent).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('sheet background storage safety', () => {
  it('falls back to app when storage reads throw', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
    }

    expect(readSheetBackgroundPreference(storage)).toBe('app')
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

    expect(() => writeSheetBackgroundPreference('white', storage)).not.toThrow()
    expect(() => writeSheetBackgroundPreference('app', storage)).not.toThrow()
  })
})
