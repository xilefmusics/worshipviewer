import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChordEngine, ChordSongData, SongFlowItem } from '@/ports/chord-engine'

const fetchSongForHubSlot = vi.fn()
const resolveSongDataWithFlow = vi.fn()

vi.mock('@/api/setlists-detail', () => ({
  fetchSongForHubSlot: (...args: unknown[]) => fetchSongForHubSlot(...args),
}))

vi.mock('@/lib/player/resolve-song-flow', () => ({
  resolveSongDataWithFlow: (...args: unknown[]) => resolveSongDataWithFlow(...args),
}))

import { hydrateSongLinksForHubExport } from '@/lib/hydrate-hub-song-links'

function songData(): ChordSongData {
  return {
    titles: ['Test'],
    sections: [{ title: 'Verse' }, { title: 'Chorus' }],
  } as ChordSongData
}

function flow(title: string, occurrenceIndex = 0, repeats = 1): SongFlowItem {
  return { title, occurrence_index: occurrenceIndex, repeats }
}

function mockEngine(): ChordEngine {
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
  }
}

describe('hydrateSongLinksForHubExport', () => {
  const queryClient = new QueryClient()
  const engine = mockEngine()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchSongForHubSlot.mockResolvedValue({
      id: 'song-1',
      not_a_song: false,
      data: songData(),
    })
    resolveSongDataWithFlow.mockImplementation((_engine, data: ChordSongData) => data)
  })

  it('skips flow resolution when flow is null', async () => {
    const rows = await hydrateSongLinksForHubExport(
      queryClient,
      [{ id: 'song-1', flow: null }],
      engine,
    )

    expect(resolveSongDataWithFlow).toHaveBeenCalledWith(engine, songData(), null)
    expect(rows).toHaveLength(1)
    const sections = rows[0]?.data.sections as Array<{ title: string }>
    expect(sections.map((section) => section.title)).toEqual(['Verse', 'Chorus'])
  })

  it('applies flow resolution when flow is set', async () => {
    const customFlow = [flow('Chorus', 0, 2), flow('Verse')]
    resolveSongDataWithFlow.mockReturnValue({
      titles: ['Test'],
      sections: [{ title: 'Chorus' }, { title: 'Verse' }],
    })

    const rows = await hydrateSongLinksForHubExport(
      queryClient,
      [{ id: 'song-1', flow: customFlow }],
      engine,
    )

    expect(resolveSongDataWithFlow).toHaveBeenCalledWith(engine, songData(), customFlow)
    const sections = rows[0]?.data.sections as Array<{ title: string }>
    expect(sections.map((section) => section.title)).toEqual(['Chorus', 'Verse'])
  })

  it('resolves duplicate song links independently', async () => {
    const flowA = [flow('Chorus')]
    const flowB = [flow('Verse')]
    resolveSongDataWithFlow
      .mockReturnValueOnce({ titles: ['Test'], sections: [{ title: 'Chorus' }] })
      .mockReturnValueOnce({ titles: ['Test'], sections: [{ title: 'Verse' }] })

    const rows = await hydrateSongLinksForHubExport(
      queryClient,
      [
        { id: 'song-1', flow: flowA },
        { id: 'song-1', flow: flowB },
      ],
      engine,
    )

    expect(resolveSongDataWithFlow).toHaveBeenNthCalledWith(1, engine, songData(), flowA)
    expect(resolveSongDataWithFlow).toHaveBeenNthCalledWith(2, engine, songData(), flowB)
    expect(rows).toHaveLength(2)
    const sectionsA = rows[0]?.data.sections as Array<{ title: string }>
    const sectionsB = rows[1]?.data.sections as Array<{ title: string }>
    expect(sectionsA[0]?.title).toBe('Chorus')
    expect(sectionsB[0]?.title).toBe('Verse')
  })
})
