import type { components } from '@/api/schema'

import type { PlayerLayoutColumnCount } from '@/lib/player/player-column-count'

export type { PlayerLayoutColumnCount } from '@/lib/player/player-column-count'
export { resolveFreeColumnCount } from '@/lib/player/player-column-count'

export type ScrollType = components['schemas']['ScrollType']
export type PlayerScrollType =
  | 'one_page'
  | 'book'
  | 'one_column'
  | 'one_column_next'
  | 'two_column'
  | 'two_column_next'
  | 'three_column'
  | 'three_column_next'

export type PlayerLayoutMode = 'page' | 'free'
export type PlayerOverflowStyle = 'cut' | 'scroll'

export type PlayerLayoutPreference = {
  mode: PlayerLayoutMode
  pageCount: 1 | 2
  columnCount: PlayerLayoutColumnCount
  nextSongPreview: boolean
  overflowStyle: PlayerOverflowStyle
  /** Repeat lyrics in later duplicate sections that have no text (free mode). */
  expandSections: boolean
}

export const DEFAULT_PLAYER_LAYOUT_PREFERENCE: PlayerLayoutPreference = {
  mode: 'free',
  pageCount: 1,
  columnCount: 'adaptive',
  nextSongPreview: false,
  overflowStyle: 'scroll',
  expandSections: false,
}

export const PLAYER_SCROLL_TYPES: PlayerScrollType[] = [
  'one_page',
  'book',
  'one_column',
  'one_column_next',
  'two_column',
  'two_column_next',
  'three_column',
  'three_column_next',
]

export function nextPlayerScrollType(current: PlayerScrollType): PlayerScrollType {
  const idx = PLAYER_SCROLL_TYPES.indexOf(current)
  const next = idx === -1 ? 0 : (idx + 1) % PLAYER_SCROLL_TYPES.length
  return PLAYER_SCROLL_TYPES[next]
}

/** Map a free-mode preference to scroll type using a resolved column count. */
export function layoutPreferenceToScrollType(
  pref: PlayerLayoutPreference,
  resolvedColumnCount?: 1 | 2 | 3,
): PlayerScrollType {
  if (pref.mode === 'page') {
    return pref.pageCount === 2 ? 'book' : 'one_page'
  }
  const columns =
    resolvedColumnCount ??
    (pref.columnCount === 'adaptive' ? 2 : pref.columnCount)
  const next = pref.nextSongPreview
  if (columns === 1) return next ? 'one_column_next' : 'one_column'
  if (columns === 2) return next ? 'two_column_next' : 'two_column'
  return next ? 'three_column_next' : 'three_column'
}

export function scrollTypeToLayoutPreference(scrollType: PlayerScrollType): PlayerLayoutPreference {
  switch (scrollType) {
    case 'one_page':
      return { ...DEFAULT_PLAYER_LAYOUT_PREFERENCE, mode: 'page', pageCount: 1 }
    case 'book':
      return { ...DEFAULT_PLAYER_LAYOUT_PREFERENCE, mode: 'page', pageCount: 2 }
    case 'one_column':
      return {
        ...DEFAULT_PLAYER_LAYOUT_PREFERENCE,
        mode: 'free',
        columnCount: 1,
        nextSongPreview: false,
      }
    case 'one_column_next':
      return {
        ...DEFAULT_PLAYER_LAYOUT_PREFERENCE,
        mode: 'free',
        columnCount: 1,
        nextSongPreview: true,
      }
    case 'two_column':
      return {
        ...DEFAULT_PLAYER_LAYOUT_PREFERENCE,
        mode: 'free',
        columnCount: 2,
        nextSongPreview: false,
      }
    case 'two_column_next':
      return {
        ...DEFAULT_PLAYER_LAYOUT_PREFERENCE,
        mode: 'free',
        columnCount: 2,
        nextSongPreview: true,
      }
    case 'three_column':
      return {
        ...DEFAULT_PLAYER_LAYOUT_PREFERENCE,
        mode: 'free',
        columnCount: 3,
        nextSongPreview: false,
      }
    case 'three_column_next':
      return {
        ...DEFAULT_PLAYER_LAYOUT_PREFERENCE,
        mode: 'free',
        columnCount: 3,
        nextSongPreview: true,
      }
    default:
      return { ...DEFAULT_PLAYER_LAYOUT_PREFERENCE, mode: 'page', pageCount: 1 }
  }
}

/** Map API / legacy scroll modes to the supported player modes. */
export function normalizeScrollType(
  scrollType: ScrollType | PlayerScrollType | string | null | undefined,
): PlayerScrollType {
  if (scrollType === 'book') return 'book'
  if (scrollType === 'one_column') return 'one_column'
  if (scrollType === 'one_column_next') return 'one_column_next'
  if (scrollType === 'two_column') return 'two_column'
  if (scrollType === 'two_column_next') return 'two_column_next'
  if (scrollType === 'three_column') return 'three_column'
  if (scrollType === 'three_column_next') return 'three_column_next'
  return 'one_page'
}

/** Resolve persisted or server scroll mode for rendering and navigation. */
export function effectiveScrollType(
  scrollType: ScrollType | PlayerScrollType | string | null | undefined,
): PlayerScrollType {
  return normalizeScrollType(scrollType)
}

export function isMultiColumnScrollMode(scrollType: PlayerScrollType): boolean {
  return (
    scrollType === 'one_column' ||
    scrollType === 'one_column_next' ||
    scrollType === 'two_column' ||
    scrollType === 'two_column_next' ||
    scrollType === 'three_column' ||
    scrollType === 'three_column_next'
  )
}

export function isMultiColumnWithNextPreviewMode(scrollType: PlayerScrollType): boolean {
  return (
    scrollType === 'one_column_next' ||
    scrollType === 'two_column_next' ||
    scrollType === 'three_column_next'
  )
}

export function multiColumnCount(scrollType: PlayerScrollType): 1 | 2 | 3 | null {
  if (scrollType === 'one_column' || scrollType === 'one_column_next') return 1
  if (scrollType === 'two_column' || scrollType === 'two_column_next') return 2
  if (scrollType === 'three_column' || scrollType === 'three_column_next') return 3
  return null
}

/** @deprecated Use isMultiColumnScrollMode */
export function isThreeColumnScrollMode(scrollType: PlayerScrollType): boolean {
  return scrollType === 'three_column'
}

/** Whether prev/next should page within an item before crossing boundaries. */
export function supportsIntraItemPaging(
  scrollType: ScrollType | PlayerScrollType,
  betweenItems: boolean,
): boolean {
  void scrollType
  void betweenItems
  return false
}

/** Logical page count within one player item for navigation. */
export function pagesPerItem(
  scrollType: ScrollType | PlayerScrollType,
  itemType: 'blob' | 'chords',
): number {
  void itemType
  return normalizeScrollType(scrollType) === 'book' ? 1 : 1
}
