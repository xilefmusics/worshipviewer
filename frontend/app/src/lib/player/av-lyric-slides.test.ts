import { describe, expect, it } from 'vitest'

import {
  avLyricLinesToSlideText,
  avSlideDeckEntrySlideIndex,
  buildAvBilingualLyricSlides,
  buildAvLyricSlides,
  buildAvOutlineRows,
  buildAvPresentationSlides,
  buildAvPresentationStructuredSlides,
  buildAvSlideDeckEntries,
  distributeSlideLineCounts,
  resolveAvEffectivePrimaryLanguageIndex,
  resolveAvOutlineSlideText,
  resolveAvSecondaryLanguageIndex,
  songHasUsableLyricsAtIndex,
} from '@/lib/player/av-lyric-slides'

describe('distributeSlideLineCounts', () => {
  it('splits evenly when lines divide cleanly', () => {
    expect(distributeSlideLineCounts(6, 2, true)).toEqual([2, 2, 2])
  })

  it('balances a trailing single line onto the previous slide', () => {
    expect(distributeSlideLineCounts(5, 2, true)).toEqual([2, 3])
    expect(distributeSlideLineCounts(7, 2, true)).toEqual([2, 2, 3])
    expect(distributeSlideLineCounts(3, 2, true)).toEqual([3])
  })

  it('keeps strict chunking when balancing is disabled', () => {
    expect(distributeSlideLineCounts(5, 2, false)).toEqual([2, 2, 1])
    expect(distributeSlideLineCounts(3, 2, false)).toEqual([2, 1])
  })
})

