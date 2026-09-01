import { describe, expect, it } from 'vitest'

import { randomPlayerRoomName } from '@/lib/player-room-name'

describe('randomPlayerRoomName', () => {
  it('returns a worship-themed verb and noun', () => {
    expect(randomPlayerRoomName()).toMatch(/^[A-Za-z]+ [A-Za-z]+$/)
  })

  it('can produce different combinations', () => {
    const names = new Set(Array.from({ length: 40 }, () => randomPlayerRoomName()))
    expect(names.size).toBeGreaterThan(1)
  })
})
