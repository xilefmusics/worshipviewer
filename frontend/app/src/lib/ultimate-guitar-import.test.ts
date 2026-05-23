import { describe, expect, it } from 'vitest'

import {
  importUltimateGuitarHtml,
  isLikelyUltimateGuitarHtml,
  isUltimateGuitarUrl,
  shouldAttemptUgImport,
} from '@/lib/ultimate-guitar-import'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

const mockEngine: ChordEngine = {
  parseChordPro() {
    return {}
  },
  parseUltimateGuitarHtml() {
    return { titles: ['Imported'] }
  },
  formatChordPro(song: ChordSongData) {
    return `{title: ${(song.titles as string[])[0]}}\n\n[C]Line`
  },
  renderA4Html() {
    return { html: '', css: '' }
  },
  renderA4SectionHtmls() {
    return { sections: [], css: '' }
  },
  transpose(song: ChordSongData) {
    return song
  },
}

describe('isUltimateGuitarUrl', () => {
  it('matches tabs.ultimate-guitar.com URLs', () => {
    expect(
      isUltimateGuitarUrl('https://tabs.ultimate-guitar.com/tab/coldplay/yellow-chords-123'),
    ).toBe(true)
  })

  it('matches www.ultimate-guitar.com URLs', () => {
    expect(isUltimateGuitarUrl('https://www.ultimate-guitar.com/tab/artist/song-123')).toBe(true)
  })

  it('rejects non-UG URLs', () => {
    expect(isUltimateGuitarUrl('https://example.com/tab')).toBe(false)
  })

  it('rejects URL with trailing text', () => {
    expect(
      isUltimateGuitarUrl('https://tabs.ultimate-guitar.com/tab/x/y-1\nextra'),
    ).toBe(false)
  })
})

describe('isLikelyUltimateGuitarHtml', () => {
  it('detects saved UG page HTML', () => {
    const html = `<!DOCTYPE html><html><body><div class="js-store" data-content="{}"></div></body></html>`
    expect(isLikelyUltimateGuitarHtml(html)).toBe(true)
  })

  it('rejects ChordPro source', () => {
    expect(isLikelyUltimateGuitarHtml('{title: Test}\n\n[C]Hello')).toBe(false)
  })

  it('rejects generic HTML without UG markers', () => {
    expect(isLikelyUltimateGuitarHtml('<!DOCTYPE html><html><body></body></html>')).toBe(false)
  })
})

describe('shouldAttemptUgImport', () => {
  it('returns true for UG HTML when parse failed', () => {
    const html = `<!DOCTYPE html><html><body><div class="js-store"></div></body></html>`
    expect(shouldAttemptUgImport(html, false)).toBe(true)
  })

  it('returns false when parse already succeeded', () => {
    const html = `<!DOCTYPE html><html><body><div class="js-store"></div></body></html>`
    expect(shouldAttemptUgImport(html, true)).toBe(false)
  })
})

describe('importUltimateGuitarHtml', () => {
  it('formats parsed data as WorshipPro source', () => {
    const result = importUltimateGuitarHtml(mockEngine, '<html></html>', 'letters')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toContain('Imported')
      expect(result.data.titles).toEqual(['Imported'])
    }
  })

  it('returns parse errors from the engine', () => {
    const failingEngine: ChordEngine = {
      ...mockEngine,
      parseUltimateGuitarHtml() {
        throw new Error('div.js-store not found')
      },
    }
    const result = importUltimateGuitarHtml(failingEngine, '<html></html>', 'letters')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('div.js-store not found')
    }
  })
})