describe('buildAvLyricSlides', () => {
  it('splits lines by maxLinesPerSlide when balancing is disabled', () => {
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
      0,
      false,
    )

    expect(result.slides).toEqual(['Line one\nLine two', 'Line three'])
    expect(result.outline[0]?.title).toBe('Verse 1')
    expect(result.outline[0]?.len).toBe(2)
  })

  it('balances leftover lines onto the previous slide by default', () => {
    const result = buildAvLyricSlides(
      [
        {
          title: 'Verse 1',
          lines: [
            { parts: [{ comment: false, languages: ['Line one'] }] },
            { parts: [{ comment: false, languages: ['Line two'] }] },
            { parts: [{ comment: false, languages: ['Line three'] }] },
            { parts: [{ comment: false, languages: ['Line four'] }] },
            { parts: [{ comment: false, languages: ['Line five'] }] },
          ],
        },
      ],
      2,
    )

    expect(result.slides).toEqual(['Line one\nLine two', 'Line three\nLine four\nLine five'])
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

  it('collapses consecutive whitespace in lyrics by default', () => {
    const result = buildAvLyricSlides(
      [
        {
          title: 'Verse 1',
          lines: [{ parts: [{ comment: false, languages: ['Word1   word2\t\tword3'] }] }],
        },
      ],
      2,
    )

    expect(result.slides).toEqual(['Word1 word2 word3'])
  })

  it('preserves consecutive whitespace when disabled', () => {
    const result = buildAvLyricSlides(
      [
        {
          title: 'Verse 1',
          lines: [{ parts: [{ comment: false, languages: ['Word1   word2\t\tword3'] }] }],
        },
      ],
      2,
      0,
      true,
      false,
    )

    expect(result.slides).toEqual(['Word1   word2\t\tword3'])
  })

  it('collapses whitespace across joined lyric parts', () => {
    const result = buildAvLyricSlides(
      [
        {
          title: 'Verse 1',
          lines: [
            {
              parts: [
                { comment: false, languages: ['Hello   '] },
                { comment: false, languages: ['  world'] },
              ],
            },
          ],
        },
      ],
      2,
    )

    expect(result.slides).toEqual(['Hello world'])
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
      0,
      false,
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

describe('avSlideDeckEntrySlideIndex', () => {
  it('maps duplicate outline slides to the first section deck entry', () => {
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

    const rows = buildAvOutlineRows(result.outline, 0)
    const secondChorusSlideIndex = rows.find(
      (row, index, all) =>
        row.label === 'Chorus' && all.findIndex((candidate) => candidate.label === 'Chorus') !== index,
    )?.slideIndex

    expect(secondChorusSlideIndex).toBe(2)
    expect(avSlideDeckEntrySlideIndex(result.outline, secondChorusSlideIndex!)).toBe(0)
    expect(avSlideDeckEntrySlideIndex(result.outline, 0)).toBe(0)
    expect(avSlideDeckEntrySlideIndex(result.outline, 1)).toBe(1)
  })

  it('maps duplicate sub-slides to the matching donor sub-slide', () => {
    const { slides, outline } = buildAvLyricSlides(
      [
        {
          title: 'Chorus',
          lines: [
            { parts: [{ comment: false, languages: ['Line one'] }] },
            { parts: [{ comment: false, languages: ['Line two'] }] },
            { parts: [{ comment: false, languages: ['Line three'] }] },
          ],
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
      0,
      false,
    )

    expect(avSlideDeckEntrySlideIndex(outline, 3)).toBe(0)
    expect(avSlideDeckEntrySlideIndex(outline, 4)).toBe(1)
    expect(buildAvSlideDeckEntries(outline, slides).map((entry) => entry.slideIndex)).toEqual([0, 1, 2])
  })

  it('returns null for no-text outline slides without deck entries', () => {
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

    expect(avSlideDeckEntrySlideIndex(outline, 0)).toBeNull()
    expect(avSlideDeckEntrySlideIndex(outline, 1)).toBe(1)
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

const bilingualSections = [
  {
    title: 'Verse 1',
    lines: [
      { parts: [{ comment: false, languages: ['Hello', 'Hallo', 'Bonjour'] }] },
      { parts: [{ comment: false, languages: ['World', 'Welt', ''] }] },
    ],
  },
  {
    title: 'Chorus',
    lines: [
      { parts: [{ comment: false, languages: ['Sing', 'Singt', 'Chante'] }] },
    ],
  },
]

describe('bilingual track selection', () => {
  it('detects usable lyrics per language index', () => {
    expect(songHasUsableLyricsAtIndex(bilingualSections, 0)).toBe(true)
    expect(songHasUsableLyricsAtIndex(bilingualSections, 2)).toBe(true)
    expect(songHasUsableLyricsAtIndex(bilingualSections, 99)).toBe(false)
  })

  it('falls back to track 0 when the requested primary has no lyrics', () => {
    const sparsePrimary = [
      {
        title: 'Verse 1',
        lines: [{ parts: [{ comment: false, languages: ['Hello', '', 'Bonjour'] }] }],
      },
    ]

    expect(resolveAvEffectivePrimaryLanguageIndex(sparsePrimary, 1)).toBe(0)
    expect(resolveAvEffectivePrimaryLanguageIndex(sparsePrimary, 0)).toBe(0)
  })

  it('picks the first other language track for secondary in two-language songs', () => {
    const twoLang = [
      {
        title: 'Verse 1',
        lines: [{ parts: [{ comment: false, languages: ['Hello', 'Hallo'] }] }],
      },
    ]

    expect(resolveAvSecondaryLanguageIndex(twoLang, 0)).toBe(1)
    expect(resolveAvSecondaryLanguageIndex(twoLang, 1)).toBe(0)
  })

  it('picks the first other usable track for three or more languages', () => {
    expect(resolveAvSecondaryLanguageIndex(bilingualSections, 1)).toBe(0)
    expect(resolveAvSecondaryLanguageIndex(bilingualSections, 0)).toBe(1)
    expect(resolveAvSecondaryLanguageIndex(bilingualSections, 2)).toBe(0)
  })

  it('returns null when no secondary track has lyrics', () => {
    const singleLang = [
      {
        title: 'Verse 1',
        lines: [{ parts: [{ comment: false, languages: ['Hello'] }] }],
      },
    ]

    expect(resolveAvSecondaryLanguageIndex(singleLang, 0)).toBeNull()
  })
})

describe('buildAvBilingualLyricSlides', () => {
  it('pairs primary and secondary lines and omits empty secondary rows', () => {
    const result = buildAvBilingualLyricSlides(bilingualSections, 2, 0, 1)

    expect(result.slides).toEqual(['Hello\nWorld', 'Sing'])
    expect(result.structuredSlides).toEqual([
      [
        { primary: 'Hello', secondary: 'Hallo' },
        { primary: 'World', secondary: 'Welt' },
      ],
      [{ primary: 'Sing', secondary: 'Singt' }],
    ])
    expect(avLyricLinesToSlideText(result.structuredSlides![0]!)).toBe('Hello\nWorld')
  })

  it('keeps the same slide count as single-language mode', () => {
    const mono = buildAvLyricSlides(bilingualSections, 2, 0, true, true)
    const bilingual = buildAvBilingualLyricSlides(bilingualSections, 2, 0, 1, true, true)

    expect(bilingual.slides).toEqual(mono.slides)
    expect(bilingual.slides.length).toBe(mono.slides.length)
    expect(bilingual.outline).toEqual(mono.outline)
  })

  it('falls back to single-language output when no secondary track exists', () => {
    const singleLang = [
      {
        title: 'Verse 1',
        lines: [{ parts: [{ comment: false, languages: ['Hello'] }] }],
      },
    ]
    const mono = buildAvLyricSlides(singleLang, 2, 0)
    const bilingual = buildAvBilingualLyricSlides(singleLang, 2, 0, null)

    expect(bilingual).toEqual(mono)
    expect(bilingual.structuredSlides).toBeUndefined()
  })

  it('preserves balancing and whitespace behavior in structured slides', () => {
    const sections = [
      {
        title: 'Verse 1',
        lines: [
          { parts: [{ comment: false, languages: ['Line one', 'Zeile eins'] }] },
          { parts: [{ comment: false, languages: ['Line two', 'Zeile zwei'] }] },
          { parts: [{ comment: false, languages: ['Line three', 'Zeile drei'] }] },
          { parts: [{ comment: false, languages: ['Line four', 'Zeile vier'] }] },
          { parts: [{ comment: false, languages: ['Line five', 'Zeile fuenf'] }] },
        ],
      },
    ]

    const mono = buildAvLyricSlides(sections, 2, 0, true, true)
    const bilingual = buildAvBilingualLyricSlides(sections, 2, 0, 1, true, true)

    expect(bilingual.slides).toEqual(mono.slides)
    expect(bilingual.structuredSlides?.map((slide) => slide.length)).toEqual(
      mono.slides.map((slide) => slide.split('\n').length),
    )
  })

  it('builds structured deck entries and repeated-section donors', () => {
    const repeated = [
      {
        title: 'Chorus',
        lines: [{ parts: [{ comment: false, languages: ['Sing', 'Singt'] }] }],
      },
      {
        title: 'Verse 1',
        lines: [{ parts: [{ comment: false, languages: ['Verse', 'Strophe'] }] }],
      },
      {
        title: 'Chorus',
        lines: [],
      },
    ]
    const result = buildAvBilingualLyricSlides(repeated, 2, 0, 1)
    const entries = buildAvSlideDeckEntries(
      result.outline,
      result.slides,
      result.structuredSlides,
    )

    expect(entries).toHaveLength(2)
    expect(entries[0]?.lines).toEqual([{ primary: 'Sing', secondary: 'Singt' }])
    expect(entries[1]?.lines).toEqual([{ primary: 'Verse', secondary: 'Strophe' }])
    expect(
      buildAvPresentationStructuredSlides(result.outline, result.structuredSlides!),
    ).toHaveLength(buildAvPresentationSlides(result.outline, result.slides).length)
  })
})
