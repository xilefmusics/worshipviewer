import { describe, expect, it } from 'vitest'

import {
  effectiveScrollType,
  normalizeScrollType,
  PLAYER_SCROLL_TYPES,
  supportsIntraItemPaging,
} from '@/lib/player/effective-scroll-type'

describe('normalizeScrollType', () => {
  it('keeps supported modes', () => {
    expect(normalizeScrollType('one_page')).toBe('one_page')
    expect(normalizeScrollType('book')).toBe('book')
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
  it('exposes page and book only', () => {
    expect(PLAYER_SCROLL_TYPES).toEqual(['one_page', 'book'])
  })
})
