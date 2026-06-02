import { describe, expect, it } from 'vitest'

import { resolveFreeColumnCount } from '@/lib/player/player-column-count'

describe('resolveFreeColumnCount', () => {
  it('returns fixed counts unchanged', () => {
    expect(resolveFreeColumnCount(3, { isPhone: true, isLandscape: false })).toBe(3)
  })

  it('uses 1 column on phone', () => {
    expect(resolveFreeColumnCount('adaptive', { isPhone: true, isLandscape: false })).toBe(1)
    expect(resolveFreeColumnCount('adaptive', { isPhone: true, isLandscape: true })).toBe(1)
  })

  it('uses 2 columns in portrait on tablet/desktop', () => {
    expect(resolveFreeColumnCount('adaptive', { isPhone: false, isLandscape: false })).toBe(2)
  })

  it('uses 3 columns in landscape on tablet/desktop', () => {
    expect(resolveFreeColumnCount('adaptive', { isPhone: false, isLandscape: true })).toBe(3)
  })
})
