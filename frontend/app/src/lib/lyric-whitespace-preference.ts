import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'

export const LYRIC_COLLAPSE_WHITESPACE_STORAGE_KEY = 'wv_lyric_collapse_whitespace'

export function normalizeLyricWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ')
}

export function readLyricCollapseWhitespacePreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): boolean {
  const raw = safeGetItem(LYRIC_COLLAPSE_WHITESPACE_STORAGE_KEY, storage)
  if (raw === 'false') return false
  return true
}

export function writeLyricCollapseWhitespacePreference(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  safeSetItem(LYRIC_COLLAPSE_WHITESPACE_STORAGE_KEY, enabled ? 'true' : 'false', storage)
}
