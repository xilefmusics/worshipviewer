import type { components } from '@/api/schema'
import { describe, expect, it } from 'vitest'

import {
  avItemTitle,
  avSlidesForItem,
  avSlidesForPlayerItem,
  buildAvFlatSlides,
  buildAvDeckPageEntries,
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

  it('builds a deck outline from stored media section titles', () => {
    const item: PlayerItem = {
      type: 'media',
      id: 'media-1',
      title: 'Slides',
      content: {
        type: 'slide_deck',
        pages: [
          { blob_id: 'p1', section_title: 'Welcome' },
          { blob_id: 'p2' },
          { blob_id: 'p3', section_title: 'Teaching' },
        ],
      },
    }

    const result = avSlidesForItem(item, 0, split)

    expect(result.outline.map(({ title, len }) => ({ title, len }))).toEqual([
      { title: 'Welcome', len: 2 },
      { title: 'Teaching', len: 1 },
    ])
    expect(buildAvOutlineRows(result.outline, 1).map((row) => ({
      label: row.label,
      slideIndex: row.slideIndex,
      selected: row.selected,
    }))).toEqual([
      { label: 'Welcome', slideIndex: 0, selected: false },
      { label: 'Welcome (2)', slideIndex: 1, selected: true },
      { label: 'Teaching', slideIndex: 2, selected: false },
    ])
  })

  it('presents image media as a single asset slide without title text', () => {
    const item: PlayerItem = {
      type: 'media',
      id: 'media-image',
      title: 'Background image',
      content: { type: 'image', blob_id: 'image-asset' },
    }

    const result = avSlidesForItem(item, 0, split)

    expect(result).toMatchObject({
      slides: ['Page 1'],
      kind: 'deck',
      mediaId: 'media-image',
      pages: [{ blobId: 'image-asset' }],
    })
  })

  it('uses song-style section labels for every deck page card', () => {
    const pages = [
      { blobId: 'p1', sectionTitle: undefined },
      { blobId: 'p2', sectionTitle: '1. Das Herz' },
      { blobId: 'p3', sectionTitle: undefined },
    ]

    expect(
      buildAvDeckPageEntries('media-1', pages, (index) => `Page ${index + 1}`, 'Seminar Anbetung').map(
        (entry) => entry.label,
      ),
    ).toEqual(['Seminar Anbetung', '1. Das Herz', '1. Das Herz (2)'])
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

describe('avSlidesForItem media decks', () => {
  it('expands Ready slide-deck pages in order and keeps other media as a title placeholder', () => {
    const deck = {
      type: 'media',
      id: 'media-1',
      title: 'Welcome',
      content: {
        type: 'slide_deck',
        pages: [{ blob_id: 'a' }, { blob_id: 'b' }, { blob_id: 'c' }],
      },
    } as PlayerItem
    const video = {
      type: 'media',
      id: 'media-2',
      title: 'Clip',
      content: { type: 'video', blob_id: 'v1', duration_ms: 1000, width: 1920, height: 1080 },
    } as PlayerItem

    const deckSlides = avSlidesForItem(deck, 0, split)
    expect(deckSlides.kind).toBe('deck')
    expect(deckSlides.mediaId).toBe('media-1')
    expect(deckSlides.pages?.map((page) => page.blobId)).toEqual(['a', 'b', 'c'])
    expect(deckSlides.slides).toHaveLength(3)

    const videoSlides = avSlidesForItem(video, 1, split)
    expect(videoSlides.kind).toBe('video')
    expect(videoSlides.mediaId).toBe('media-2')
    expect(videoSlides.assetId).toBe('v1')
    expect(videoSlides.slides).toEqual(['Clip'])

    const audio = {
      type: 'media',
      id: 'media-3',
      title: 'Track',
      content: { type: 'audio', blob_id: 'a1', duration_ms: 8000 },
    } as PlayerItem
    const audioSlides = avSlidesForItem(audio, 2, split)
    expect(audioSlides.kind).toBe('audio')
    expect(audioSlides.assetId).toBe('a1')
  })

  it('I5: maps YouTube, livestream, and web-page media to timed kinds', () => {
    const youtube = avSlidesForItem(
      {
        type: 'media',
        id: 'media-yt',
        title: 'Clip',
        content: {
          type: 'youtube',
          video_id: 'dQw4w9WgXcQ',
          canonical_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      } as PlayerItem,
      0,
      split,
    )
    expect(youtube).toMatchObject({
      kind: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })

    const live = avSlidesForItem(
      {
        type: 'media',
        id: 'media-live',
        title: 'Stream',
        content: { type: 'livestream', url: 'https://example.com/live.m3u8', stream_type: 'hls' },
      } as PlayerItem,
      1,
      split,
    )
    expect(live).toMatchObject({
      kind: 'livestream',
      url: 'https://example.com/live.m3u8',
      streamType: 'hls',
    })

    const page = avSlidesForItem(
      {
        type: 'media',
        id: 'media-web',
        title: 'Bulletin',
        content: { type: 'web_page', url: 'https://example.com/bulletin' },
      } as PlayerItem,
      2,
      split,
    )
    expect(page).toMatchObject({
      kind: 'web_page',
      url: 'https://example.com/bulletin',
    })
  })

  it('maps Spotify media to controller-local external playback details', () => {
    const spotify = avSlidesForItem(
      {
        type: 'media',
        id: 'media-spotify',
        title: 'Prelude',
        content: {
          type: 'spotify',
          resource_type: 'playlist',
          spotify_id: '37i9dQZF1DXcBWIGoYBM5M',
          canonical_url: 'javascript:alert(1)',
        },
      },
      0,
      split,
    )

    expect(spotify).toMatchObject({
      kind: 'spotify',
      mediaId: 'media-spotify',
      spotifyId: '37i9dQZF1DXcBWIGoYBM5M',
      spotifyResourceType: 'playlist',
      canonicalUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    })
  })
})
