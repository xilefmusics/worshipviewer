import { getLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/browser-storage'

export const AV_BILINGUAL_STORAGE_KEY = 'wv_av_bilingual'

export const AV_BILINGUAL_CHANGE_EVENT = 'wv-av-bilingual-change'

export function readAvBilingualPreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): boolean {
  return safeGetItem(AV_BILINGUAL_STORAGE_KEY, storage) === 'true'
}

export function writeAvBilingualPreference(
  enabled: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
): void {
  if (enabled) {
    safeSetItem(AV_BILINGUAL_STORAGE_KEY, 'true', storage)
  } else {
    safeRemoveItem(AV_BILINGUAL_STORAGE_KEY, storage)
  }

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(AV_BILINGUAL_CHANGE_EVENT, { detail: enabled }),
    )
  }
}
