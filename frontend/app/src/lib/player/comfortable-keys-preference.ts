import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'
import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'

export type ComfortableKey = (typeof MUSICAL_KEYS)[number]

export const COMFORTABLE_KEYS_STORAGE_KEY = 'wv_comfortable_keys'
export const COMFORTABLE_KEYS_CHANGE_EVENT = 'wv-comfortable-keys-change'
export const DEFAULT_COMFORTABLE_KEYS: readonly ComfortableKey[] = ['C', 'E', 'G']

function normalizeComfortableKeys(values: readonly unknown[]): ComfortableKey[] {
  const selected = new Set(values)
  return MUSICAL_KEYS.filter((key) => selected.has(key))
}

export function readComfortableKeysPreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): ComfortableKey[] {
  const raw = safeGetItem(COMFORTABLE_KEYS_STORAGE_KEY, storage)
  if (raw == null) return [...DEFAULT_COMFORTABLE_KEYS]

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_COMFORTABLE_KEYS]
    const normalized = normalizeComfortableKeys(parsed)
    return normalized.length > 0 ? normalized : [...DEFAULT_COMFORTABLE_KEYS]
  } catch {
    return [...DEFAULT_COMFORTABLE_KEYS]
  }
}

export function writeComfortableKeysPreference(
  keys: readonly unknown[],
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): ComfortableKey[] {
  const normalized = normalizeComfortableKeys(keys)
  const next = normalized.length > 0 ? normalized : [...DEFAULT_COMFORTABLE_KEYS]
  safeSetItem(COMFORTABLE_KEYS_STORAGE_KEY, JSON.stringify(next), storage)

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(COMFORTABLE_KEYS_CHANGE_EVENT, { detail: next }),
    )
  }

  return next
}
