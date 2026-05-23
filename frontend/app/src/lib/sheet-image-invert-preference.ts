export const SHEET_IMAGE_INVERT_STORAGE_KEY = 'wv_sheet_image_invert'

export const SHEET_IMAGE_INVERT_CHANGE_EVENT = 'wv-sheet-image-invert-change'

export function readSheetImageInvertPreference(
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): boolean {
  return storage.getItem(SHEET_IMAGE_INVERT_STORAGE_KEY) === 'true'
}

export function writeSheetImageInvertPreference(
  enabled: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  if (enabled) {
    storage.setItem(SHEET_IMAGE_INVERT_STORAGE_KEY, 'true')
  } else {
    storage.removeItem(SHEET_IMAGE_INVERT_STORAGE_KEY)
  }

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(SHEET_IMAGE_INVERT_CHANGE_EVENT, { detail: enabled }),
    )
  }
}
