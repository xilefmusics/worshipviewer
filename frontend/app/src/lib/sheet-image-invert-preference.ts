import { getLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/browser-storage'

export const SHEET_IMAGE_INVERT_STORAGE_KEY = 'wv_sheet_image_invert'

export const SHEET_IMAGE_INVERT_CHANGE_EVENT = 'wv-sheet-image-invert-change'

export function readSheetImageInvertPreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): boolean {
  return safeGetItem(SHEET_IMAGE_INVERT_STORAGE_KEY, storage) === 'true'
}

export function writeSheetImageInvertPreference(
  enabled: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
): void {
  if (enabled) {
    safeSetItem(SHEET_IMAGE_INVERT_STORAGE_KEY, 'true', storage)
  } else {
    safeRemoveItem(SHEET_IMAGE_INVERT_STORAGE_KEY, storage)
  }

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(SHEET_IMAGE_INVERT_CHANGE_EVENT, { detail: enabled }),
    )
  }
}
