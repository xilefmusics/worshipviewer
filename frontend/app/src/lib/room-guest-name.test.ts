import { describe, expect, it } from 'vitest'

import { randomRoomGuestDisplayName } from '@/lib/room-guest-name'

describe('randomRoomGuestDisplayName', () => {
  it('returns adjective and noun separated by a space', () => {
    const name = randomRoomGuestDisplayName()
    expect(name).toMatch(/^[A-Za-z-]+ [A-Za-z]+$/)
    expect(name.length).toBeLessThanOrEqual(80)
  })

  it('can produce worship-themed combinations', () => {
    const names = new Set(Array.from({ length: 40 }, () => randomRoomGuestDisplayName()))
    expect(names.size).toBeGreaterThan(1)
  })
})
