import type { EditorSongLink } from '@/lib/setlist-song-links'

/** Cmd-K palette + picker i18n; optional overrides for collection editor. */
export type SetlistPaletteBridge = {
  songLinks: EditorSongLink[]
  canInsert: boolean
  flushBeforeInsert: () => Promise<boolean>
  insertSongLink: (link: EditorSongLink) => void
  duplicateBadgeKey?: string
  cmdkInsertHeadingKey?: string
  pickerExcludedKey?: string
}
