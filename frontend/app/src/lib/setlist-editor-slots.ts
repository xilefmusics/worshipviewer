import {
  coerceMusicalKeyString,
  normalizeSongLinkLanguage,
  normalizeSongLinkId,
  normalizeSongLinkNr,
  type EditorSongLink,
} from '@/lib/setlist-song-links'

export type SlotRow = { slotId: string; link: EditorSongLink }

function newSlotId(): string {
  return globalThis.crypto.randomUUID()
}

export function makeSlotRow(link: EditorSongLink): SlotRow {
  const id = normalizeSongLinkId(link.id)
  const key = coerceMusicalKeyString(link.key)
  const row: EditorSongLink = { id, key }
  if (link.nr !== undefined) {
    row.nr = normalizeSongLinkNr(link.nr)
  }
  if (link.tempo !== undefined) {
    row.tempo = link.tempo
  }
  if (link.language !== undefined) {
    row.language = normalizeSongLinkLanguage(link.language)
  }
  if (link.flow !== undefined) {
    row.flow = link.flow
  }
  return {
    slotId: newSlotId(),
    link: row,
  }
}

export function slotsFromSongLinks(songs: EditorSongLink[]): SlotRow[] {
  return songs.map((l) => makeSlotRow(l))
}
