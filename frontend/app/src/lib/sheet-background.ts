import { getLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/browser-storage'

export const SHEET_BACKGROUND_STORAGE_KEY = 'wv_sheet_background'

export const SHEET_BACKGROUND_CHANGE_EVENT = 'wv-sheet-background-change'

export type SheetBackgroundPreference = 'white' | 'app'

export function resolveSheetBackgroundPreference(value: string | null): SheetBackgroundPreference {
  if (value === 'white') return 'white'
  return 'app'
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
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): SheetBackgroundPreference {
  return resolveSheetBackgroundPreference(safeGetItem(SHEET_BACKGROUND_STORAGE_KEY, storage))
}

export function writeSheetBackgroundPreference(
  preference: SheetBackgroundPreference,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
): void {
  if (preference === 'app') {
    safeRemoveItem(SHEET_BACKGROUND_STORAGE_KEY, storage)
  } else {
    safeSetItem(SHEET_BACKGROUND_STORAGE_KEY, preference, storage)
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
