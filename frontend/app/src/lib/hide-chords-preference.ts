export const HIDE_CHORDS_STORAGE_KEY = 'wv_hide_chords'

export const HIDE_CHORDS_CHANGE_EVENT = 'wv-hide-chords-change'

export function readHideChordsPreference(
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): boolean {
  return storage.getItem(HIDE_CHORDS_STORAGE_KEY) === 'true'
}

export function writeHideChordsPreference(
  enabled: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  if (enabled) {
    storage.setItem(HIDE_CHORDS_STORAGE_KEY, 'true')
  } else {
    storage.removeItem(HIDE_CHORDS_STORAGE_KEY)
  }

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(new CustomEvent(HIDE_CHORDS_CHANGE_EVENT, { detail: enabled }))
  }
}
