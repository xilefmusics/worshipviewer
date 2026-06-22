import type { components } from '@/api/schema'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChordSongData } from '@/ports/chord-engine'

const getChordEngine = vi.fn()
const isSongFlowValid = vi.fn()

vi.mock('@/lib/chord-engine', () => ({
  getChordEngine: () => getChordEngine(),
}))

vi.mock('@/lib/player/resolve-song-flow', () => ({
  isSongFlowValid: (...args: unknown[]) => isSongFlowValid(...args),
}))

import { useSetlistFlowValidity } from '@/hooks/useSetlistFlowValidity'

type Song = components['schemas']['Song']

function chordSong(id: string): Song {
  return {
    id,
    blobs: [],
    not_a_song: false,
    owner: 'user:test',
    user_specific_addons: { liked: false },
    data: {
      titles: ['Test'],
      sections: [{ title: 'Verse', lines: [] }],
    },
  } as Song
}

describe('useSetlistFlowValidity', () => {
  const engine = { applyFlow: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    getChordEngine.mockResolvedValue(engine)
    isSongFlowValid.mockReturnValue(true)
  })

  it('returns an empty map when no slot has a custom flow', async () => {
    const songs = [chordSong('song-1')]
    const slotRows = [{ slotId: 'slot-1', link: { flow: null } }]

    const { result } = renderHook(() => useSetlistFlowValidity(slotRows, songs))

    await waitFor(() => {
      expect(result.current.size).toBe(0)
    })
    expect(getChordEngine).not.toHaveBeenCalled()
  })

  it('marks slots with invalid saved flow as stale', async () => {
    const flow = [{ title: 'Chorus', occurrence_index: 0, repeats: 1 }]
    const songs = [chordSong('song-1')]
    const slotRows = [{ slotId: 'slot-1', link: { flow } }]

    isSongFlowValid.mockReturnValue(false)

    const { result } = renderHook(() => useSetlistFlowValidity(slotRows, songs))

    await waitFor(() => {
      expect(result.current.get('slot-1')).toBe(true)
    })
    expect(isSongFlowValid).toHaveBeenCalledWith(
      engine,
      songs[0]?.data as ChordSongData,
      flow,
    )
  })

  it('does not mark slots when saved flow is valid', async () => {
    const flow = [{ title: 'Verse', occurrence_index: 0, repeats: 1 }]
    const songs = [chordSong('song-1')]
    const slotRows = [{ slotId: 'slot-1', link: { flow } }]

    isSongFlowValid.mockReturnValue(true)

    const { result } = renderHook(() => useSetlistFlowValidity(slotRows, songs))

    await waitFor(() => {
      expect(result.current.size).toBe(0)
    })
  })

  it('validates independent slots independently', async () => {
    const staleFlow = [{ title: 'Chorus', occurrence_index: 0, repeats: 1 }]
    const validFlow = [{ title: 'Verse', occurrence_index: 0, repeats: 1 }]
    const songs = [chordSong('song-1'), chordSong('song-2')]
    const slotRows = [
      { slotId: 'slot-stale', link: { flow: staleFlow } },
      { slotId: 'slot-valid', link: { flow: validFlow } },
    ]

    isSongFlowValid.mockImplementation((_engine, _data, flow) => flow[0]?.title === 'Verse')

    const { result } = renderHook(() => useSetlistFlowValidity(slotRows, songs))

    await waitFor(() => {
      expect(result.current.get('slot-stale')).toBe(true)
      expect(result.current.has('slot-valid')).toBe(false)
    })
  })

  it('skips blob songs and unloaded slots', async () => {
    const flow = [{ title: 'Verse', occurrence_index: 0, repeats: 1 }]
    const blobSong = { ...chordSong('blob-1'), not_a_song: true } as Song
    const slotRows = [
      { slotId: 'slot-blob', link: { flow } },
      { slotId: 'slot-missing', link: { flow } },
    ]

    const { result } = renderHook(() =>
      useSetlistFlowValidity(slotRows, [blobSong, undefined]),
    )

    await waitFor(() => {
      expect(result.current.size).toBe(0)
    })
    expect(getChordEngine).not.toHaveBeenCalled()
  })

  it('does not revalidate when hydrated song array reference changes but content is unchanged', async () => {
    const songs = [chordSong('song-1')]
    const slotRows = [{ slotId: 'slot-1', link: { flow: null } }]

    const { rerender } = renderHook(
      ({ hydratedSongs }) => useSetlistFlowValidity(slotRows, hydratedSongs),
      { initialProps: { hydratedSongs: songs } },
    )

    await waitFor(() => {
      expect(getChordEngine).not.toHaveBeenCalled()
    })

    rerender({ hydratedSongs: [...songs] })
    rerender({ hydratedSongs: [...songs] })

    expect(getChordEngine).not.toHaveBeenCalled()
  })
})
