import type { SongLink } from '@/lib/setlist-song-links'

/** Cmd-K palette + picker i18n; optional overrides for collection editor. */
export type SetlistPaletteBridge = {
  songLinks: SongLink[]
  canInsert: boolean
  flushBeforeInsert: () => Promise<boolean>
  insertSongLink: (link: SongLink) => void
  duplicateBadgeKey?: string
  cmdkInsertHeadingKey?: string
  pickerExcludedKey?: string
}
