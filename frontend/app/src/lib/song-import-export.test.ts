import { describe, expect, it, vi } from 'vitest'

import {
  buildPdfPrintCss,
  createSongBodyFromParsed,
  exportFileExtension,
  formatSongForExport,
  importFormatFromFilename,
  importSongsBatch,
  MAX_IMPORT_FILE_BYTES,
  orderedSongZipEntryNames,
  parseImportSource,
  readSongFiles,
  sanitizeDownloadBasename,
  songDataWithoutChords,
  songTitleFromData,
} from '@/lib/song-import-export'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

function mockEngine(overrides?: Partial<ChordEngine>): ChordEngine {
  return {
    parseChordPro: vi.fn(() => ({ titles: ['Hello'], sections: [] })),
    parseSongBeamer: vi.fn(() => ({ titles: ['Hello'], sections: [] })),
    parseProPresenter: vi.fn(() => ({ titles: ['Hello'], sections: [] })),
    parseUltimateGuitarHtml: vi.fn(),
    formatChordPro: vi.fn(() => '{title: Hello}'),
    formatSongBeamer: vi.fn(() => new Uint8Array([0xef, 0xbb, 0xbf])),
    formatProPresenter: vi.fn(() => new Uint8Array([0x08, 0x01])),
    renderA4Html: vi.fn(() => ({ html: '<div></div>', css: '' })),
    renderA4SectionHtmls: vi.fn(() => ({ sections: ['<p></p>'], css: '' })),
    transpose: vi.fn(),
    fillSectionReferences: vi.fn((song) => song),
    flowItems: vi.fn(() => []),
    customFlow: vi.fn(() => []),
    applyFlow: vi.fn((song) => song),
    ...overrides,
  }
}

