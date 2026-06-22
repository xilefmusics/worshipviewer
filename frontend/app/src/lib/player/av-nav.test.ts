import type { components } from '@/api/schema'
import { describe, expect, it } from 'vitest'

import {
  avItemTitle,
  avSlidesForItem,
  avSlidesForPlayerItem,
  buildAvFlatSlides,
  resolveAvItemLanguageIndex,
} from '@/lib/player/av-nav'
import {
  buildAvOutlineRows,
  buildAvPresentationSlides,
} from '@/lib/player/av-lyric-slides'
import type { ChordSongData, SongFlowItem } from '@/ports/chord-engine'

type PlayerItem = components['schemas']['PlayerItem']

const split = {
  maxLinesPerSlide: 2,
  balanceSlideLines: true,
  collapseLyricWhitespace: true,
}

const songData = {
  sections: [
    {
      title: 'Verse 1',
      lines: [
        {
          parts: [{ comment: false, languages: ['Hello', 'Hallo'] }],
        },
      ],
    },
    {
      title: 'Chorus',
      lines: [
        {
          parts: [{ comment: false, languages: ['Goodbye', 'Tschuess'] }],
        },
      ],
    },
  ],
  languages: ['en', 'de'],
  titles: ['Anchor', 'Anker'],
}

function chordItem(language: string | null): PlayerItem {
  return {
    type: 'chords',
    song: {
      id: 'song-1',
      blobs: [],
      not_a_song: false,
      owner: 'user:test',
      user_specific_addons: { liked: false },
      data: songData,
    },
    language,
  } as PlayerItem
}

describe('resolveAvItemLanguageIndex', () => {
  it('prefers a valid override and falls back to the saved slot language', () => {
    const item = chordItem('de')

    expect(resolveAvItemLanguageIndex(item, 0, () => 0)).toBe(0)
    expect(resolveAvItemLanguageIndex(item, 0, () => 99)).toBe(1)
  })

  it('falls back to track 0 when both override and saved slot are invalid', () => {
    const item = chordItem('it')

    expect(resolveAvItemLanguageIndex(item, 0, () => 99)).toBe(0)
    expect(resolveAvItemLanguageIndex(item, 0)).toBe(0)
  })
})

describe('avSlidesForItem', () => {
  it('uses the effective language for slide text and title', () => {
    const item = chordItem('de')

    const english = avSlidesForItem(item, 0, split, 'Setlist title', () => 0)
    const german = avSlidesForItem(item, 0, split, 'Setlist title', () => 1)

    expect(english.slides).toEqual(['Hello', 'Goodbye'])
    expect(german.slides).toEqual(['Hallo', 'Tschuess'])
    expect(english.sourceSlides).toEqual(english.slides)
    expect(german.sourceSlides).toEqual(german.slides)
    expect(avItemTitle([item], 0, 'Setlist title', () => 0)).toBe('Anchor')
    expect(avItemTitle([item], 0, 'Setlist title', () => 1)).toBe('Anker')
  })
})

