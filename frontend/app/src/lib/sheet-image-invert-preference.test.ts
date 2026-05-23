import { describe, expect, it, vi } from 'vitest'

import {
  readSheetImageInvertPreference,
  SHEET_IMAGE_INVERT_STORAGE_KEY,
  writeSheetImageInvertPreference,
} from '@/lib/sheet-image-invert-preference'

describe('readSheetImageInvertPreference', () => {
  it('defaults to false', () => {
    expect(readSheetImageInvertPreference({ getItem: () => null })).toBe(false)
    expect(readSheetImageInvertPreference({ getItem: () => 'false' })).toBe(false)
  })

  it('returns true when enabled', () => {
    expect(readSheetImageInvertPreference({ getItem: () => 'true' })).toBe(true)
  })
})

describe('writeSheetImageInvertPreference', () => {
  it('stores enabled preference and clears when disabled', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    writeSheetImageInvertPreference(true, storage)
    expect(storage.setItem).toHaveBeenCalledWith(SHEET_IMAGE_INVERT_STORAGE_KEY, 'true')

    writeSheetImageInvertPreference(false, storage)
    expect(storage.removeItem).toHaveBeenCalledWith(SHEET_IMAGE_INVERT_STORAGE_KEY)
  })

  it('dispatches change event', () => {
    const dispatch = vi.fn()
    vi.stubGlobal('window', { dispatchEvent: dispatch })

    writeSheetImageInvertPreference(true, { setItem: vi.fn(), removeItem: vi.fn() })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wv-sheet-image-invert-change', detail: true }),
    )

    vi.unstubAllGlobals()
  })
})
