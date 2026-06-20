import { getLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/browser-storage'

export const TOC_MULTILINGUAL_STORAGE_KEY = 'wv_toc_multilingual'

export const TOC_MULTILINGUAL_CHANGE_EVENT = 'wv-toc-multilingual-change'

export function readTocMultilingualPreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): boolean {
  return safeGetItem(TOC_MULTILINGUAL_STORAGE_KEY, storage) === 'true'
}

export function writeTocMultilingualPreference(
  enabled: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
): void {
  if (enabled) {
    safeSetItem(TOC_MULTILINGUAL_STORAGE_KEY, 'true', storage)
  } else {
    safeRemoveItem(TOC_MULTILINGUAL_STORAGE_KEY, storage)
  }

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(TOC_MULTILINGUAL_CHANGE_EVENT, { detail: enabled }),
    )
  }
}
