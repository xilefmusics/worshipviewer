import { describe, expect, it } from 'vitest'

import { buildPlayerSearchParams, type PlayerEntityType } from '@/lib/player-route'

describe('buildPlayerSearchParams', () => {
  it('returns type and id for each entity', () => {
    const types: PlayerEntityType[] = ['collection', 'song', 'setlist']
    for (const type of types) {
      expect(buildPlayerSearchParams(type, 'abc-123')).toEqual({ type, id: 'abc-123' })
    }
  })
})
