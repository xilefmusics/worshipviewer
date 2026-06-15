import { describe, expect, it } from 'vitest'

import {
  resolveSongLanguageIndex,
  songLanguageOptions,
} from '@/lib/player/song-language'
import type { ChordSongData } from '@/ports/chord-engine'

describe('song-language', () => {
  it('uses song language metadata for labels', () => {
    expect(songLanguageOptions({ languages: ['en', 'de-CH'] })).toEqual([
      { index: 0, label: 'en' },
      { index: 1, label: 'de-CH' },
    ])
  })

  it('falls back to lyric track count when metadata is missing', () => {
    const songData: ChordSongData = {
      sections: [
        {
          lines: [
            {
              parts: [{ comment: false, languages: ['Hello', 'Hallo'] }],
            },
          ],
        },
      ],
    }

    expect(songLanguageOptions(songData)).toEqual([
      { index: 0, label: 'L1' },
      { index: 1, label: 'L2' },
    ])
  })

  it('ignores saved language indexes outside available options', () => {
    const options = [
      { index: 0, label: 'en' },
      { index: 1, label: 'de' },
    ]

    expect(resolveSongLanguageIndex(options, 1)).toBe(1)
    expect(resolveSongLanguageIndex(options, 2)).toBe(0)
    expect(resolveSongLanguageIndex(options, -1)).toBe(0)
  })
})
