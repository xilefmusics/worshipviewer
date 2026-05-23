export const SHEET_BACKGROUND_STORAGE_KEY = 'wv_sheet_background'

export const SHEET_BACKGROUND_CHANGE_EVENT = 'wv-sheet-background-change'

export type SheetBackgroundPreference = 'white' | 'app'

export function resolveSheetBackgroundPreference(value: string | null): SheetBackgroundPreference {
  if (value === 'app') return 'app'
  return 'white'
}

export function applySheetBackgroundPreference(
  preference: SheetBackgroundPreference,
  root: HTMLElement = globalThis.document.documentElement,
): void {
  if (preference === 'white') {
    root.removeAttribute('data-sheet-background')
    return
  }

  root.dataset.sheetBackground = preference
}

export function readSheetBackgroundPreference(
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): SheetBackgroundPreference {
  return resolveSheetBackgroundPreference(storage.getItem(SHEET_BACKGROUND_STORAGE_KEY))
}

export function writeSheetBackgroundPreference(
  preference: SheetBackgroundPreference,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  if (preference === 'white') {
    storage.removeItem(SHEET_BACKGROUND_STORAGE_KEY)
  } else {
    storage.setItem(SHEET_BACKGROUND_STORAGE_KEY, preference)
  }

  if (typeof globalThis.document !== 'undefined') {
    applySheetBackgroundPreference(preference)
  }

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(SHEET_BACKGROUND_CHANGE_EVENT, { detail: preference }),
    )
  }
}

export function initSheetBackground(): void {
  if (typeof globalThis.document === 'undefined') return
  applySheetBackgroundPreference(readSheetBackgroundPreference())
}
