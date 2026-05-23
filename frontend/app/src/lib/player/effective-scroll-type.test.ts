import { describe, expect, it } from 'vitest'

import {
  effectiveScrollType,
  isMultiColumnScrollMode,
  isMultiColumnWithNextPreviewMode,
  isThreeColumnScrollMode,
  multiColumnCount,
  nextPlayerScrollType,
  normalizeScrollType,
  PLAYER_SCROLL_TYPES,
  supportsIntraItemPaging,
} from '@/lib/player/effective-scroll-type'

describe('normalizeScrollType', () => {
  it('keeps supported modes', () => {
    expect(normalizeScrollType('one_page')).toBe('one_page')
    expect(normalizeScrollType('book')).toBe('book')
    expect(normalizeScrollType('two_column')).toBe('two_column')
    expect(normalizeScrollType('two_column_next')).toBe('two_column_next')
    expect(normalizeScrollType('three_column')).toBe('three_column')
    expect(normalizeScrollType('three_column_next')).toBe('three_column_next')
  })

  it('maps removed modes to page', () => {
    expect(normalizeScrollType('half_page')).toBe('one_page')
    expect(normalizeScrollType('two_page')).toBe('one_page')
    expect(normalizeScrollType('two_half_page')).toBe('one_page')
  })
})

describe('effectiveScrollType', () => {
  it('matches normalizeScrollType', () => {
    expect(effectiveScrollType('two_page')).toBe('one_page')
    expect(effectiveScrollType('book')).toBe('book')
    expect(effectiveScrollType('two_column')).toBe('two_column')
    expect(effectiveScrollType('two_column_next')).toBe('two_column_next')
    expect(effectiveScrollType('three_column')).toBe('three_column')
    expect(effectiveScrollType('three_column_next')).toBe('three_column_next')
  })
})

describe('isMultiColumnScrollMode', () => {
  it('detects multi-column modes', () => {
    expect(isMultiColumnScrollMode('two_column')).toBe(true)
    expect(isMultiColumnScrollMode('two_column_next')).toBe(true)
    expect(isMultiColumnScrollMode('three_column')).toBe(true)
    expect(isMultiColumnScrollMode('three_column_next')).toBe(true)
    expect(isMultiColumnScrollMode('one_page')).toBe(false)
    expect(isMultiColumnScrollMode('book')).toBe(false)
  })
})

describe('isMultiColumnWithNextPreviewMode', () => {
  it('detects next-song preview variants only', () => {
    expect(isMultiColumnWithNextPreviewMode('two_column_next')).toBe(true)
    expect(isMultiColumnWithNextPreviewMode('three_column_next')).toBe(true)
    expect(isMultiColumnWithNextPreviewMode('two_column')).toBe(false)
    expect(isMultiColumnWithNextPreviewMode('three_column')).toBe(false)
  })
})

describe('multiColumnCount', () => {
  it('returns column count for multi-column modes', () => {
    expect(multiColumnCount('two_column')).toBe(2)
    expect(multiColumnCount('two_column_next')).toBe(2)
    expect(multiColumnCount('three_column')).toBe(3)
    expect(multiColumnCount('three_column_next')).toBe(3)
    expect(multiColumnCount('one_page')).toBeNull()
    expect(multiColumnCount('book')).toBeNull()
  })
})

describe('isThreeColumnScrollMode', () => {
  it('detects three column mode only', () => {
    expect(isThreeColumnScrollMode('three_column')).toBe(true)
    expect(isThreeColumnScrollMode('three_column_next')).toBe(false)
    expect(isThreeColumnScrollMode('two_column')).toBe(false)
    expect(isThreeColumnScrollMode('one_page')).toBe(false)
    expect(isThreeColumnScrollMode('book')).toBe(false)
  })
})

describe('supportsIntraItemPaging', () => {
  it('is disabled in the simplified player', () => {
    expect(supportsIntraItemPaging('book', false)).toBe(false)
    expect(supportsIntraItemPaging('book', true)).toBe(false)
    expect(supportsIntraItemPaging('one_page', false)).toBe(false)
    expect(supportsIntraItemPaging('half_page', false)).toBe(false)
  })
})

describe('nextPlayerScrollType', () => {
  it('cycles through all player scroll modes', () => {
    expect(nextPlayerScrollType('one_page')).toBe('book')
    expect(nextPlayerScrollType('book')).toBe('two_column')
    expect(nextPlayerScrollType('two_column')).toBe('two_column_next')
    expect(nextPlayerScrollType('two_column_next')).toBe('three_column')
    expect(nextPlayerScrollType('three_column')).toBe('three_column_next')
    expect(nextPlayerScrollType('three_column_next')).toBe('one_page')
  })
})

describe('PLAYER_SCROLL_TYPES', () => {
  it('exposes page, book, and multi-column modes', () => {
    expect(PLAYER_SCROLL_TYPES).toEqual([
      'one_page',
      'book',
      'two_column',
      'two_column_next',
      'three_column',
      'three_column_next',
    ])
  })
})
