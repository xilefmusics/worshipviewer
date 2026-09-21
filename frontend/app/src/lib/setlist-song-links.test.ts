import { describe, expect, it } from 'vitest'

import type { SongFlowItem } from '@/ports/chord-engine'

import {
  normalizeCapoShapeKey,
  normalizeSongLinksForEditor,
  songLinkForSetlistMutation,
  type SetlistSongLink,
} from '@/lib/setlist-song-links'
import { buildSetlistPatchBody } from '@/lib/setlist-field-diff'
import { mergeEditorSongsIntoItems } from '@/lib/setlist-items'

function flow(title: string, occurrence_index = 0, repeats = 1): SongFlowItem {
  return { title, occurrence_index, repeats }
}

describe('setlist song links', () => {
  it('preserves nr and flow when normalizing setlist links for the editor', () => {
    const links: SetlistSongLink[] = [
      {
        id: 'song-1',
        nr: '7',
        key: null,
        capo_shape: { level: 10 },
        tempo: 120,
        language: 'de',
        flow: [flow('Verse', 0, 1), flow('Chorus', 0, 2)],
      },
    ]

    expect(normalizeSongLinksForEditor(links)).toEqual([
      {
        id: 'song-1',
        key: null,
        capoShapeKey: 'G',
        nr: '7',
        tempo: 120,
        language: 'de',
        flow: [flow('Verse', 0, 1), flow('Chorus', 0, 2)],
      },
    ])
  })

  it('serializes setlist links with flow intact', () => {
    const link = songLinkForSetlistMutation({
      id: 'song-1',
      key: null,
      tempo: 120,
      language: 'de',
      nr: '7',
      flow: [flow('Verse', 0, 1)],
      capoShapeKey: 'G',
    })

    expect(link.nr).toBe('7')
    expect(link.flow).toEqual([flow('Verse', 0, 1)])
    expect(link.capo_shape).toEqual({ level: 10 })
  })

  it('ignores malformed persisted capo shapes and accepts all musical keys', () => {
    expect(normalizeCapoShapeKey({ level: '2' })).toBeNull()
    expect(normalizeCapoShapeKey({ level: 2 })).toBe('B')
    expect(normalizeCapoShapeKey({ level: 10 })).toBe('G')
    expect(normalizeCapoShapeKey('C')).toBe('C')
  })

  it('treats equal flow slots as unchanged in autosave diffs', () => {
    const songs = [
      {
        id: 'song-1',
        key: null,
        tempo: null,
        language: null,
        nr: null,
        flow: [flow('Verse', 0, 1), flow('Chorus', 0, 2)],
      },
    ]
    const baseline = {
      title: 'Sunday',
      owner: 'team-1',
      songs,
      items: mergeEditorSongsIntoItems([], songs),
    }
    const draft = {
      ...baseline,
      songs: [
        {
          ...baseline.songs[0],
          flow: [flow('Verse', 0, 1), flow('Chorus', 0, 2)],
        },
      ],
    }

    expect(buildSetlistPatchBody(baseline, draft)).toBeNull()
  })

  it('includes flow edits in autosave diffs', () => {
    const songs = [
      {
        id: 'song-1',
        key: null,
        tempo: null,
        language: null,
        nr: null,
        flow: [flow('Verse', 0, 1)],
      },
    ]
    const baseline = {
      title: 'Sunday',
      owner: 'team-1',
      songs,
      items: mergeEditorSongsIntoItems([], songs),
    }
    const draft = {
      ...baseline,
      songs: [
        {
          ...baseline.songs[0],
          flow: [flow('Verse', 0, 2)],
        },
      ],
    }

    const patch = buildSetlistPatchBody(baseline, draft)
    expect(patch?.items?.[0]).toMatchObject({ type: 'song', flow: [flow('Verse', 0, 2)] })
  })
})
