export const LYRIC_COLLAPSE_WHITESPACE_STORAGE_KEY = 'wv_lyric_collapse_whitespace'

export function normalizeLyricWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ')
}

export function readLyricCollapseWhitespacePreference(
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): boolean {
  const raw = storage.getItem(LYRIC_COLLAPSE_WHITESPACE_STORAGE_KEY)
  if (raw === 'false') return false
  return true
}

export function writeLyricCollapseWhitespacePreference(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): void {
  storage.setItem(LYRIC_COLLAPSE_WHITESPACE_STORAGE_KEY, enabled ? 'true' : 'false')
}
