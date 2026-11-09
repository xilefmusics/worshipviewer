import type { components } from '@/api/schema'

import {
  type AvLyricLine,
  type AvBilingualLyricSlidesResult,
  type AvSectionOutline,
  type AvSlideDeckEntry,
  blobItemSlideText,
  buildAvBilingualLyricSlides,
  buildAvLyricSlides,
  buildAvPresentationSlides,
  buildAvPresentationStructuredSlides,
  resolveAvEffectivePrimaryLanguageIndex,
  resolveAvSecondaryLanguageIndex,
} from '@/lib/player/av-lyric-slides'
import type { AvLyricSplitPrefs } from '@/lib/player/av-preferences'
import { itemTypeAt, tocEntryForIndex } from '@/lib/player/player-helpers'
import { languageIndexForSongLink, songLanguageOptions } from '@/lib/setlist-song-links'
import type { ChordSongData } from '@/ports/chord-engine'

type Player = components['schemas']['Player']
type PlayerItem = components['schemas']['PlayerItem']

export type AvLanguageIndexResolver = (itemIndex: number) => number | undefined

export type AvDeckPage = {
  blobId: string
  sectionTitle?: string | null
}

export type AvItemSlides = {
  slides: string[]
  sourceSlides: string[]
  structuredSlides?: AvLyricLine[][]
  structuredSourceSlides?: AvLyricLine[][]
  outline: AvSectionOutline[]
  kind: 'lyrics' | 'blob' | 'deck' | 'video' | 'audio' | 'youtube' | 'spotify' | 'livestream' | 'web_page'
  mediaId?: string
  assetId?: string
  thumbnailAssetId?: string
  videoId?: string
  canonicalUrl?: string
  spotifyId?: string
  spotifyResourceType?: 'track' | 'playlist'
  url?: string
  streamType?: 'hls' | 'direct'
  pages?: AvDeckPage[]
}

function songTitleAtLanguageIndex(
  data: Record<string, unknown> | undefined | null,
  languageIndex: number,
  fallback = '',
): string {
  const titles = Array.isArray(data?.titles) ? data.titles : []
  const value = titles[languageIndex]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  const fallbackTitle = fallback.trim()
  return fallbackTitle.length > 0 ? fallbackTitle : 'Untitled'
}

export function resolveAvItemLanguageIndex(
  item: PlayerItem | undefined,
  itemIndex: number,
  resolveLanguageIndex?: AvLanguageIndexResolver,
): number {
  if (!item || item.type !== 'chords') return 0

  const options = songLanguageOptions(item.song.data as Record<string, unknown>)
  const slotLanguageIndex = languageIndexForSongLink(
    item.song.data as Record<string, unknown>,
    item.language,
  )
  const overrideLanguageIndex = resolveLanguageIndex?.(itemIndex)

  const isValidIndex = (value: number | undefined): value is number =>
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < options.length

  if (isValidIndex(overrideLanguageIndex)) return overrideLanguageIndex
  if (isValidIndex(slotLanguageIndex)) return slotLanguageIndex
  return 0
}

