import type { components } from '@/api/schema'
import type { Song } from '@/api/list-fetch'

type Player = components['schemas']['Player']

export const ALL_SONGS_LIBRARY_ID = 'all-songs'

function primaryTitle(song: Song): string {
  return song.data.titles?.[0]?.trim() ?? ''
}

function compareSongs(a: Song, b: Song): number {
  const titleOrder = primaryTitle(a).localeCompare(primaryTitle(b), undefined, {
    sensitivity: 'base',
  })
  return titleOrder || a.id.localeCompare(b.id)
}

/** Create an alphabetically ordered player containing only chord content. */
export function buildAllSongsPlayer(songs: Song[]): Player {
  const chordSongs = songs
    .filter((song) => !song.not_a_song && song.data.sections.length > 0)
    .sort(compareSongs)

  return {
    between_items: false,
    index: 0,
    items: chordSongs.map((song) => ({
      type: 'chords',
      song,
      capo_shape: null,
      language: null,
      flow: null,
    })),
    orientation: 'portrait',
    scroll_type: 'book',
    scroll_type_cache_other_orientation: 'book',
    toc: chordSongs.map((song, idx) => ({
      idx,
      id: song.id,
      liked: song.user_specific_addons.liked,
      nr: String(idx + 1),
      title: primaryTitle(song) || '—',
    })),
  }
}
