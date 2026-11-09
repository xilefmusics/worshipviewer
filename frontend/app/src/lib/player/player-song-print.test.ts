import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getChordEngine } from '@/lib/chord-engine'
import { exportSongPdf } from '@/lib/song-import-export'
import { printPlayerSongPdf } from '@/lib/player/player-song-print'
import type { ChordEngine, ChordSongData, SongFlowItem } from '@/ports/chord-engine'

vi.mock('@/lib/chord-engine', () => ({ getChordEngine: vi.fn() }))
vi.mock('@/lib/song-import-export', () => ({ exportSongPdf: vi.fn() }))

describe('printPlayerSongPdf', () => {
  beforeEach(() => {
    vi.mocked(getChordEngine).mockReset()
    vi.mocked(exportSongPdf).mockReset()
  })

  it('applies the current song flow and forwards player print settings', async () => {
    const data: ChordSongData = { titles: ['Song'], key: 'C' }
    const flow: SongFlowItem[] = [{ title: 'Chorus', occurrence_index: 0, repeats: 1 }]
    const applyFlow = vi.fn((song: ChordSongData) => ({ ...song, flowApplied: true }))
    const engine = { applyFlow } as unknown as ChordEngine
    vi.mocked(getChordEngine).mockResolvedValue(engine)
    vi.mocked(exportSongPdf).mockResolvedValue()

    await printPlayerSongPdf(data, flow, {
      key: 'D',
      languageIndex: 1,
      capoFret: 2,
      chordFormat: 'nashville',
      hideChords: true,
    })

    expect(applyFlow).toHaveBeenCalledWith(data, flow)
    expect(exportSongPdf).toHaveBeenCalledWith(
      engine,
      { titles: ['Song'], key: 'C', flowApplied: true },
      'nashville',
      true,
      { key: 'D', language: 1, titleLanguage: 1, capo: 2 },
    )
  })
})