export function avSlidesForItem(
  item: PlayerItem | undefined,
  itemIndex: number,
  split: AvLyricSplitPrefs,
  fallbackTitle?: string,
  resolveLanguageIndex?: AvLanguageIndexResolver,
  bilingualEnabled = false,
  resolvedSongData?: ChordSongData,
): AvItemSlides {
  if (!item) return { slides: [''], sourceSlides: [''], outline: [], kind: 'blob' }
  if (item.type === 'blob') {
    const text = blobItemSlideText(fallbackTitle?.trim() || 'Untitled')
    return {
      slides: [text],
      sourceSlides: [text],
      outline: [],
      kind: 'blob',
    }
  }
  if (item.type === 'media' && item.content?.type === 'image') {
    const pages = [{ blobId: item.content.blob_id }]
    const slides = ['Page 1']
    return {
      slides,
      sourceSlides: slides,
      outline: buildAvDeckOutline(pages, item.title.trim() || fallbackTitle),
      kind: 'deck',
      mediaId: item.id,
      pages,
    }
  }
  if (item.type === 'media' && item.content?.type === 'slide_deck') {
    const pages = item.content.pages.map((page) => ({
      blobId: page.blob_id,
      sectionTitle: page.section_title,
    }))
    if (pages.length > 0) {
      const slides = pages.map((_, index) => `Page ${index + 1}`)
      return {
        slides,
        sourceSlides: slides,
      outline: buildAvDeckOutline(pages, fallbackTitle),
        kind: 'deck',
        mediaId: item.id,
        pages,
      }
    }
  }
  if (item.type === 'media' && (item.content?.type === 'video' || item.content?.type === 'audio')) {
    const title = item.title.trim() || fallbackTitle?.trim() || 'Untitled'
    return {
      slides: [title],
      sourceSlides: [title],
      outline: [],
      kind: item.content.type,
      mediaId: item.id,
      assetId: item.content.blob_id,
      ...(item.content.type === 'video' && item.content.thumbnail_blob_id
        ? { thumbnailAssetId: item.content.thumbnail_blob_id }
        : {}),
    }
  }
  if (item.type === 'media' && item.content?.type === 'youtube') {
    const title = item.title.trim() || fallbackTitle?.trim() || 'Untitled'
    return {
      slides: [title],
      sourceSlides: [title],
      outline: [],
      kind: 'youtube',
      mediaId: item.id,
      videoId: item.content.video_id,
      canonicalUrl: item.content.canonical_url,
    }
  }
  if (item.type === 'media' && item.content?.type === 'spotify') {
    const spotifyId = item.content.spotify_id.trim()
    const spotifyResourceType = item.content.resource_type
    if (
      !/^[A-Za-z0-9]{22}$/.test(spotifyId) ||
      (spotifyResourceType !== 'track' && spotifyResourceType !== 'playlist')
    ) {
      return {
        slides: [item.title.trim() || fallbackTitle?.trim() || 'Untitled'],
        sourceSlides: [item.title.trim() || fallbackTitle?.trim() || 'Untitled'],
        outline: [],
        kind: 'blob',
      }
    }
    const title = item.title.trim() || fallbackTitle?.trim() || 'Untitled'
    return {
      slides: [title],
      sourceSlides: [title],
      outline: [],
      kind: 'spotify',
      mediaId: item.id,
      spotifyId,
      spotifyResourceType,
      canonicalUrl: `https://open.spotify.com/${spotifyResourceType}/${spotifyId}`,
    }
  }
  if (item.type === 'media' && item.content?.type === 'livestream') {
    const title = item.title.trim() || fallbackTitle?.trim() || 'Untitled'
    return {
      slides: [title],
      sourceSlides: [title],
      outline: [],
      kind: 'livestream',
      mediaId: item.id,
      url: item.content.url,
      streamType: item.content.stream_type,
    }
  }
  if (item.type === 'media' && item.content?.type === 'web_page') {
    const title = item.title.trim() || fallbackTitle?.trim() || 'Untitled'
    return {
      slides: [title],
      sourceSlides: [title],
      outline: [],
      kind: 'web_page',
      mediaId: item.id,
      url: item.content.url,
    }
  }
  if (item.type !== 'chords') {
    const text = blobItemSlideText(
      (item.type === 'media' ? item.title : fallbackTitle)?.trim() || fallbackTitle?.trim() || 'Untitled',
    )
    return {
      slides: [text],
      sourceSlides: [text],
      outline: [],
      kind: 'blob',
    }
  }
  const songData =
    resolvedSongData != null
      ? ({ ...item.song.data, ...resolvedSongData } as typeof item.song.data)
      : item.song.data
  const requestedPrimary = resolveAvItemLanguageIndex(item, itemIndex, resolveLanguageIndex)
  const effectivePrimary = bilingualEnabled
    ? resolveAvEffectivePrimaryLanguageIndex(
        songData.sections,
        requestedPrimary,
        split.collapseLyricWhitespace,
      )
    : requestedPrimary
  const lyricData: AvBilingualLyricSlidesResult = bilingualEnabled
    ? buildAvBilingualLyricSlides(
        songData.sections,
        split.maxLinesPerSlide,
        effectivePrimary,
        resolveAvSecondaryLanguageIndex(
          songData.sections,
          effectivePrimary,
          split.collapseLyricWhitespace,
        ),
        split.balanceSlideLines,
        split.collapseLyricWhitespace,
      )
    : buildAvLyricSlides(
        songData.sections,
        split.maxLinesPerSlide,
        requestedPrimary,
        split.balanceSlideLines,
        split.collapseLyricWhitespace,
      )
  if (lyricData.outline.length === 0 && lyricData.slides.length === 0) {
    const title = songTitleAtLanguageIndex(
      songData as Record<string, unknown>,
      requestedPrimary,
      fallbackTitle,
    )
    return { slides: [title], sourceSlides: [title], outline: [], kind: 'lyrics' }
  }
  const slides = buildAvPresentationSlides(lyricData.outline, lyricData.slides)
  const structuredSourceSlides = lyricData.structuredSlides
  const structuredSlides =
    structuredSourceSlides && lyricData.outline.length > 0
      ? buildAvPresentationStructuredSlides(lyricData.outline, structuredSourceSlides)
      : structuredSourceSlides
  if (slides.length === 0) {
    return {
      slides: [
        songTitleAtLanguageIndex(
          songData as Record<string, unknown>,
          requestedPrimary,
          fallbackTitle,
        ),
      ],
      sourceSlides: lyricData.slides,
      structuredSlides,
      structuredSourceSlides,
      outline: lyricData.outline,
      kind: 'lyrics',
    }
  }
  return {
    slides,
    sourceSlides: lyricData.slides,
    structuredSlides,
    structuredSourceSlides,
    outline: lyricData.outline,
    kind: 'lyrics',
  }
}

