import { describe, expect, it } from 'vitest'

import type { SongHydrationOutcome } from '@/lib/setlist-broken-rows'
import { brokenSlotGate } from '@/lib/setlist-broken-rows'

describe('brokenSlotGate', () => {
  it('allows save when loading or ok usable song only', () => {
    const o: SongHydrationOutcome[] = [{ kind: 'loading' }, { kind: 'ok', notASong: false }]
    const { brokenIndices, saveBlocked } = brokenSlotGate(o)
    expect(saveBlocked).toBe(false)
    expect([...brokenIndices]).toEqual([])
  })

  it('marks broken and blocks save when a slot hydration failed', () => {
    const o: SongHydrationOutcome[] = [{ kind: 'ok', notASong: false }, { kind: 'broken' }]
    const { brokenIndices, saveBlocked } = brokenSlotGate(o)
    expect(saveBlocked).toBe(true)
    expect([...brokenIndices]).toEqual([1])
  })

  it('treats not_a_song as broken', () => {
    const o: SongHydrationOutcome[] = [{ kind: 'ok', notASong: true }]
    expect(brokenSlotGate(o)).toEqual({
      brokenIndices: new Set([0]),
      saveBlocked: true,
    })
  })
})
