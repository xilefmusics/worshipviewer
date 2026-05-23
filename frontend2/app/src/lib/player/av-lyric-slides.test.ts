import { describe, expect, it } from 'vitest'

import {
  buildAvLyricSlides,
  buildAvOutlineRows,
  buildAvPresentationSlides,
  buildAvSlideDeckEntries,
  resolveAvOutlineSlideText,
} from '@/lib/player/av-lyric-slides'

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

describe('buildAvSlideDeckEntries', () => {
  it('builds clickable cards from outline and slides', () => {
    const { slides, outline } = buildAvLyricSlides(
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

    const entries = buildAvSlideDeckEntries(outline, slides)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.slideIndex).toBe(0)
    expect(entries[0]?.label).toBe('Verse 1')
    expect(entries[0]?.text).toBe('Line one\nLine two')
    expect(entries[1]?.label).toBe('Verse 1 (2)')
    expect(entries[1]?.text).toBe('Line three')
    expect(entries[1]?.isSubSlide).toBe(true)
  })

  it('uses raw slide text after skipped no-text outline rows', () => {
    const outline = [
      {
        title: 'Intro',
        textIdx: Number.MAX_SAFE_INTEGER,
        outlineIdx: 0,
        len: 1,
        duplicate: false,
        hasText: false,
      },
      {
        title: 'Verse 1',
        textIdx: 0,
        outlineIdx: 1,
        len: 1,
        duplicate: false,
        hasText: true,
      },
    ]
    const slides = ['Verse line']

    const entries = buildAvSlideDeckEntries(outline, slides)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.slideIndex).toBe(1)
    expect(entries[0]?.text).toBe('Verse line')
  })

  it('shares section text by title like legacy presenter', () => {
    const result = buildAvLyricSlides(
      [
        {
          title: 'Chorus',
          lines: [{ parts: [{ comment: false, languages: ['First chorus'] }] }],
        },
        {
          title: 'Verse 1',
          lines: [{ parts: [{ comment: false, languages: ['Verse line'] }] }],
        },
        {
          title: 'Chorus',
          lines: [],
        },
      ],
      2,
    )

    expect(result.outline[2]?.duplicate).toBe(true)
    expect(result.outline[2]?.hasText).toBe(true)
    expect(buildAvSlideDeckEntries(result.outline, result.slides)).toHaveLength(2)
  })
})

describe('buildAvOutlineRows', () => {
  it('marks the current slide as selected', () => {
    const { outline } = buildAvLyricSlides(
      [
        {
          title: 'Verse 1',
          lines: [{ parts: [{ comment: false, languages: ['Line one'] }] }],
        },
        {
          title: 'Chorus',
          lines: [{ parts: [{ comment: false, languages: ['Sing it'] }] }],
        },
      ],
      2,
    )

    const rows = buildAvOutlineRows(outline, 1)
    expect(rows.find((row) => row.slideIndex === 1)?.selected).toBe(true)
    expect(rows.find((row) => row.slideIndex === 0)?.selected).toBe(false)
  })

  it('selects no-text outline rows by presentation index', () => {
    const outline = [
      {
        title: 'Intro',
        textIdx: Number.MAX_SAFE_INTEGER,
        outlineIdx: 0,
        len: 1,
        duplicate: false,
        hasText: false,
      },
      {
        title: 'Verse 1',
        textIdx: 0,
        outlineIdx: 1,
        len: 1,
        duplicate: false,
        hasText: true,
      },
    ]
    const rows = buildAvOutlineRows(outline, 0)
    expect(rows[0]?.selected).toBe(true)
    expect(rows[0]?.hasText).toBe(false)
  })
})

describe('buildAvPresentationSlides', () => {
  it('borrows text from another section with the same base name', () => {
    const outline = [
      {
        title: 'Intro',
        textIdx: Number.MAX_SAFE_INTEGER,
        outlineIdx: 0,
        len: 1,
        duplicate: false,
        hasText: false,
      },
      {
        title: 'Chorus',
        textIdx: 0,
        outlineIdx: 1,
        len: 1,
        duplicate: false,
        hasText: true,
      },
      {
        title: 'Chorus (2)',
        textIdx: Number.MAX_SAFE_INTEGER,
        outlineIdx: 2,
        len: 1,
        duplicate: true,
        hasText: false,
      },
    ]
    const slides = ['Sing it loud']

    expect(buildAvPresentationSlides(outline, slides)).toEqual(['', 'Sing it loud', 'Sing it loud'])
    expect(resolveAvOutlineSlideText(outline, slides, outline[2]!)).toBe('Sing it loud')
  })

  it('uses an empty slide when no donor exists', () => {
    const outline = [
      {
        title: 'Interlude',
        textIdx: Number.MAX_SAFE_INTEGER,
        outlineIdx: 0,
        len: 1,
        duplicate: false,
        hasText: false,
      },
    ]

    expect(buildAvPresentationSlides(outline, [])).toEqual([''])
  })
})
