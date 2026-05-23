import { describe, expect, it } from 'vitest'

import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'
import { ChordEngineError } from '@/ports/chord-engine'

import {
  metadataStripFromSongData,
  parseErrorsFromResult,
  parseSourceWithEngine,
  patchSongDataFromParsed,
  songDataSnapshotsEqual,
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

describe('patchSongDataFromParsed', () => {
  it('tolerates partial strip objects', () => {
    const patch = patchSongDataFromParsed(
      { titles: ['A'], sections: [] },
      { title: 'B' } as SongMetadataStrip,
    )
    expect(patch.titles).toEqual(['B'])
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

  it('returns null when no valid entries remain', () => {
    expect(songMetaTagsToWireRecord([])).toBeNull()
    expect(songMetaTagsToWireRecord([{ id: '1', key: ' ', value: 'x' }])).toBeNull()
  })
})

describe('patchSongDataFromParsed tags', () => {
  it('uses strip tags instead of parsed tags', () => {
    const patch = patchSongDataFromParsed(
      { sections: [], tags: { old: 'value' } },
      {
        title: '',
        subtitle: '',
        artists: '',
        copyright: '',
        languages: '',
        tempo: '',
        timeSignature: '',
        key: '',
        tags: [{ id: '1', key: 'theme', value: 'Grace' }],
      },
    )
    expect(patch.tags).toEqual({ theme: 'Grace' })
  })
})
