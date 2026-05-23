import { describe, expect, it } from 'vitest'

import { prefetchNextItemIndex } from '@/lib/player/prefetch-next-item'

describe('prefetchNextItemIndex', () => {
  it('returns next index when online with more items', () => {
    expect(prefetchNextItemIndex(true, 0, 3)).toBe(1)
  })

  it('returns null when offline', () => {
    expect(prefetchNextItemIndex(false, 0, 3)).toBeNull()
  })

  it('returns null on last item', () => {
    expect(prefetchNextItemIndex(true, 2, 3)).toBeNull()
  })
})
