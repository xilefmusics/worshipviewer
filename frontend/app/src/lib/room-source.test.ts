import { describe, expect, it } from 'vitest'

import { roomSourceType } from '@/lib/room-source'

describe('roomSourceType', () => {
  it.each([
    ['songs', 'song'],
    ['collections', 'collection'],
    ['setlists', 'setlist'],
  ] as const)('maps %s to %s', (entity, sourceType) => {
    expect(roomSourceType(entity)).toBe(sourceType)
  })
})
