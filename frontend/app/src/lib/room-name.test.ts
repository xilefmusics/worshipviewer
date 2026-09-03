import { describe, expect, it } from 'vitest'

import { randomRoomName } from '@/lib/room-name'

describe('randomRoomName', () => {
  it('returns a worship-themed verb and noun', () => {
    expect(randomRoomName()).toMatch(/^[A-Za-z]+ [A-Za-z]+$/)
  })

  it('can produce different combinations', () => {
    const names = new Set(Array.from({ length: 40 }, () => randomRoomName()))
    expect(names.size).toBeGreaterThan(1)
  })
})
