import {
  coerceMusicalKeyString,
  normalizeSongLinkId,
  type SongLink,
} from '@/lib/setlist-song-links'

export type SlotRow = { slotId: string; link: SongLink }

function newSlotId(): string {
  return globalThis.crypto.randomUUID()
}

export function makeSlotRow(link: SongLink): SlotRow {
  const id = normalizeSongLinkId(link.id)
  const key = coerceMusicalKeyString(link.key)
  return {
    slotId: newSlotId(),
    link: { id, key },
  }
}

export function slotsFromSongLinks(songs: SongLink[]): SlotRow[] {
  return songs.map((l) => makeSlotRow(l))
}
