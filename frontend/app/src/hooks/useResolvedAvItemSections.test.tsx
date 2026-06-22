import type { components } from '@/api/schema'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChordSongData } from '@/ports/chord-engine'

const getChordEngine = vi.fn()
const resolveSongDataWithFlow = vi.fn()

vi.mock('@/lib/chord-engine', () => ({
  getChordEngine: () => getChordEngine(),
}))

vi.mock('@/lib/player/resolve-song-flow', () => ({
  resolveSongDataWithFlow: (...args: unknown[]) => resolveSongDataWithFlow(...args),
}))

import { useResolvedAvItemSections } from '@/hooks/useResolvedAvItemSections'

type PlayerItem = components['schemas']['PlayerItem']

const rawSections = [
  {
    title: 'Verse',
    lines: [{ parts: [{ comment: false, languages: ['Hello'] }] }],
  },
  {
    title: 'Chorus',
    lines: [{ parts: [{ comment: false, languages: ['Sing'] }] }],
  },
]

function chordItem(flow: components['schemas']['SongFlowItem'][] | null = null): PlayerItem {
  return {
    type: 'chords',
    flow,
    song: {
      id: 'song-1',
      blobs: [],
      not_a_song: false,
      owner: 'user:test',
      user_specific_addons: { liked: false },
      data: {
        titles: ['Test'],
        sections: rawSections,
      },
    },
    language: null,
  } as PlayerItem
}

describe('useResolvedAvItemSections', () => {
  const engine = { applyFlow: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    getChordEngine.mockResolvedValue(engine)
    resolveSongDataWithFlow.mockImplementation(
      (_engine, data: ChordSongData) => data as ChordSongData,
    )
  })

  it('returns raw sections when flow is null', async () => {
    const { result } = renderHook(() => useResolvedAvItemSections([chordItem(null)]))

    await waitFor(() => {
      expect(result.current.get(0)?.map((section) => section.title)).toEqual(['Verse', 'Chorus'])
    })
    expect(getChordEngine).not.toHaveBeenCalled()
    expect(resolveSongDataWithFlow).not.toHaveBeenCalled()
  })

  it('resolves custom flow sections per item index', async () => {
    const customFlow = [{ title: 'Chorus', occurrence_index: 0, repeats: 1 }]
    resolveSongDataWithFlow.mockReturnValue({
      titles: ['Test'],
      sections: [
        {
          title: 'Chorus',
          lines: [{ parts: [{ comment: false, languages: ['Sing'] }] }],
        },
      ],
    })

    const { result } = renderHook(() =>
      useResolvedAvItemSections([chordItem(customFlow)]),
    )

    await waitFor(() => {
      expect(resolveSongDataWithFlow).toHaveBeenCalledWith(
        engine,
        expect.objectContaining({ sections: rawSections }),
        customFlow,
      )
    })
    await waitFor(() => {
      expect(result.current.get(0)?.map((section) => section.title)).toEqual(['Chorus'])
    })
  })

  it('keeps duplicate song occurrences independent', async () => {
    const flowA = [{ title: 'Chorus', occurrence_index: 0, repeats: 1 }]
    const flowB = [{ title: 'Verse', occurrence_index: 0, repeats: 1 }]
    resolveSongDataWithFlow.mockImplementation((_engine, _data, flow) => {
      if (flow?.[0]?.title === 'Chorus') {
        return {
          titles: ['Test'],
          sections: [
            {
              title: 'Chorus',
              lines: [{ parts: [{ comment: false, languages: ['Sing'] }] }],
            },
          ],
        }
      }
      return {
        titles: ['Test'],
        sections: [
          {
            title: 'Verse',
            lines: [{ parts: [{ comment: false, languages: ['Hello'] }] }],
          },
        ],
      }
    })

    const { result } = renderHook(() =>
      useResolvedAvItemSections([chordItem(flowA), chordItem(flowB)]),
    )

    await waitFor(() => {
      expect(result.current.get(0)?.[0]?.title).toBe('Chorus')
      expect(result.current.get(1)?.[0]?.title).toBe('Verse')
    })
  })

  it('falls back to raw sections when resolution throws', async () => {
    getChordEngine.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() =>
      useResolvedAvItemSections([
        chordItem([{ title: 'Chorus', occurrence_index: 0, repeats: 1 }]),
      ]),
    )

    await waitFor(() => {
      expect(result.current.get(0)?.map((section) => section.title)).toEqual(['Verse', 'Chorus'])
    })
  })
})
