import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { components } from '@/api/schema'
import type { ChordSongData, SongFlowItem } from '@/ports/chord-engine'
import {
  applyFlowToSongData,
  applyFlowToSongDataAsync,
  hasCustomSongFlow,
  useResolvedPlayerItemChordData,
  useResolvedSongWithFlow,
} from '@/lib/player/apply-song-flow'

const applyFlow = vi.fn()
const getChordEngine = vi.fn(async () => ({ applyFlow }))

vi.mock('@/lib/chord-engine', () => ({
  getChordEngine: () => getChordEngine(),
}))

function songData(sections: Array<{ title: string }>): ChordSongData {
  return {
    titles: ['Test'],
    sections,
  } as ChordSongData
}

function song(sections: Array<{ title: string }>): components['schemas']['Song'] {
  return {
    id: 'song-1',
    blobs: [],
    not_a_song: false,
    owner: 'team-1',
    user_specific_addons: { liked: false },
    data: {
      titles: ['Test'],
      sections: sections.map((section) => ({ title: section.title, lines: [] })),
    },
  } as components['schemas']['Song']
}

function flow(title: string, repeats = 1): SongFlowItem {
  return { title, repeats, occurrence_index: 0 }
}

beforeEach(() => {
  applyFlow.mockReset()
  getChordEngine.mockClear()
})

describe('hasCustomSongFlow', () => {
  it('treats null, undefined, and empty arrays as inactive', () => {
    expect(hasCustomSongFlow(null)).toBe(false)
    expect(hasCustomSongFlow(undefined)).toBe(false)
    expect(hasCustomSongFlow([])).toBe(false)
  })

  it('treats non-empty arrays as active', () => {
    expect(hasCustomSongFlow([flow('Verse')])).toBe(true)
  })
})

describe('applyFlowToSongData', () => {
  it('returns the original data when flow is inactive', () => {
    const data = songData([{ title: 'Verse' }])
    const engine = { applyFlow } as never

    expect(applyFlowToSongData(engine, data, null)).toBe(data)
    expect(applyFlow).not.toHaveBeenCalled()
  })

  it('applies flow through the chord engine and falls back on error', () => {
    const data = songData([{ title: 'Verse' }])
    const engine = { applyFlow } as never
    applyFlow.mockReturnValue(songData([{ title: 'Chorus' }]))

    expect(applyFlowToSongData(engine, data, [flow('Chorus')])).toEqual(
      songData([{ title: 'Chorus' }]),
    )

    applyFlow.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(applyFlowToSongData(engine, data, [flow('Chorus')])).toBe(data)
  })
})

describe('applyFlowToSongDataAsync', () => {
  it('loads the engine and applies flow', async () => {
    const data = songData([{ title: 'Verse' }])
    applyFlow.mockReturnValue(songData([{ title: 'Chorus' }]))

    await expect(applyFlowToSongDataAsync(data, [flow('Chorus')])).resolves.toEqual(
      songData([{ title: 'Chorus' }]),
    )
    expect(getChordEngine).toHaveBeenCalledTimes(1)
  })
})

describe('useResolvedSongWithFlow', () => {
  it('returns the raw song when flow is inactive', () => {
    const source = song([{ title: 'Verse' }])
    const { result } = renderHook(() => useResolvedSongWithFlow(source, null))

    expect(result.current).toBe(source)
    expect(getChordEngine).not.toHaveBeenCalled()
  })

  it('applies flow asynchronously', async () => {
    const source = song([{ title: 'Verse' }])
    applyFlow.mockReturnValue(songData([{ title: 'Chorus' }]))

    const { result } = renderHook(() => useResolvedSongWithFlow(source, [flow('Chorus')]))

    await waitFor(() =>
      expect(
        (result.current.data as { sections: Array<{ title: string }> }).sections.map(
          (section) => section.title,
        ),
      ).toEqual(['Chorus']),
    )
  })
})

describe('useResolvedPlayerItemChordData', () => {
  it('returns undefined for non-chord items', () => {
    const { result } = renderHook(() =>
      useResolvedPlayerItemChordData({ type: 'blob', blob_id: 'blob-1' }),
    )

    expect(result.current).toBeUndefined()
  })

  it('applies flow for chord items', async () => {
    applyFlow.mockReturnValue(songData([{ title: 'Chorus' }]))
    const item = {
      type: 'chords',
      flow: [flow('Chorus')],
      song: song([{ title: 'Verse' }]),
    } as components['schemas']['PlayerItem']

    const { result } = renderHook(() => useResolvedPlayerItemChordData(item))

    await waitFor(() =>
      expect(
        (result.current?.sections as Array<{ title: string }> | undefined)?.map(
          (section) => section.title,
        ),
      ).toEqual(['Chorus']),
    )
  })
})
