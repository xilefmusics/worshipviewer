import { describe, expect, it } from 'vitest'

import { buildPlayerSearch, buildPlayerSearchParams, type PlayerEntityType } from '@/lib/player-route'

describe('buildPlayerSearchParams', () => {
  it('returns type and id for each entity', () => {
    const types: PlayerEntityType[] = ['collection', 'song', 'setlist']
    for (const type of types) {
      expect(buildPlayerSearchParams(type, 'abc-123')).toEqual({ type, id: 'abc-123' })
    }
  })
})

describe('buildPlayerSearch', () => {
  it('includes optional mode and index', () => {
    expect(buildPlayerSearch('song', 'id-1', 2, 'av')).toEqual({
      type: 'song',
      id: 'id-1',
      index: 2,
      mode: 'av',
    })
  })
})
