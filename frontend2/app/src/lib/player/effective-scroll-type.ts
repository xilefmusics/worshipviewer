import type { components } from '@/api/schema'

export type ScrollType = components['schemas']['ScrollType']

/** Collapse tablet-only scroll modes on phone widths without mutating persisted preference. */
export function effectiveScrollType(scrollType: ScrollType, isPhoneWidth: boolean): ScrollType {
  if (!isPhoneWidth) return scrollType
  if (scrollType === 'two_page') return 'one_page'
  if (scrollType === 'two_half_page') return 'half_page'
  return scrollType
}

/** Whether prev/next should page within an item before crossing boundaries. */
export function supportsIntraItemPaging(scrollType: ScrollType, betweenItems: boolean): boolean {
  if (betweenItems) return false
  return scrollType === 'half_page' || scrollType === 'book' || scrollType === 'two_half_page'
}

/** Logical page count within one player item for navigation. */
export function pagesPerItem(scrollType: ScrollType, itemType: 'blob' | 'chords'): number {
  switch (scrollType) {
    case 'half_page':
    case 'two_half_page':
      return 2
    case 'book':
      return itemType === 'chords' ? 1 : 1
    default:
      return 1
  }
}
