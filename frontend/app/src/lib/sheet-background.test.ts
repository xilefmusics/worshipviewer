import { describe, expect, it, vi } from 'vitest'

import {
  applySheetBackgroundPreference,
  resolveSheetBackgroundPreference,
  SHEET_BACKGROUND_STORAGE_KEY,
  writeSheetBackgroundPreference,
} from '@/lib/sheet-background'

describe('resolveSheetBackgroundPreference', () => {
  it('keeps valid preferences', () => {
    expect(resolveSheetBackgroundPreference('white')).toBe('white')
    expect(resolveSheetBackgroundPreference('app')).toBe('app')
  })

  it('falls back to white for missing or invalid values', () => {
    expect(resolveSheetBackgroundPreference(null)).toBe('white')
    expect(resolveSheetBackgroundPreference('paper')).toBe('white')
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
  it('stores app and clears white', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    writeSheetBackgroundPreference('app', storage)
    expect(storage.setItem).toHaveBeenCalledWith(SHEET_BACKGROUND_STORAGE_KEY, 'app')

    writeSheetBackgroundPreference('white', storage)
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
