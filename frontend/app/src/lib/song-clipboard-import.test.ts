import { describe, expect, it, vi } from 'vitest'

import { isLikelySongClipboardText, parseSongClipboardText } from '@/lib/song-clipboard-import'
import type { ChordEngine } from '@/ports/chord-engine'

function mockEngine(overrides: Partial<ChordEngine> = {}): ChordEngine {
  return {
    parseChordPro: vi.fn(() => ({ titles: ['Imported'], sections: [] })),
    parseMarkdown: vi.fn(() => ({})),
    parsePdf: vi.fn(() => ({})),
    parseSongBeamer: vi.fn(() => ({})),
    parseProPresenter: vi.fn(() => ({})),
    parseUltimateGuitarHtml: vi.fn(() => ({ titles: ['Ultimate Song'], sections: [] })),
    formatChordPro: vi.fn(() => ''),
    formatMarkdown: vi.fn(() => ''),
    formatSongBeamer: vi.fn(() => new Uint8Array()),
    formatProPresenter: vi.fn(() => new Uint8Array()),
    renderA4Html: vi.fn(() => ({ html: '', css: '' })),
    renderA4SectionHtmls: vi.fn(() => ({ sections: [], css: '' })),
    transpose: vi.fn((song) => song),
    fillSectionReferences: vi.fn((song) => song),
    flowItems: vi.fn(() => []),
    customFlow: vi.fn(() => []),
    applyFlow: vi.fn((song) => song),
    ...overrides,
  }
}

describe('song clipboard import', () => {
  it('recognizes and parses ChordPro and WorshipPro text', () => {
    const engine = mockEngine()
    const source = '{title: Test Song}\n{artist: Test Artist}\n[C]Hello'

    expect(isLikelySongClipboardText(source)).toBe(true)
    expect(parseSongClipboardText(engine, source)).toEqual({ titles: ['Imported'], sections: [] })
    expect(engine.parseChordPro).toHaveBeenCalledWith(source)
  })

  it('recognizes and parses saved Ultimate Guitar page HTML', () => {
    const engine = mockEngine()
    const source = '<!DOCTYPE html><html><body>ultimate-guitar</body></html>'

    expect(isLikelySongClipboardText(source)).toBe(true)
    expect(parseSongClipboardText(engine, source)).toEqual({
      titles: ['Ultimate Song'],
      sections: [],
    })
    expect(engine.parseUltimateGuitarHtml).toHaveBeenCalledWith(source)
  })

  it('leaves ordinary text and Ultimate Guitar URLs unrecognized', () => {
    const engine = mockEngine()

    expect(isLikelySongClipboardText('Some text to paste into search')).toBe(false)
    expect(
      isLikelySongClipboardText('https://tabs.ultimate-guitar.com/tab/artist/song-123'),
    ).toBe(false)
    expect(parseSongClipboardText(engine, 'Some text to paste into search')).toBeNull()
    expect(engine.parseChordPro).not.toHaveBeenCalled()
  })

  it('does not return a song when a recognized format fails to parse', () => {
    const engine = mockEngine({
      parseChordPro: vi.fn(() => {
        throw new Error('invalid source')
      }),
    })

    expect(parseSongClipboardText(engine, '{title: Broken}')).toBeNull()
  })

  it('does not return empty parser results as importable songs', () => {
    const engine = mockEngine({ parseChordPro: vi.fn(() => ({ titles: [], sections: [] })) })

    expect(parseSongClipboardText(engine, '{title: Empty}')).toBeNull()
  })
})
