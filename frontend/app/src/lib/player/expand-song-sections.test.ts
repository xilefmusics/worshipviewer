import { describe, expect, it } from 'vitest'

import {
  expandSongSections,
  expandSongSectionsForPlayer,
  sectionHasLyrics,
} from '@/lib/player/expand-song-sections'

describe('sectionHasLyrics', () => {
  it('returns false for chord-only lines', () => {
    expect(
      sectionHasLyrics({
        title: 'Chorus',
        lines: [
          {
            parts: [
              {
                comment: false,
                languages: [],
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
      }),
    ).toBe(false)
  })
})

describe('expandSongSections', () => {
  it('copies lyrics into a later duplicate section with empty lines', () => {
    const donorLine = {
      parts: [{ comment: false, languages: ['Holy holy'] }],
    }
    const expanded = expandSongSections([
      { title: 'Chorus', lines: [donorLine] },
      { title: 'Verse 1', lines: [{ parts: [{ comment: false, languages: ['Verse'] }] }] },
      { title: 'Chorus', lines: [] },
    ])

    expect(expanded[2]?.lines).toEqual([donorLine])
  })

  it('merges lyrics into chord-only repeat lines', () => {
    const donor = {
      title: 'Chorus',
      lines: [
        {
          parts: [
            {
              comment: false,
              languages: ['Sing it'],
              chord: {
                main: { level: 0 },
                kind: 'Major' as const,
                var: '',
                optional: false,
                root_spelling_hint: 'default' as const,
              },
            },
          ],
        },
      ],
    }
    const expanded = expandSongSections([
      donor,
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
    ])

    expect(expanded[1]?.lines[0]?.parts[0]?.languages).toEqual(['Sing it'])
    expect(expanded[1]?.lines[0]?.parts[0]?.chord).toEqual({
      main: { level: 2 },
      kind: 'Major',
      var: '',
      optional: false,
      root_spelling_hint: 'default',
    })
  })

  it('matches section titles with repeat suffixes', () => {
    const expanded = expandSongSections([
      { title: 'Chorus', lines: [{ parts: [{ comment: false, languages: ['A'] }] }] },
      { title: 'Chorus (2)', lines: [] },
    ])

    expect(expanded[1]?.lines[0]?.parts[0]?.languages).toEqual(['A'])
  })

  it('leaves sections unchanged when no earlier donor has lyrics', () => {
    const empty = { title: 'Chorus', lines: [] }
    expect(expandSongSections([empty, empty])).toEqual([empty, empty])
  })
})

describe('expandSongSectionsForPlayer', () => {
  it('returns the same object when there are no sections', () => {
    const data = { titles: ['T'] }
    expect(expandSongSectionsForPlayer(data)).toBe(data)
  })
})
