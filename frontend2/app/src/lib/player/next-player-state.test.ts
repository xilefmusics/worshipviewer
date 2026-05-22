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

  it('jumps items immediately when between_items is true', () => {
    const state = nextPlayerState(
      { index: 0, pageOffset: 0 },
      { type: 'next' },
      { ...config, betweenItems: true, scrollType: 'book' },
    )
    expect(state).toEqual({ index: 1, pageOffset: 0 })
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
