import { describe, expect, it } from 'vitest'

import { buildAvLyricSlides } from '@/lib/player/av-lyric-slides'

describe('buildAvLyricSlides', () => {
  it('splits lines by maxLinesPerSlide', () => {
    const result = buildAvLyricSlides(
      [
        {
          title: 'Verse 1',
          lines: [
            { parts: [{ comment: false, languages: ['Line one'] }] },
            { parts: [{ comment: false, languages: ['Line two'] }] },
            { parts: [{ comment: false, languages: ['Line three'] }] },
          ],
        },
      ],
      2,
    )

    expect(result.slides).toEqual(['Line one\nLine two', 'Line three'])
    expect(result.outline[0]?.title).toBe('Verse 1')
    expect(result.outline[0]?.len).toBe(2)
  })

  it('skips comment-only parts', () => {
    const result = buildAvLyricSlides(
      [
        {
          title: 'Chorus',
          lines: [{ parts: [{ comment: true, languages: ['hidden'] }] }],
        },
      ],
      2,
    )
    expect(result.slides).toEqual([])
  })
})
