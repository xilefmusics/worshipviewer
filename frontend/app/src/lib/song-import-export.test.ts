import { describe, expect, it, vi } from 'vitest'

import {
  buildPdfPrintCss,
  createSongBodyFromParsed,
  importSongsBatch,
  orderedSongZipEntryNames,
  parseImportSource,
  sanitizeDownloadBasename,
  songTitleFromData,
} from '@/lib/song-import-export'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

function mockEngine(overrides?: Partial<ChordEngine>): ChordEngine {
  return {
    parseChordPro: vi.fn(() => ({ titles: ['Hello'], sections: [] })),
    parseUltimateGuitarHtml: vi.fn(),
    formatChordPro: vi.fn(() => '{title: Hello}'),
    renderA4Html: vi.fn(() => ({ html: '<div></div>', css: '' })),
    renderA4SectionHtmls: vi.fn(() => ({ sections: ['<p></p>'], css: '' })),
    transpose: vi.fn(),
    ...overrides,
  }
}

describe('buildPdfPrintCss', () => {
  it('includes print pagination overrides for chordlib page layout', () => {
    const css = buildPdfPrintCss()
    expect(css).toContain('@media print')
    expect(css).toContain('.pdf-export-root .page')
    expect(css).toContain('height: auto')
    expect(css).toContain('overflow: visible')
    expect(css).toContain('.pdf-export-root .columns')
  })
})

describe('sanitizeDownloadBasename', () => {
  it('strips unsafe characters', () => {
    expect(sanitizeDownloadBasename('My/Song: "Test"')).toBe('My-Song Test')
  })

  it('falls back to Untitled', () => {
    expect(sanitizeDownloadBasename('   ')).toBe('Untitled')
    expect(sanitizeDownloadBasename(undefined)).toBe('Untitled')
  })
})

describe('orderedSongZipEntryNames', () => {
  it('numbers entries and uses cp/wp extensions', () => {
    const songs = [
      { data: { titles: ['Alpha'] } },
      { data: { titles: ['Beta'] } },
    ] as { data: { titles: string[] } }[]
    expect(orderedSongZipEntryNames(songs, 'chordpro')).toEqual([
      '01 - Alpha.cp',
      '02 - Beta.cp',
    ])
    expect(orderedSongZipEntryNames(songs, 'worshippro')).toEqual([
      '01 - Alpha.wp',
      '02 - Beta.wp',
    ])
  })
})

describe('songTitleFromData', () => {
  it('uses first title', () => {
    expect(songTitleFromData({ titles: ['  Amazing Grace  '] })).toBe('Amazing Grace')
  })

  it('falls back when empty', () => {
    expect(songTitleFromData({ titles: [] })).toBe('Untitled')
  })
})

describe('parseImportSource', () => {
  it('returns data on success', () => {
    const engine = mockEngine()
    const result = parseImportSource(engine, '{title: X}')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.titles).toEqual(['Hello'])
  })

  it('returns error message on failure', () => {
    const engine = mockEngine({
      parseChordPro: vi.fn(() => {
        throw new Error('bad chordpro')
      }),
    })
    const result = parseImportSource(engine, 'broken')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('bad chordpro')
  })
})

describe('createSongBodyFromParsed', () => {
  it('includes collection id', () => {
    const body = createSongBodyFromParsed({ titles: ['A'], sections: [] }, 'coll_1')
    expect(body.collection).toBe('coll_1')
    expect(body.not_a_song).toBe(false)
    expect(body.blobs).toEqual([])
  })
})

describe('importSongsBatch', () => {
  it('aggregates created and failed', async () => {
    const engine = mockEngine({
      parseChordPro: vi.fn((source: string) => {
        if (source === 'bad') throw new Error('parse fail')
        return { titles: ['Ok'], sections: [] } as ChordSongData
      }),
    })

    const good = new File(['ok'], 'good.cho', { type: 'text/plain' })
    const bad = new File(['bad'], 'bad.cho', { type: 'text/plain' })

    const postSong = vi.fn(async () => ({ id: 'song_new' }))

    const result = await importSongsBatch({
      files: [good, bad],
      engine,
      collection: 'coll_test',
      postSong,
    })

    expect(result.created).toHaveLength(1)
    expect(result.created[0]?.title).toBe('Ok')
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.name).toBe('bad.cho')
    expect(postSong).toHaveBeenCalledTimes(1)
  })
})
