import { describe, expect, it } from 'vitest'

import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

type SongWire = ChordSongData & {
  sections?: Array<{
    lines?: Array<{
      parts?: Array<{ chord?: { main?: { level?: number } } }>
    }>
  }>
}
import { ChordEngineError } from '@/ports/chord-engine'

import {
  applyKeyChangeToSource,
  createSongLanguageEntry,
  metadataStripFromSongData,
  parseErrorsFromResult,
  parseSourceWithEngine,
  patchSongDataFromParsed,
  remapSongChordLevelsForAbsolutePitch,
  shouldPromptKeyChangeChords,
  songDataSnapshotsEqual,
  songLanguageEntriesFromSongData,
  songLanguageEntriesToWireArrays,
  songMetaTagsFromSongData,
  songMetaTagsToWireRecord,
  type SongMetadataStrip,
} from '@/lib/song-editor-state'
import { buildSongPatchBody } from '@/lib/song-patch-body'

function mockEngine(overrides?: Partial<ChordEngine>): ChordEngine {
  const sample: ChordSongData = {
    titles: ['Hello'],
    sections: [{ kind: 'verse', lines: [] }],
    key: { level: 0 },
    tempo: 120,
    time: [4, 4],
    artists: ['Band'],
    languages: ['en'],
  }
  return {
    parseChordPro(source: string) {
      if (source.includes('{{broken}}')) throw new ChordEngineError('parse failed at line 2')
      return { ...sample, raw: source }
    },
    parseUltimateGuitarHtml() {
      return sample
    },
    formatChordPro(song: ChordSongData) {
      return `{title: ${(song.titles as string[] | undefined)?.[0] ?? ''}}\n${JSON.stringify(song.sections)}`
    },
    renderA4Html() {
      return { html: '<div/>', css: '' }
    },
    renderA4SectionHtmls() {
      return { sections: ['<p/>'], css: '' }
    },
    transpose(song: ChordSongData, key: string) {
      return { ...song, key: { level: 0 }, transposed: key }
    },
    fillSectionReferences(song: ChordSongData) {
      return song
    },
    flowItems() {
      return []
    },
    customFlow() {
      return []
    },
    applyFlow(song: ChordSongData) {
      return song
    },
    ...overrides,
  }
}

describe('parseSourceWithEngine', () => {
  it('returns parsed data on success', () => {
    const result = parseSourceWithEngine(mockEngine(), '{title: Test}')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.titles).toEqual(['Hello'])
  })

  it('aggregates parse errors for UI', () => {
    const result = parseSourceWithEngine(mockEngine(), '{{broken}}')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(parseErrorsFromResult(result)).toEqual(['parse failed at line 2'])
    }
  })
})

describe('buildSongPatchBody', () => {
  const baseline = patchSongDataFromParsed(
    { titles: ['A'], sections: [] },
    metadataStripFromSongData({ titles: ['A'], sections: [] }),
  )

  it('returns null when unchanged', () => {
    expect(buildSongPatchBody(baseline, baseline)).toBeNull()
  })

  it('returns full data snapshot when dirty', () => {
    const draft = { ...baseline, titles: ['B'] }
    expect(buildSongPatchBody(baseline, draft)).toEqual({ data: draft })
  })
})

describe('songLanguageEntriesFromSongData', () => {
  it('groups parallel titles, artists, and languages by index', () => {
    const entries = songLanguageEntriesFromSongData({
      titles: ['Anker', 'Anchor'],
      artists: ['Urban Life Worship', 'Hillsong Worship'],
      languages: ['de', 'en'],
      sections: [],
    }).map(({ language, title, artist }) => ({ language, title, artist }))

    expect(entries).toEqual([
      { language: 'de', title: 'Anker', artist: 'Urban Life Worship' },
      { language: 'en', title: 'Anchor', artist: 'Hillsong Worship' },
    ])
  })

  it('returns an empty list when all arrays are missing', () => {
    expect(songLanguageEntriesFromSongData({ sections: [] })).toEqual([])
  })
})

describe('metadataStripFromSongData', () => {
  it('maps parallel language metadata into entries', () => {
    const strip = metadataStripFromSongData({
      titles: ['Anker', 'Anchor'],
      artists: ['Urban Life Worship', 'Hillsong Worship'],
      languages: ['de', 'en'],
      sections: [],
    })
    expect(strip.languageEntries).toHaveLength(2)
    expect(strip.languageEntries[0]?.title).toBe('Anker')
    expect(strip.languageEntries[1]?.artist).toBe('Hillsong Worship')
  })
})

