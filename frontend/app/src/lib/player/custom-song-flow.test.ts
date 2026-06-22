import { describe, expect, it } from 'vitest'

import type { components } from '@/api/schema'

import {
  buildFlowSourcePool,
  resolveSongDataForCustomFlow,
  resolveSongForBookRendering,
} from '@/lib/player/custom-song-flow'

type SongData = components['schemas']['SongDataSchema']

function makeSongData(): SongData {
  return {
    titles: ['Flow Song'],
    sections: [
      { title: 'Verse', lines: [{ parts: [{ comment: false, languages: ['Verse 1'] }] }], repeat_count: 4 },
      { title: 'Verse', lines: [{ parts: [{ comment: false, languages: ['Verse 2'] }] }], repeat_count: 2 },
      { title: 'Marker', lines: [{ parts: [{ comment: true, languages: ['Ignored'] }] }] },
      { title: 'Chorus', lines: [{ parts: [{ comment: false, languages: ['Chorus 1'] }] }], repeat_count: 3 },
      { title: 'Chorus', lines: [{ parts: [{ comment: false, languages: ['Chorus 2'] }] }], repeat_count: 2 },
    ],
  } as SongData
}

describe('buildFlowSourcePool', () => {
  it('includes content sections and labels duplicate titles with suffixes', () => {
    expect(buildFlowSourcePool(makeSongData()).map((entry) => entry.label)).toEqual([
      'Verse',
      'Verse (2)',
      'Chorus',
      'Chorus (2)',
    ])
  })
})

describe('resolveSongDataForCustomFlow', () => {
  it('reorders sections, uses zero-based occurrences, and overrides repeat counts', () => {
    const songData = makeSongData()
    const resolved = resolveSongDataForCustomFlow(songData, [
      { section_title: 'Verse', occurrence_index: 1, repeat_count: 1 },
      { section_title: 'Chorus', occurrence_index: 0, repeat_count: 2 },
      { section_title: 'Chorus', occurrence_index: 1, repeat_count: 3 },
    ])

    expect(resolved.sections?.map((section) => section.title)).toEqual(['Verse', 'Chorus', 'Chorus'])
    expect(resolved.sections?.map((section) => section.repeat_count)).toEqual([1, 2, 3])
    expect(resolved.sections?.[0]?.lines?.[0]?.parts?.[0]?.languages).toEqual(['Verse 2'])
  })

  it('falls back atomically when any slot is invalid', () => {
    const songData = makeSongData()
    const resolved = resolveSongDataForCustomFlow(songData, [
      { section_title: 'Verse', occurrence_index: 0, repeat_count: 1 },
      { section_title: 'Missing', occurrence_index: 0, repeat_count: 1 },
    ])

    expect(resolved).toBe(songData)
  })
})

describe('resolveSongForBookRendering', () => {
  it('keeps default Book rendering unchanged when flow is null and applies donor fill after flow resolution', () => {
    const song = {
      id: 'song-1',
      data: {
        titles: ['Flow Song'],
        sections: [
          { title: 'Verse', lines: [{ parts: [{ comment: false, languages: ['Verse'] }] }] },
          {
            title: 'Chorus',
            lines: [
              {
                parts: [
                  {
                    comment: false,
                    languages: ['Chorus'],
                    chord: {
                      main: { level: 0 },
                      kind: 'Major',
                      var: '',
                      optional: false,
                      root_spelling_hint: 'default',
                    },
                  },
                ],
              },
            ],
          },
          {
            title: 'Chorus',
            lines: [
              {
                parts: [
                  {
                    comment: false,
                    languages: [],
                    chord: {
                      main: { level: 2 },
                      kind: 'Major',
                      var: '',
                      optional: false,
                      root_spelling_hint: 'default',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as components['schemas']['Song']

    expect(resolveSongForBookRendering(song, null, false)).toBe(song)

    const rendered = resolveSongForBookRendering(
      song,
      [
        { section_title: 'Chorus', occurrence_index: 0, repeat_count: 1 },
        { section_title: 'Chorus', occurrence_index: 1, repeat_count: 1 },
      ],
      true,
    )

    expect(rendered).not.toBe(song)
    expect(rendered.data.sections?.map((section) => section.title)).toEqual(['Chorus', 'Chorus'])
    expect(rendered.data.sections?.[1]?.lines?.[0]?.parts?.[0]?.languages).toEqual(['Chorus'])
  })
})
