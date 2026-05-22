import { describe, expect, it } from 'vitest'

import { nextPlayerState } from '@/lib/player/next-player-state'

const config = {
  itemCount: 3,
  betweenItems: false,
  scrollType: 'half_page' as const,
  itemTypeAt: () => 'chords' as const,
}

describe('nextPlayerState', () => {
  it('pages within an item before crossing when between_items is false', () => {
    let state = { index: 0, pageOffset: 0 }
    state = nextPlayerState(state, { type: 'next' }, config)
    expect(state).toEqual({ index: 0, pageOffset: 1 })
    state = nextPlayerState(state, { type: 'next' }, config)
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
