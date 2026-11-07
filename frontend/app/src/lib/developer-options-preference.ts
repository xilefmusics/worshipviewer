import { getLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/browser-storage'

export const DEVELOPER_OPTIONS_STORAGE_KEY = 'wv_developer_options'
export const DEVELOPER_OPTIONS_CHANGE_EVENT = 'wv-developer-options-change'

export function readDeveloperOptionsPreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): boolean {
  return safeGetItem(DEVELOPER_OPTIONS_STORAGE_KEY, storage) === 'true'
}

export function writeDeveloperOptionsPreference(
  enabled: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
): void {
  if (enabled) {
    safeSetItem(DEVELOPER_OPTIONS_STORAGE_KEY, 'true', storage)
  } else {
    safeRemoveItem(DEVELOPER_OPTIONS_STORAGE_KEY, storage)
  }

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(DEVELOPER_OPTIONS_CHANGE_EVENT, { detail: enabled }),
    )
  }
}