describe('av flat slides', () => {
  it('keeps two occurrences of the same song independent', () => {
    const items: PlayerItem[] = [chordItem('de'), chordItem('de')]
    const resolveLanguageIndex = (itemIndex: number) => (itemIndex === 0 ? 0 : 1)

    const first = avSlidesForPlayerItem(items, 0, split, resolveLanguageIndex)
    const second = avSlidesForPlayerItem(items, 1, split, resolveLanguageIndex)
    const flat = buildAvFlatSlides(items, split, [], resolveLanguageIndex)

    expect(first.slides).toEqual(['Hello', 'Goodbye'])
    expect(second.slides).toEqual(['Hallo', 'Tschuess'])
    expect(avItemTitle(items, 0, undefined, resolveLanguageIndex)).toBe('Anchor')
    expect(avItemTitle(items, 1, undefined, resolveLanguageIndex)).toBe('Anker')
    expect(flat.filter((row) => row.itemIndex === 0).map((row) => row.text)).toEqual([
      'Hello',
      'Goodbye',
    ])
    expect(flat.filter((row) => row.itemIndex === 1).map((row) => row.text)).toEqual([
      'Hallo',
      'Tschuess',
    ])
  })

  it('keeps outline and deck indices aligned after switching language', () => {
    const item = chordItem('de')

    const english = avSlidesForItem(item, 0, split, 'Setlist title', () => 0)
    const german = avSlidesForItem(item, 0, split, 'Setlist title', () => 1)

    expect(english.outline.map((row) => row.title)).toEqual(['Verse 1', 'Chorus'])
    expect(german.outline.map((row) => row.title)).toEqual(['Verse 1', 'Chorus'])
    expect(english.outline.map((row) => row.len)).toEqual([1, 1])
    expect(german.outline.map((row) => row.len)).toEqual([1, 1])
    expect(buildAvPresentationSlides(english.outline, english.sourceSlides)).toEqual(english.slides)
    expect(buildAvPresentationSlides(german.outline, german.sourceSlides)).toEqual(german.slides)
    expect(buildAvOutlineRows(english.outline, 0).map((row) => row.slideIndex)).toEqual([0, 1])
    expect(buildAvOutlineRows(german.outline, 0).map((row) => row.slideIndex)).toEqual([0, 1])
  })
})

describe('avSlidesForItem bilingual mode', () => {
  it('produces structured lines while keeping primary-only string slides', () => {
    const item = chordItem('de')
    const bilingual = avSlidesForItem(item, 0, split, 'Setlist title', () => 0, true)

    expect(bilingual.slides).toEqual(['Hello', 'Goodbye'])
    expect(bilingual.structuredSlides).toEqual([
      [{ primary: 'Hello', secondary: 'Hallo' }],
      [{ primary: 'Goodbye', secondary: 'Tschuess' }],
    ])
  })

  it('swaps tracks when the primary override changes', () => {
    const item = chordItem('de')
    const english = avSlidesForItem(item, 0, split, 'Setlist title', () => 0, true)
    const german = avSlidesForItem(item, 0, split, 'Setlist title', () => 1, true)

    expect(english.structuredSlides?.[0]?.[0]).toEqual({
      primary: 'Hello',
      secondary: 'Hallo',
    })
    expect(german.structuredSlides?.[0]?.[0]).toEqual({
      primary: 'Hallo',
      secondary: 'Hello',
    })
  })

  it('matches monolingual slide counts when bilingual is disabled', () => {
    const item = chordItem('de')
    const mono = avSlidesForItem(item, 0, split, 'Setlist title', () => 0, false)
    const bilingual = avSlidesForItem(item, 0, split, 'Setlist title', () => 0, true)

    expect(bilingual.slides).toEqual(mono.slides)
    expect(bilingual.slides.length).toBe(mono.slides.length)
  })
})

describe('avSlidesForItem custom flow', () => {
  function flow(title: string, repeats = 1): SongFlowItem {
    return { title, repeats, occurrence_index: 0 }
  }

  it('uses resolved song data when provided', () => {
    const item = {
      ...chordItem('de'),
      flow: [flow('Chorus'), flow('Verse 1')],
    } as PlayerItem
    const resolvedData = {
      ...songData,
      sections: [
        {
          title: 'Chorus',
          lines: [{ parts: [{ comment: false, languages: ['Sing'] }] }],
        },
        {
          title: 'Verse 1',
          lines: [{ parts: [{ comment: false, languages: ['First'] }] }],
        },
      ],
    } as ChordSongData

    const result = avSlidesForItem(item, 0, split, 'Setlist title', () => 0, false, resolvedData)

    expect(result.slides).toEqual(['Sing', 'First'])
    expect(result.outline.map((row) => row.title)).toEqual(['Chorus', 'Verse 1'])
  })
})
