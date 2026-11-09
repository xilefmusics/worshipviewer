import { describe, expect, it, vi } from 'vitest'

import { formatPlayerSongAsWorshipPro } from '@/lib/player/player-song-copy'
import type { ChordEngine, ChordSongData, SongFlowItem } from '@/ports/chord-engine'

describe('formatPlayerSongAsWorshipPro', () => {
  it('applies the player flow and formats the selected key and language', () => {
    const data: ChordSongData = { key: 'C', titles: ['Song'] }
    const flow: SongFlowItem[] = [{ title: 'Chorus', occurrence_index: 0, repeats: 2 }]
    const applyFlow = vi.fn((song: ChordSongData) => ({ ...song, flowApplied: true }))
    const formatChordPro = vi.fn(() => '{title: Song}\n[C]line')
    const engine = { applyFlow, formatChordPro } as unknown as ChordEngine

    const formatted = formatPlayerSongAsWorshipPro(engine, data, flow, {
      key: 'D',
      languageIndex: 1,
      chordFormat: 'nashville',
      hideChords: false,
    })

    expect(formatted).toBe('{title: Song}\n[C]line')
    expect(applyFlow).toHaveBeenCalledWith(data, flow)
    expect(formatChordPro).toHaveBeenCalledWith(
      { key: 'C', titles: ['Song'], flowApplied: true },
      { worshipPro: true, key: 'D', language: 1, representation: 'nashville' },
    )
  })

  it('removes chords when the player preference hides them', () => {
    const formatChordPro = vi.fn(() => '{title: Song}\n[C]Hello [G]there')
    const engine = { formatChordPro } as unknown as ChordEngine

    const formatted = formatPlayerSongAsWorshipPro(
      engine,
      { key: 'G' },
      undefined,
      { chordFormat: 'letters', hideChords: true },
    )

    expect(formatted).toBe('{title: Song}\nHello there')
    expect(formatChordPro).toHaveBeenCalledWith(
      { key: 'G' },
      { worshipPro: true, key: 'G', language: undefined, representation: 'default' },
    )
  })
})
