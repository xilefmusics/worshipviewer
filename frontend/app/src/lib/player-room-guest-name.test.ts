import { describe, expect, it } from 'vitest'

import { randomPlayerRoomGuestDisplayName } from '@/lib/player-room-guest-name'

describe('randomPlayerRoomGuestDisplayName', () => {
  it('returns adjective and noun separated by a space', () => {
    const name = randomPlayerRoomGuestDisplayName()
    expect(name).toMatch(/^[A-Za-z-]+ [A-Za-z]+$/)
    expect(name.length).toBeLessThanOrEqual(80)
  })

  it('can produce worship-themed combinations', () => {
    const names = new Set(Array.from({ length: 40 }, () => randomPlayerRoomGuestDisplayName()))
    expect(names.size).toBeGreaterThan(1)
  })
})
