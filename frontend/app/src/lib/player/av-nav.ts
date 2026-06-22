import type { components } from '@/api/schema'

import {
  type AvLyricLine,
  type AvBilingualLyricSlidesResult,
  type AvSectionOutline,
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

type Player = components['schemas']['Player']
type PlayerItem = components['schemas']['PlayerItem']
type Section = components['schemas']['Section']

export type AvResolvedSections = ReadonlyMap<number, readonly Section[]>

export type AvLanguageIndexResolver = (itemIndex: number) => number | undefined

export type AvItemSlides = {
  slides: string[]
  sourceSlides: string[]
  structuredSlides?: AvLyricLine[][]
  structuredSourceSlides?: AvLyricLine[][]
  outline: AvSectionOutline[]
  kind: 'lyrics' | 'blob'
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

export function sectionsForAvItem(
  item: PlayerItem | undefined,
  itemIndex: number,
  resolvedSections?: AvResolvedSections,
): Section[] {
  if (!item || item.type !== 'chords') return []
  const override = resolvedSections?.get(itemIndex)
  if (override) return [...override]
  const sections = item.song.data.sections
  return Array.isArray(sections) ? sections : []
}

export function avSlidesForItem(
  item: PlayerItem | undefined,
  itemIndex: number,
  split: AvLyricSplitPrefs,
  fallbackTitle?: string,
  resolveLanguageIndex?: AvLanguageIndexResolver,
  bilingualEnabled = false,
  resolvedSections?: AvResolvedSections,
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
  const songData = item.song.data
  const sections = sectionsForAvItem(item, itemIndex, resolvedSections)
  const requestedPrimary = resolveAvItemLanguageIndex(item, itemIndex, resolveLanguageIndex)
  const effectivePrimary = bilingualEnabled
    ? resolveAvEffectivePrimaryLanguageIndex(
        sections,
        requestedPrimary,
        split.collapseLyricWhitespace,
      )
    : requestedPrimary
  const lyricData: AvBilingualLyricSlidesResult = bilingualEnabled
    ? buildAvBilingualLyricSlides(
        sections,
        split.maxLinesPerSlide,
        effectivePrimary,
        resolveAvSecondaryLanguageIndex(
          sections,
          effectivePrimary,
          split.collapseLyricWhitespace,
        ),
        split.balanceSlideLines,
        split.collapseLyricWhitespace,
      )
    : buildAvLyricSlides(
        sections,
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

export function avSlidesForPlayerItem(
  items: PlayerItem[],
  itemIndex: number,
  split: AvLyricSplitPrefs,
  resolveLanguageIndex?: AvLanguageIndexResolver,
  bilingualEnabled = false,
  resolvedSections?: AvResolvedSections,
): AvItemSlides {
  return avSlidesForItem(
    items[itemIndex],
    itemIndex,
    split,
    undefined,
    resolveLanguageIndex,
    bilingualEnabled,
    resolvedSections,
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
  resolvedSections?: AvResolvedSections,
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
      resolvedSections,
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
  resolvedSections?: AvResolvedSections,
): number {
  return buildAvFlatSlides(items, split, [], resolveLanguageIndex, false, resolvedSections).length
}

export type AvPlayerContext = {
  player: Player
  split: AvLyricSplitPrefs
  resolveLanguageIndex?: AvLanguageIndexResolver
  bilingualEnabled?: boolean
  resolvedSections?: AvResolvedSections
}

export function rebuildAvFlat(ctx: AvPlayerContext): AvFlatSlide[] {
  return buildAvFlatSlides(
    ctx.player.items,
    ctx.split,
    ctx.player.toc,
    ctx.resolveLanguageIndex,
    ctx.bilingualEnabled,
    ctx.resolvedSections,
  )
}