describe('buildPdfPrintCss', () => {
  it('includes print pagination overrides scoped like chordlib CSS', () => {
    const css = buildPdfPrintCss()
    expect(css).toContain('@media print')
    expect(css).toContain('.pdf-export-root:nth-of-type(1) .page')
    expect(css).toContain('height: auto')
    expect(css).toContain('overflow: visible')
    expect(css).toContain('.pdf-export-root:nth-of-type(1) .columns')
  })

  it('emits one override block per exported page', () => {
    const css = buildPdfPrintCss(3)
    expect(css).toContain('.pdf-export-root:nth-of-type(1) .page')
    expect(css).toContain('.pdf-export-root:nth-of-type(2) .page')
    expect(css).toContain('.pdf-export-root:nth-of-type(3) .page')
    expect(css).not.toContain('.pdf-export-root:nth-of-type(4) .page')
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
  it('numbers entries and uses each format extension', () => {
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
    expect(orderedSongZipEntryNames(songs, 'songbeamer')).toEqual([
      '01 - Alpha.sng',
      '02 - Beta.sng',
    ])
    expect(orderedSongZipEntryNames(songs, 'propresenter')).toEqual([
      '01 - Alpha.pro',
      '02 - Beta.pro',
    ])
  })

  it('uses the selected language title when present', () => {
    const songs = [
      { data: { titles: ['Anchor', 'Anker'], languages: ['en', 'de'] }, language: 1 },
    ]
    expect(orderedSongZipEntryNames(songs, 'chordpro')).toEqual(['01 - Anker.cp'])
  })
})

describe('format routing', () => {
  it('detects binary formats case-insensitively and defaults to ChordPro', () => {
    expect(importFormatFromFilename('song.SNG')).toBe('songbeamer')
    expect(importFormatFromFilename('song.Pro')).toBe('propresenter')
    expect(importFormatFromFilename('song.wp')).toBe('chordpro')
    expect(importFormatFromFilename('untitled')).toBe('chordpro')
  })

  it('maps every export format to its canonical extension', () => {
    expect(exportFileExtension('chordpro')).toBe('cp')
    expect(exportFileExtension('worshippro')).toBe('wp')
    expect(exportFileExtension('songbeamer')).toBe('sng')
    expect(exportFileExtension('propresenter')).toBe('pro')
  })
})

describe('readSongFiles', () => {
  it('preserves arbitrary binary bytes', async () => {
    const result = await readSongFiles([new File([new Uint8Array([0, 255, 1])], 'song.pro')])
    expect(result).toHaveLength(1)
    expect(result[0]?.ok).toBe(true)
    if (result[0]?.ok) expect(Array.from(result[0].bytes)).toEqual([0, 255, 1])
  })

  it('rejects files larger than the existing limit', async () => {
    const file = new File([new Uint8Array(MAX_IMPORT_FILE_BYTES + 1)], 'large.sng')
    const result = await readSongFiles([file])
    expect(result[0]?.ok).toBe(false)
  })
})

describe('songTitleFromData', () => {
  it('uses first title', () => {
    expect(songTitleFromData({ titles: ['  Amazing Grace  '] })).toBe('Amazing Grace')
  })

  it('falls back when empty', () => {
    expect(songTitleFromData({ titles: [] })).toBe('Untitled')
  })

  it('uses selected language index for parallel titles', () => {
    expect(songTitleFromData({ titles: ['Anchor', 'Anker'], languages: ['en', 'de'] }, 1)).toBe('Anker')
  })
})

describe('formatSongForExport', () => {
  it('passes selected language index to chord engine', () => {
    const engine = mockEngine()
    formatSongForExport(
      engine,
      { titles: ['Hello'], sections: [] },
      'chordpro',
      'letters',
      'C',
      1,
      false,
    )
    expect(engine.formatChordPro).toHaveBeenCalledWith(
      { titles: ['Hello'], sections: [] },
      expect.objectContaining({ key: 'C', language: 1 }),
    )
  })

  it('passes key, representation, and language to ProPresenter', () => {
    const engine = mockEngine()
    formatSongForExport(
      engine,
      { titles: ['Hello'], sections: [] },
      'propresenter',
      'nashville',
      'D',
      1,
      false,
    )
    expect(engine.formatProPresenter).toHaveBeenCalledWith(
      { titles: ['Hello'], sections: [] },
      { key: 'D', representation: 'nashville', language: 1 },
    )
  })

  it('removes structured chords before binary export when chords are hidden', () => {
    const engine = mockEngine()
    const data = {
      titles: ['Hello'],
      sections: [{ lines: [{ parts: [{ chord: { root: 1 }, languages: ['Hello'] }] }] }],
    }
    formatSongForExport(engine, data, 'songbeamer', 'letters', undefined, undefined, true)
    expect(engine.formatSongBeamer).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: [{ lines: [{ parts: [{ chord: null, languages: ['Hello'] }] }] }],
      }),
      expect.any(Object),
    )
    expect(data.sections[0]!.lines[0]!.parts[0]!.chord).not.toBeNull()
  })
})

describe('songDataWithoutChords', () => {
  it('does not mutate the stored song', () => {
    const data = { sections: [{ lines: [{ parts: [{ chord: { root: 1 } }] }] }] }
    const copy = songDataWithoutChords(data)
    const sections = copy.sections as Array<{
      lines: Array<{ parts: Array<{ chord: unknown }> }>
    }>
    expect(sections[0]!.lines[0]!.parts[0]!.chord).toBeNull()
    expect(data.sections[0]!.lines[0]!.parts[0]!.chord).toEqual({ root: 1 })
  })
})

describe('parseImportSource', () => {
  it('returns data on success', () => {
    const engine = mockEngine()
    const result = parseImportSource(engine, 'song.cp', new TextEncoder().encode('{title: X}'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.titles).toEqual(['Hello'])
  })

  it('returns error message on failure', () => {
    const engine = mockEngine({
      parseChordPro: vi.fn(() => {
        throw new Error('bad chordpro')
      }),
    })
    const result = parseImportSource(engine, 'song.cp', new TextEncoder().encode('broken'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('bad chordpro')
  })

  it('dispatches SongBeamer and ProPresenter bytes without decoding them', () => {
    const engine = mockEngine()
    const bytes = new Uint8Array([0, 255, 1])
    expect(parseImportSource(engine, 'song.SNG', bytes).ok).toBe(true)
    expect(engine.parseSongBeamer).toHaveBeenCalledWith(bytes)
    expect(parseImportSource(engine, 'song.PRO', bytes).ok).toBe(true)
    expect(engine.parseProPresenter).toHaveBeenCalledWith(bytes)
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
