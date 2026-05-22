import type { components } from '@/api/schema'

export type ScrollType = components['schemas']['ScrollType']
export type PlayerScrollType = 'one_page' | 'book'

export const PLAYER_SCROLL_TYPES: PlayerScrollType[] = ['one_page', 'book']

/** Map API / legacy scroll modes to the supported player modes. */
export function normalizeScrollType(scrollType: ScrollType): PlayerScrollType {
  return scrollType === 'book' ? 'book' : 'one_page'
}

/** Resolve persisted or server scroll mode for rendering and navigation. */
export function effectiveScrollType(scrollType: ScrollType): PlayerScrollType {
  return normalizeScrollType(scrollType)
}

/** Whether prev/next should page within an item before crossing boundaries. */
export function supportsIntraItemPaging(scrollType: ScrollType, betweenItems: boolean): boolean {
  if (betweenItems) return false
  return normalizeScrollType(scrollType) === 'book'
}

/** Logical page count within one player item for navigation. */
export function pagesPerItem(scrollType: ScrollType, itemType: 'blob' | 'chords'): number {
  void itemType
  return normalizeScrollType(scrollType) === 'book' ? 1 : 1
}
