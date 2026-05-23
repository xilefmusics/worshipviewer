import type { components } from '@/api/schema'

import {
  type AvSectionOutline,
  blobItemSlideText,
  buildAvLyricSlides,
  buildAvPresentationSlides,
} from '@/lib/player/av-lyric-slides'
import type { AvLyricSplitPrefs } from '@/lib/player/av-preferences'
import { itemTypeAt, tocEntryForIndex } from '@/lib/player/player-helpers'

type Player = components['schemas']['Player']
type PlayerItem = components['schemas']['PlayerItem']

export type AvItemSlides = {
  slides: string[]
  sourceSlides: string[]
  outline: AvSectionOutline[]
  kind: 'lyrics' | 'blob'
}

export function avSlidesForItem(
  item: PlayerItem | undefined,
  split: AvLyricSplitPrefs,
  fallbackTitle?: string,
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
  const title = songData.titles?.[0]?.trim() || 'Untitled'
  const lyricData = buildAvLyricSlides(
    songData.sections,
    split.maxLinesPerSlide,
    0,
    split.balanceSlideLines,
    split.collapseLyricWhitespace,
  )
  if (lyricData.outline.length === 0 && lyricData.slides.length === 0) {
    return { slides: [title], sourceSlides: [title], outline: [], kind: 'lyrics' }
  }
  const slides = buildAvPresentationSlides(lyricData.outline, lyricData.slides)
  if (slides.length === 0) {
    return {
      slides: [title],
      sourceSlides: lyricData.slides,
      outline: lyricData.outline,
      kind: 'lyrics',
    }
  }
  return {
    slides,
    sourceSlides: lyricData.slides,
    outline: lyricData.outline,
    kind: 'lyrics',
  }
}

export function avSlidesForPlayerItem(
  items: PlayerItem[],
  itemIndex: number,
  split: AvLyricSplitPrefs,
): AvItemSlides {
  return avSlidesForItem(items[itemIndex], split)
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
): AvFlatSlide[] {
  const flat: AvFlatSlide[] = []
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const tocTitle = tocEntryForIndex(toc, itemIndex)?.title
    const { slides } = avSlidesForItem(items[itemIndex], split, tocTitle)
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
): string {
  const item = items[itemIndex]
  if (tocTitle?.trim()) return tocTitle.trim()
  if (!item) return ''
  if (item.type === 'chords') {
    return item.song.data.titles?.[0]?.trim() || ''
  }
  return ''
}

export function avItemHasLyrics(items: PlayerItem[], itemIndex: number): boolean {
  return itemTypeAt(items, itemIndex) === 'chords'
}

export function avTotalSlides(items: PlayerItem[], split: AvLyricSplitPrefs): number {
  return buildAvFlatSlides(items, split).length
}

export type AvPlayerContext = {
  player: Player
  split: AvLyricSplitPrefs
}

export function rebuildAvFlat(ctx: AvPlayerContext): AvFlatSlide[] {
  return buildAvFlatSlides(ctx.player.items, ctx.split, ctx.player.toc)
}