describe('patchSongDataFromParsed', () => {
  it('tolerates partial strip objects', () => {
    const patch = patchSongDataFromParsed(
      { titles: ['A'], sections: [] },
      { languageEntries: [createSongLanguageEntry('', 'B', '')] } as SongMetadataStrip,
    )
    expect(patch.titles).toEqual(['B'])
  })

  it('maps language entries back to parallel wire arrays', () => {
    const patch = patchSongDataFromParsed(
      { sections: [] },
      {
        subtitle: '',
        copyright: '',
        languageEntries: [
          createSongLanguageEntry('de', 'Anker', 'Urban Life Worship'),
          createSongLanguageEntry('en', 'Anchor', 'Hillsong Worship'),
        ],
        tempo: '',
        timeSignature: '',
        key: '',
        tags: [],
      },
    )
    expect(patch.titles).toEqual(['Anker', 'Anchor'])
    expect(patch.artists).toEqual(['Urban Life Worship', 'Hillsong Worship'])
    expect(patch.languages).toEqual(['de', 'en'])
  })

  it('round-trips multiple titles through the metadata strip', () => {
    const data = { titles: ['Anker', 'Anchor'], sections: [] }
    const strip = metadataStripFromSongData(data)
    const patch = patchSongDataFromParsed(data, strip)
    expect(patch.titles).toEqual(['Anker', 'Anchor'])
  })

  it('maps 4/4 and 6/8 time signatures only', () => {
    expect(
      patchSongDataFromParsed({ sections: [] }, { timeSignature: '4/4' } as SongMetadataStrip).time,
    ).toEqual([4, 4])
    expect(
      patchSongDataFromParsed({ sections: [] }, { timeSignature: '6/8' } as SongMetadataStrip).time,
    ).toEqual([6, 8])
    expect(
      patchSongDataFromParsed({ sections: [] }, { timeSignature: '3/4' } as SongMetadataStrip).time,
    ).toBeNull()
  })
})

describe('songLanguageEntriesToWireArrays', () => {
  it('preserves index alignment including empty slots', () => {
    expect(
      songLanguageEntriesToWireArrays([
        createSongLanguageEntry('de', 'Anker', 'Band A'),
        createSongLanguageEntry('', 'Anchor', ''),
      ]),
    ).toEqual({
      titles: ['Anker', 'Anchor'],
      artists: ['Band A', ''],
      languages: ['de', ''],
    })
  })
})

describe('songDataSnapshotsEqual', () => {
  it('treats equivalent snapshots as equal', () => {
    const a = patchSongDataFromParsed({ titles: ['X'], sections: [] }, metadataStripFromSongData({ titles: ['X'], sections: [] }))
    const b = { ...a }
    expect(songDataSnapshotsEqual(a, b)).toBe(true)
  })
})

describe('songMetaTagsFromSongData', () => {
  it('returns sorted key/value pairs from tags', () => {
    const tags = songMetaTagsFromSongData({
      sections: [],
      tags: { theme: 'Grace', author: 'John', mood: 'Upbeat' },
    }).map(({ key, value }) => ({ key, value }))

    expect(tags).toEqual([
      { key: 'author', value: 'John' },
      { key: 'mood', value: 'Upbeat' },
      { key: 'theme', value: 'Grace' },
    ])
  })

  it('returns empty list when tags are missing or empty', () => {
    expect(songMetaTagsFromSongData({ sections: [] })).toEqual([])
    expect(songMetaTagsFromSongData({ sections: [], tags: {} })).toEqual([])
    expect(songMetaTagsFromSongData(null)).toEqual([])
  })
})

describe('songMetaTagsToWireRecord', () => {
  it('builds a wire record and skips blank keys', () => {
    expect(
      songMetaTagsToWireRecord([
        { id: '1', key: ' theme ', value: ' Grace ' },
        { id: '2', key: '', value: 'skip' },
        { id: '3', key: 'author', value: 'John' },
      ]),
    ).toEqual({ theme: 'Grace', author: 'John' })
  })

  it('returns an empty record when no valid entries remain', () => {
    expect(songMetaTagsToWireRecord([])).toEqual({})
    expect(songMetaTagsToWireRecord([{ id: '1', key: ' ', value: 'x' }])).toEqual({})
  })
})

