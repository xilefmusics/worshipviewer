import { getLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/browser-storage'

export const HIDE_CHORDS_STORAGE_KEY = 'wv_hide_chords'

export const HIDE_CHORDS_CHANGE_EVENT = 'wv-hide-chords-change'

export function readHideChordsPreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): boolean {
  return safeGetItem(HIDE_CHORDS_STORAGE_KEY, storage) === 'true'
}

export function writeHideChordsPreference(
  enabled: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
): void {
  if (enabled) {
    safeSetItem(HIDE_CHORDS_STORAGE_KEY, 'true', storage)
  } else {
    safeRemoveItem(HIDE_CHORDS_STORAGE_KEY, storage)
  }

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(new CustomEvent(HIDE_CHORDS_CHANGE_EVENT, { detail: enabled }))
  }
}
