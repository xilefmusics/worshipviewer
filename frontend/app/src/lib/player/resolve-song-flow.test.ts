import { describe, expect, it, vi } from 'vitest'

import { isSongFlowValid, resolveSongDataWithFlow } from '@/lib/player/resolve-song-flow'
import type { ChordEngine, ChordSongData, SongFlowItem } from '@/ports/chord-engine'

function songData(sections: Array<{ title: string }>): ChordSongData {
  return {
    titles: ['Test'],
    sections,
  } as ChordSongData
}

function flow(title: string, occurrenceIndex = 0, repeats = 1): SongFlowItem {
  return { title, occurrence_index: occurrenceIndex, repeats }
}

function mockEngine(overrides?: Partial<ChordEngine>): ChordEngine {
  return {
    parseChordPro: vi.fn(),
    parseUltimateGuitarHtml: vi.fn(),
    formatChordPro: vi.fn(),
    renderA4Html: vi.fn(),
    renderA4SectionHtmls: vi.fn(),
    transpose: vi.fn(),
    fillSectionReferences: vi.fn((song) => song),
    flowItems: vi.fn(() => []),
    customFlow: vi.fn(() => []),
    applyFlow: vi.fn((song) => song),
    ...overrides,
  }
}

describe('resolveSongDataWithFlow', () => {
  it('returns the original data when flow is null', () => {
    const data = songData([{ title: 'Verse' }])
    const engine = mockEngine()

    expect(resolveSongDataWithFlow(engine, data, null)).toBe(data)
    expect(engine.applyFlow).not.toHaveBeenCalled()
  })

  it('returns the original data when flow is empty', () => {
    const data = songData([{ title: 'Verse' }])
    const engine = mockEngine()

    expect(resolveSongDataWithFlow(engine, data, [])).toBe(data)
    expect(engine.applyFlow).not.toHaveBeenCalled()
  })

  it('applies a valid custom flow', () => {
    const data = songData([{ title: 'Verse' }, { title: 'Chorus' }])
    const customFlow = [flow('Chorus', 0, 2), flow('Verse')]
    const applyFlow = vi.fn((_song, flowArg: SongFlowItem[]) => ({
      titles: ['Test'],
      sections: flowArg.map((item) => ({ title: `${item.title}:${item.repeats}` })),
    }))
    const engine = mockEngine({ applyFlow })

    const resolved = resolveSongDataWithFlow(engine, data, customFlow)

    expect(applyFlow).toHaveBeenCalledTimes(1)
    expect(applyFlow.mock.calls[0]?.[1]).toEqual(customFlow)
    const sections = resolved.sections as Array<{ title: string }>
    expect(sections.map((section) => section.title)).toEqual(['Chorus:2', 'Verse:1'])
  })

  it('falls back to the original data when applyFlow throws', () => {
    const data = songData([{ title: 'Verse' }])
    const engine = mockEngine({
      applyFlow: vi.fn(() => {
        throw new Error('boom')
      }),
    })

    expect(resolveSongDataWithFlow(engine, data, [flow('Chorus')])).toBe(data)
  })

  it('passes duplicate titled sections with distinct occurrence indices', () => {
    const data = songData([{ title: 'Verse' }, { title: 'Verse' }])
    const customFlow = [flow('Verse', 1), flow('Verse', 0)]
    const applyFlow = vi.fn((_song, flowArg: SongFlowItem[]) => ({
      titles: ['Test'],
      sections: flowArg.map((item) => ({
        title: `${item.title}:${item.occurrence_index}`,
      })),
    }))
    const engine = mockEngine({ applyFlow })

    const resolved = resolveSongDataWithFlow(engine, data, customFlow)

    expect(applyFlow.mock.calls[0]?.[1]).toEqual(customFlow)
    const sections = resolved.sections as Array<{ title: string }>
    expect(sections.map((section) => section.title)).toEqual(['Verse:1', 'Verse:0'])
  })

  it('produces the same section sequence for Book and export consumers', () => {
    const data = songData([{ title: 'Verse' }, { title: 'Chorus' }])
    const customFlow = [flow('Chorus', 0, 2), flow('Verse')]
    const applyFlow = vi.fn((_song, flowArg: SongFlowItem[]) => ({
      titles: ['Test'],
      sections: flowArg.map((item) => ({ title: item.title, repeats: item.repeats })),
    }))
    const engine = mockEngine({ applyFlow })

    const bookResolved = resolveSongDataWithFlow(engine, data, customFlow)
    const exportResolved = resolveSongDataWithFlow(engine, data, customFlow)

    expect(bookResolved.sections).toEqual(exportResolved.sections)
    const sections = bookResolved.sections as Array<{ title: string }>
    expect(sections.map((section) => section.title)).toEqual(['Chorus', 'Verse'])
  })
})

describe('isSongFlowValid', () => {
  it('returns true when flow is null or empty', () => {
    const data = songData([{ title: 'Verse' }])
    const engine = mockEngine()

    expect(isSongFlowValid(engine, data, null)).toBe(true)
    expect(isSongFlowValid(engine, data, [])).toBe(true)
    expect(engine.applyFlow).not.toHaveBeenCalled()
  })

  it('returns true when applyFlow succeeds', () => {
    const data = songData([{ title: 'Verse' }, { title: 'Chorus' }])
    const engine = mockEngine({
      applyFlow: vi.fn((song) => song),
    })

    expect(isSongFlowValid(engine, data, [flow('Chorus')])).toBe(true)
  })

  it('returns false when applyFlow throws for missing section', () => {
    const data = songData([{ title: 'Verse' }])
    const engine = mockEngine({
      applyFlow: vi.fn(() => {
        throw new Error('missing section')
      }),
    })

    expect(isSongFlowValid(engine, data, [flow('Chorus')])).toBe(false)
  })

  it('returns false when applyFlow throws for wrong occurrence index', () => {
    const data = songData([{ title: 'Verse' }])
    const engine = mockEngine({
      applyFlow: vi.fn(() => {
        throw new Error('bad occurrence')
      }),
    })

    expect(isSongFlowValid(engine, data, [flow('Verse', 1)])).toBe(false)
  })

  it('returns false when applyFlow throws for invalid repeats', () => {
    const data = songData([{ title: 'Verse' }])
    const engine = mockEngine({
      applyFlow: vi.fn(() => {
        throw new Error('invalid repeats')
      }),
    })

    expect(isSongFlowValid(engine, data, [flow('Verse', 0, 0)])).toBe(false)
  })
})
