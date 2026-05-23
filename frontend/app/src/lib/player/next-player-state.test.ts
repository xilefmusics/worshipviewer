import { describe, expect, it } from 'vitest'

import { nextPlayerState } from '@/lib/player/next-player-state'

const config = {
  itemCount: 3,
  betweenItems: false,
  scrollType: 'one_page' as const,
  itemTypeAt: () => 'chords' as const,
}

describe('nextPlayerState', () => {
  it('advances by item in page mode', () => {
    const state = nextPlayerState({ index: 0, pageOffset: 0 }, { type: 'next' }, config)
    expect(state).toEqual({ index: 1, pageOffset: 0 })
  })

  it('jumps items one at a time in page mode', () => {
    const state = nextPlayerState(
      { index: 0, pageOffset: 0 },
      { type: 'next' },
      { ...config, betweenItems: true, scrollType: 'one_page' },
    )
    expect(state).toEqual({ index: 1, pageOffset: 0 })
  })

  it('advances by spread in book mode', () => {
    const bookConfig = { ...config, itemCount: 5, scrollType: 'book' as const, betweenItems: false }
    expect(nextPlayerState({ index: 0, pageOffset: 0 }, { type: 'next' }, bookConfig)).toEqual({
      index: 1,
      pageOffset: 0,
    })
    expect(nextPlayerState({ index: 1, pageOffset: 0 }, { type: 'next' }, bookConfig)).toEqual({
      index: 3,
      pageOffset: 0,
    })
    expect(nextPlayerState({ index: 3, pageOffset: 0 }, { type: 'prev' }, bookConfig)).toEqual({
      index: 1,
      pageOffset: 0,
    })
  })

  it('aligns book jump targets to spread left pages', () => {
    const bookConfig = { ...config, itemCount: 5, scrollType: 'book' as const, betweenItems: false }
    expect(nextPlayerState({ index: 0, pageOffset: 0 }, { type: 'jump', index: 2 }, bookConfig)).toEqual({
      index: 1,
      pageOffset: 0,
    })
  })

  it('clamps home and end', () => {
    expect(nextPlayerState({ index: 2, pageOffset: 1 }, { type: 'home' }, config)).toEqual({
      index: 0,
      pageOffset: 0,
    })
    expect(nextPlayerState({ index: 0, pageOffset: 0 }, { type: 'end' }, config)).toEqual({
      index: 2,
      pageOffset: 0,
    })
  })

  it('jumpTo sets index and clears page offset', () => {
    expect(nextPlayerState({ index: 0, pageOffset: 1 }, { type: 'jump', index: 2 }, config)).toEqual({
      index: 2,
      pageOffset: 0,
    })
  })
})