describe('shouldPromptKeyChangeChords', () => {
  it('prompts only when both keys are set and different', () => {
    expect(shouldPromptKeyChangeChords('C', 'D')).toBe(true)
    expect(shouldPromptKeyChangeChords('C', 'C')).toBe(false)
    expect(shouldPromptKeyChangeChords('', 'D')).toBe(false)
    expect(shouldPromptKeyChangeChords('C', '')).toBe(false)
  })
})

describe('remapSongChordLevelsForAbsolutePitch', () => {
  it('remaps stored levels so absolute pitch is unchanged', () => {
    const song: SongWire = {
      key: { level: 3 },
      sections: [
        {
          lines: [
            {
              parts: [{ chord: { main: { level: 7 } } }],
            },
          ],
        },
      ],
    }

    const remapped = remapSongChordLevelsForAbsolutePitch(song, 'C', 'D') as SongWire
    const level = remapped.sections?.[0]?.lines?.[0]?.parts?.[0]?.chord?.main?.level
    expect(level).toBe(5)
  })
})

describe('applyKeyChangeToSource', () => {
  const stripD: SongMetadataStrip = {
    subtitle: '',
    copyright: '',
    languageEntries: [createSongLanguageEntry('', 'A', '')],
    tempo: '',
    timeSignature: '',
    key: 'D',
    tags: [],
  }

  const songInC = {
    titles: ['A'],
    key: { level: 3 },
    sections: [
      {
        lines: [
          {
            parts: [{ chord: { main: { level: 7 } } }],
          },
        ],
      },
    ],
  }

  it('transpose keeps key-relative stored levels', () => {
    let formatted: SongWire | undefined
    const engine = mockEngine({
      formatChordPro(song) {
        formatted = song
        return 'formatted'
      },
    })

    applyKeyChangeToSource(engine, songInC, stripD, 'transpose', 'C')
    expect(formatted?.key).toEqual({ level: 5 })
    expect(formatted?.sections?.[0]?.lines?.[0]?.parts?.[0]?.chord?.main?.level).toBe(7)
  })

  it('keep remaps stored levels before formatting', () => {
    let formatted: SongWire | undefined
    const engine = mockEngine({
      formatChordPro(song) {
        formatted = song
        return 'formatted'
      },
    })

    applyKeyChangeToSource(engine, songInC, stripD, 'keep', 'C')
    expect(formatted?.sections?.[0]?.lines?.[0]?.parts?.[0]?.chord?.main?.level).toBe(5)
  })
})

describe('patchSongDataFromParsed tags', () => {
  it('uses strip tags instead of parsed tags', () => {
    const patch = patchSongDataFromParsed(
      { sections: [], tags: { old: 'value' } },
      {
        subtitle: '',
        copyright: '',
        languageEntries: [],
        tempo: '',
        timeSignature: '',
        key: '',
        tags: [{ id: '1', key: 'theme', value: 'Grace' }],
      },
    )
    expect(patch.tags).toEqual({ theme: 'Grace' })
  })

  it('sends an empty tags object when all meta tags are removed', () => {
    const patch = patchSongDataFromParsed(
      { sections: [], tags: { year: '2014' } },
      {
        subtitle: '',
        copyright: '',
        languageEntries: [],
        tempo: '',
        timeSignature: '',
        key: '',
        tags: [],
      },
    )
    expect(patch.tags).toEqual({})
  })
})

describe('songDataSnapshotsEqual tags', () => {
  it('treats missing and empty tags as equivalent', () => {
    const base = patchSongDataFromParsed({ sections: [] }, metadataStripFromSongData({ sections: [] }))
    const withEmptyTags = { ...base, tags: {} }
    const withNullTags = { ...base, tags: null }
    expect(songDataSnapshotsEqual(base, withEmptyTags)).toBe(true)
    expect(songDataSnapshotsEqual(base, withNullTags)).toBe(true)
  })

  it('detects tag removals', () => {
    const base = patchSongDataFromParsed(
      { sections: [], tags: { year: '2014' } },
      metadataStripFromSongData({ sections: [], tags: { year: '2014' } }),
    )
    const cleared = patchSongDataFromParsed(
      { sections: [], tags: { year: '2014' } },
      {
        subtitle: '',
        copyright: '',
        languageEntries: [],
        tempo: '',
        timeSignature: '',
        key: '',
        tags: [],
      },
    )
    expect(songDataSnapshotsEqual(base, cleared)).toBe(false)
    expect(buildSongPatchBody(base, cleared)?.data.tags).toEqual({})
  })
})
