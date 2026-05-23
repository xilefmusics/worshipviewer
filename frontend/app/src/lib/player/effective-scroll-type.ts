import type { components } from '@/api/schema'

export type ScrollType = components['schemas']['ScrollType']
export type PlayerScrollType =
  | 'one_page'
  | 'book'
  | 'two_column'
  | 'two_column_next'
  | 'three_column'
  | 'three_column_next'

export const PLAYER_SCROLL_TYPES: PlayerScrollType[] = [
  'one_page',
  'book',
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

/** Map API / legacy scroll modes to the supported player modes. */
export function normalizeScrollType(
  scrollType: ScrollType | PlayerScrollType | string | null | undefined,
): PlayerScrollType {
  if (scrollType === 'book') return 'book'
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
    scrollType === 'two_column' ||
    scrollType === 'two_column_next' ||
    scrollType === 'three_column' ||
    scrollType === 'three_column_next'
  )
}

export function isMultiColumnWithNextPreviewMode(scrollType: PlayerScrollType): boolean {
  return scrollType === 'two_column_next' || scrollType === 'three_column_next'
}

export function multiColumnCount(scrollType: PlayerScrollType): 2 | 3 | null {
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