export function buildAvDeckPageEntries(
  mediaId: string,
  pages: AvDeckPage[],
  labelForPage: (index: number) => string,
  fallbackTitle?: string,
): AvSlideDeckEntry[] {
  const sectionTitles = new Map(
    buildAvDeckOutline(pages, fallbackTitle).flatMap((section) =>
      (section.slideLabels ?? [section.title]).map((label, offset) => [section.textIdx + offset, label] as const),
    ),
  )
  return pages.map((page, index) => ({
    slideIndex: index,
    label: sectionTitles.get(index) ?? labelForPage(index),
    text: '',
    isSubSlide: false,
    hasText: true,
    deckPage: { mediaId, assetId: page.blobId },
  }))
}

function buildAvDeckOutline(pages: AvDeckPage[], fallbackTitle?: string): AvSectionOutline[] {
  const outline: AvSectionOutline[] = []
  let sectionNumber = 0

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex]
    if (!page) continue
    const explicitTitle = page.sectionTitle?.trim()
    const startsSection = pageIndex === 0 || Boolean(explicitTitle)
    if (!startsSection) continue

    sectionNumber += 1
    let len = 1
    while (pageIndex + len < pages.length) {
      const nextPage = pages[pageIndex + len]
      if (!nextPage || nextPage.sectionTitle?.trim()) break
      len += 1
    }

    const title = explicitTitle || (pageIndex === 0 ? fallbackTitle?.trim() : '') || `Section ${sectionNumber}`
    outline.push({
      title,
      textIdx: pageIndex,
      outlineIdx: pageIndex,
      len,
      slideLabels: pages
        .slice(pageIndex, pageIndex + len)
        .map((_, offset) => (offset === 0 ? title : `${title} (${offset + 1})`)),
      duplicate: false,
      hasText: true,
    })
  }

  return outline
}

export function avSlidesForPlayerItem(
  items: PlayerItem[],
  itemIndex: number,
  split: AvLyricSplitPrefs,
  resolveLanguageIndex?: AvLanguageIndexResolver,
  bilingualEnabled = false,
  resolvedSongData?: ChordSongData,
  fallbackTitle?: string,
): AvItemSlides {
  return avSlidesForItem(
    items[itemIndex],
    itemIndex,
    split,
    fallbackTitle,
    resolveLanguageIndex,
    bilingualEnabled,
    resolvedSongData,
  )
}

export type AvFlatSlide = {
  itemIndex: number
  slideIndex: number
  text: string
}

export function buildAvFlatSlides(
  items: PlayerItem[],
  split: AvLyricSplitPrefs,
  toc: Player['toc'] = [],
  resolveLanguageIndex?: AvLanguageIndexResolver,
  bilingualEnabled = false,
): AvFlatSlide[] {
  const flat: AvFlatSlide[] = []
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const tocTitle = tocEntryForIndex(toc, itemIndex)?.title
    const { slides } = avSlidesForItem(
      items[itemIndex],
      itemIndex,
      split,
      tocTitle,
      resolveLanguageIndex,
      bilingualEnabled,
    )
    for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
      flat.push({ itemIndex, slideIndex, text: slides[slideIndex] ?? '' })
    }
  }
  return flat.length > 0 ? flat : [{ itemIndex: 0, slideIndex: 0, text: '' }]
}

