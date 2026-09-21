import {
  coerceMusicalKeyString,
  normalizeSongLinkLanguage,
  normalizeSongLinkId,
  normalizeSongLinkNr,
  type EditorSongLink,
} from '@/lib/setlist-song-links'
import { songItemFromLink, type SetlistItem, type SetlistMediaItem } from '@/lib/setlist-items'
import { normalizeSongLinksForEditor } from '@/lib/setlist-song-links'
import { songLinkForSetlistMutation } from '@/lib/setlist-song-links'

export type SongSlotRow = { slotId: string; type: 'song'; link: EditorSongLink }
export type MediaSlotRow = { slotId: string; type: 'media'; link: SetlistMediaItem }
export type SlotRow = SongSlotRow
export type SetlistSlotRow = SongSlotRow | MediaSlotRow

function newSlotId(): string {
  return globalThis.crypto.randomUUID()
}

export function makeSlotRow(link: EditorSongLink): SongSlotRow {
  const id = normalizeSongLinkId(link.id)
  const key = coerceMusicalKeyString(link.key)
  const row: EditorSongLink = { id, key }
  if (link.capoShapeKey !== undefined) {
    row.capoShapeKey = link.capoShapeKey
  }
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
    type: 'song',
    link: row,
  }
}

export function makeMediaSlotRow(id: string): MediaSlotRow {
  return { slotId: newSlotId(), type: 'media', link: { type: 'media', id } }
}

export function slotsFromSongLinks(songs: EditorSongLink[]): SongSlotRow[] {
  return songs.map((l) => makeSlotRow(l))
}


export function slotsFromSetlistItems(items: SetlistItem[]): SetlistSlotRow[] {
  return items.map((item) => {
    if (item.type === 'media') return makeMediaSlotRow(item.id)
    return makeSlotRow(normalizeSongLinksForEditor([item])[0]!)
  })
}

export function setlistItemsFromSlots(rows: SetlistSlotRow[]): SetlistItem[] {
  return rows.map((row) => {
    if (row.type === 'media') return row.link
    return songItemFromLink(songLinkForSetlistMutation(row.link))
  })
}

export function songLinksFromSlots(rows: SetlistSlotRow[]): EditorSongLink[] {
  return rows.flatMap((row) => (row.type === 'song' ? [row.link] : []))
}
