import { describe, expect, it } from 'vitest'

import {
  effectiveScrollType,
  isThreeColumnScrollMode,
  normalizeScrollType,
  PLAYER_SCROLL_TYPES,
  supportsIntraItemPaging,
} from '@/lib/player/effective-scroll-type'

describe('normalizeScrollType', () => {
  it('keeps supported modes', () => {
    expect(normalizeScrollType('one_page')).toBe('one_page')
    expect(normalizeScrollType('book')).toBe('book')
    expect(normalizeScrollType('three_column')).toBe('three_column')
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
    expect(effectiveScrollType('three_column')).toBe('three_column')
  })
})

describe('isThreeColumnScrollMode', () => {
  it('detects three column mode', () => {
    expect(isThreeColumnScrollMode('three_column')).toBe(true)
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

describe('PLAYER_SCROLL_TYPES', () => {
  it('exposes page, book, and three column', () => {
    expect(PLAYER_SCROLL_TYPES).toEqual(['one_page', 'book', 'three_column'])
  })
})