export function avFlatIndexForPosition(
  flat: AvFlatSlide[],
  itemIndex: number,
  slideIndex: number,
): number {
  const idx = flat.findIndex(
    (row) => row.itemIndex === itemIndex && row.slideIndex === slideIndex,
  )
  return idx >= 0 ? idx : 0
}

export function avPositionFromFlatIndex(
  flat: AvFlatSlide[],
  flatIndex: number,
): { itemIndex: number; slideIndex: number } {
  const row = flat[flatIndex]
  if (!row) return { itemIndex: 0, slideIndex: 0 }
  return { itemIndex: row.itemIndex, slideIndex: row.slideIndex }
}

export function avNextPosition(
  flat: AvFlatSlide[],
  itemIndex: number,
  slideIndex: number,
  betweenItems: boolean,
): { itemIndex: number; slideIndex: number } | null {
  const flatIndex = avFlatIndexForPosition(flat, itemIndex, slideIndex)
  if (flatIndex < flat.length - 1) {
    return avPositionFromFlatIndex(flat, flatIndex + 1)
  }
  if (betweenItems && itemIndex < flat[flat.length - 1]?.itemIndex) {
    const nextItem = itemIndex + 1
    return { itemIndex: nextItem, slideIndex: 0 }
  }
  return flatIndex < flat.length - 1 ? avPositionFromFlatIndex(flat, flatIndex + 1) : null
}

export function avPrevPosition(
  flat: AvFlatSlide[],
  itemIndex: number,
  slideIndex: number,
): { itemIndex: number; slideIndex: number } | null {
  const flatIndex = avFlatIndexForPosition(flat, itemIndex, slideIndex)
  if (flatIndex > 0) {
    return avPositionFromFlatIndex(flat, flatIndex - 1)
  }
  return null
}

export function avPrevSlideInItem(slideIndex: number): number | null {
  return slideIndex > 0 ? slideIndex - 1 : null
}

export function avNextSlideInItem(slideCount: number, slideIndex: number): number | null {
  return slideIndex < slideCount - 1 ? slideIndex + 1 : null
}

export function avPrevItemIndex(itemIndex: number): number | null {
  return itemIndex > 0 ? itemIndex - 1 : null
}

export function avNextItemIndex(itemIndex: number, itemCount: number): number | null {
  return itemIndex < itemCount - 1 ? itemIndex + 1 : null
}

export function avItemTitle(
  items: PlayerItem[],
  itemIndex: number,
  tocTitle?: string,
  resolveLanguageIndex?: AvLanguageIndexResolver,
): string {
  const item = items[itemIndex]
  if (!item) return ''
  if (item.type === 'chords') {
    const languageIndex = resolveAvItemLanguageIndex(item, itemIndex, resolveLanguageIndex)
    return songTitleAtLanguageIndex(
      item.song.data as Record<string, unknown>,
      languageIndex,
      tocTitle,
    )
  }
  if (item.type === 'media') return item.title
  if (tocTitle?.trim()) return tocTitle.trim()
  return ''
}

export function avItemHasLyrics(items: PlayerItem[], itemIndex: number): boolean {
  return itemTypeAt(items, itemIndex) === 'chords'
}

export function avTotalSlides(
  items: PlayerItem[],
  split: AvLyricSplitPrefs,
  resolveLanguageIndex?: AvLanguageIndexResolver,
): number {
  return buildAvFlatSlides(items, split, [], resolveLanguageIndex).length
}

export type AvPlayerContext = {
  player: Player
  split: AvLyricSplitPrefs
  resolveLanguageIndex?: AvLanguageIndexResolver
  bilingualEnabled?: boolean
}

export function rebuildAvFlat(ctx: AvPlayerContext): AvFlatSlide[] {
  return buildAvFlatSlides(
    ctx.player.items,
    ctx.split,
    ctx.player.toc,
    ctx.resolveLanguageIndex,
    ctx.bilingualEnabled,
  )
}
