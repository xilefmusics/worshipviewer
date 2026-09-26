import { describe, expect, it } from 'vitest'

import type { Song } from '@/api/list-fetch'
import { buildAllSongsPlayer } from '@/lib/all-songs-player'

function song(args: {
  id: string
  title: string
  sections?: boolean
  notASong?: boolean
  hasBlob?: boolean
  liked?: boolean
}): Song {
  return {
    id: args.id,
    owner: 'team:test',
    not_a_song: args.notASong ?? false,
    blobs: args.hasBlob ? [{ id: `blob:${args.id}` }] : [],
    data: {
      titles: [args.title],
      sections: args.sections ? [{}] : [],
    },
    user_specific_addons: { liked: args.liked ?? false },
  } as unknown as Song
}

describe('buildAllSongsPlayer', () => {
  it('keeps chord songs only, omits blob items, and sorts playback and TOC alphabetically', () => {
    const player = buildAllSongsPlayer([
      song({ id: 'zulu', title: 'Zulu', sections: true }),
      song({ id: 'blob-only', title: 'PDF', hasBlob: true }),
      song({ id: 'alpha', title: 'Alpha', sections: true, hasBlob: true, liked: true }),
      song({ id: 'alpha-b', title: 'Alpha', sections: true }),
      song({ id: 'spoken', title: 'Bible reading', sections: true, notASong: true }),
      song({ id: 'beta', title: 'Beta', sections: true }),
    ])

    expect(player.items.map((item) => item.type)).toEqual(['chords', 'chords', 'chords', 'chords'])
    expect(
      player.items.map((item) => (item.type === 'chords' ? item.song.id : 'unexpected-blob')),
    ).toEqual(['alpha', 'alpha-b', 'beta', 'zulu'])
    expect(player.toc.map((row) => row.title)).toEqual(['Alpha', 'Alpha', 'Beta', 'Zulu'])
    expect(player.toc.map((row) => row.idx)).toEqual([0, 1, 2, 3])
    expect(player.toc.map((row) => row.nr)).toEqual(['1', '2', '3', '4'])
    expect(player.toc[0]?.liked).toBe(true)
  })

  it('returns an empty player when there are no chord songs', () => {
    const player = buildAllSongsPlayer([
      song({ id: 'blob-only', title: 'PDF', hasBlob: true }),
      song({ id: 'spoken', title: 'Reading', sections: true, notASong: true }),
    ])

    expect(player.items).toEqual([])
    expect(player.toc).toEqual([])
  })
})
