import { describe, expect, it } from 'vitest'

import { DEFAULT_PLAYER_LAYOUT_PREFERENCE } from '@/lib/player/effective-scroll-type'

import {
  bookJumpIndex,
  bookSpreadNavScrollType,
  bookSpreadNextIndex,
  bookSpreadPrevIndex,
  bookSpreadRightIndex,
  isBookSpreadMode,
  isFreeAdaptiveLandscapeBlobBookSpread,
  shouldUseBookSpreadLayout,
} from '@/lib/player/book-spread'

describe('isBookSpreadMode', () => {
  it('is true for book scroll mode', () => {
    expect(isBookSpreadMode('book')).toBe(true)
    expect(isBookSpreadMode('one_page')).toBe(false)
  })
})

describe('bookSpreadRightIndex', () => {
  it('shows a single page on the cover and last item', () => {
    expect(bookSpreadRightIndex(0, 5)).toBeNull()
    expect(bookSpreadRightIndex(4, 5)).toBeNull()
  })

  it('pairs interior indices with the next item', () => {
    expect(bookSpreadRightIndex(1, 5)).toBe(2)
    expect(bookSpreadRightIndex(2, 5)).toBe(3)
    expect(bookSpreadRightIndex(3, 5)).toBe(4)
  })
})

describe('bookSpreadNextIndex', () => {
  it('matches legacy book navigation', () => {
    expect(bookSpreadNextIndex(0, 5)).toBe(1)
    expect(bookSpreadNextIndex(1, 5)).toBe(3)
    expect(bookSpreadNextIndex(3, 5)).toBe(4)
    expect(bookSpreadNextIndex(4, 5)).toBe(4)
  })
})

describe('bookSpreadPrevIndex', () => {
  it('matches legacy book navigation', () => {
    expect(bookSpreadPrevIndex(4)).toBe(2)
    expect(bookSpreadPrevIndex(2)).toBe(0)
    expect(bookSpreadPrevIndex(1)).toBe(0)
    expect(bookSpreadPrevIndex(0)).toBe(0)
  })
})

describe('bookJumpIndex', () => {
  it('snaps even targets back one page for spread alignment', () => {
    expect(bookJumpIndex(0, 5)).toBe(0)
    expect(bookJumpIndex(1, 5)).toBe(1)
    expect(bookJumpIndex(2, 5)).toBe(1)
    expect(bookJumpIndex(3, 5)).toBe(3)
    expect(bookJumpIndex(4, 5)).toBe(3)
  })
})

describe('isFreeAdaptiveLandscapeBlobBookSpread', () => {
  const adaptiveFree = DEFAULT_PLAYER_LAYOUT_PREFERENCE

  it('is true for blob items in free adaptive landscape on tablet/desktop', () => {
    expect(
      isFreeAdaptiveLandscapeBlobBookSpread({
        layoutPreference: adaptiveFree,
        orientation: 'landscape',
        isPhone: false,
        itemType: 'blob',
      }),
    ).toBe(true)
  })

  it('is false for chords, portrait, phone, or non-adaptive layouts', () => {
    expect(
      isFreeAdaptiveLandscapeBlobBookSpread({
        layoutPreference: adaptiveFree,
        orientation: 'landscape',
        isPhone: false,
        itemType: 'chords',
      }),
    ).toBe(false)
    expect(
      isFreeAdaptiveLandscapeBlobBookSpread({
        layoutPreference: adaptiveFree,
        orientation: 'portrait',
        isPhone: false,
        itemType: 'blob',
      }),
    ).toBe(false)
    expect(
      isFreeAdaptiveLandscapeBlobBookSpread({
        layoutPreference: adaptiveFree,
        orientation: 'landscape',
        isPhone: true,
        itemType: 'blob',
      }),
    ).toBe(false)
    expect(
      isFreeAdaptiveLandscapeBlobBookSpread({
        layoutPreference: { ...adaptiveFree, columnCount: 3 },
        orientation: 'landscape',
        isPhone: false,
        itemType: 'blob',
      }),
    ).toBe(false)
    expect(
      isFreeAdaptiveLandscapeBlobBookSpread({
        layoutPreference: { ...adaptiveFree, mode: 'page', pageCount: 2 },
        orientation: 'landscape',
        isPhone: false,
        itemType: 'blob',
      }),
    ).toBe(false)
  })
})

describe('shouldUseBookSpreadLayout', () => {
  it('includes page-mode book and free adaptive landscape blobs', () => {
    expect(
      shouldUseBookSpreadLayout({
        scrollType: 'book',
        layoutPreference: DEFAULT_PLAYER_LAYOUT_PREFERENCE,
        orientation: 'landscape',
        isPhone: false,
        itemType: 'chords',
      }),
    ).toBe(true)
    expect(
      shouldUseBookSpreadLayout({
        scrollType: 'three_column',
        layoutPreference: DEFAULT_PLAYER_LAYOUT_PREFERENCE,
        orientation: 'landscape',
        isPhone: false,
        itemType: 'blob',
      }),
    ).toBe(true)
    expect(
      shouldUseBookSpreadLayout({
        scrollType: 'three_column',
        layoutPreference: DEFAULT_PLAYER_LAYOUT_PREFERENCE,
        orientation: 'landscape',
        isPhone: false,
        itemType: 'chords',
      }),
    ).toBe(false)
  })
})

describe('bookSpreadNavScrollType', () => {
  it('uses book navigation while spread layout is active', () => {
    expect(bookSpreadNavScrollType('three_column', true)).toBe('book')
    expect(bookSpreadNavScrollType('three_column', false)).toBe('three_column')
  })
})
