import { describe, expect, it } from 'vitest'

import { brokenSlotGate } from '@/lib/setlist-broken-rows'

describe('brokenSlotGate (collection editor parity)', () => {
  it('does not block on loading slots alone', () => {
    expect(brokenSlotGate([{ kind: 'loading' }, { kind: 'loading' }])).toEqual({
      brokenIndices: new Set(),
      saveBlocked: false,
    })
  })

  it('blocks when any slot is broken', () => {
    expect(
      brokenSlotGate([{ kind: 'ok', notASong: false }, { kind: 'broken' }]),
    ).toEqual({
      brokenIndices: new Set([1]),
      saveBlocked: true,
    })
  })

  it('blocks when hydrated song is not_a_song', () => {
    expect(
      brokenSlotGate([{ kind: 'ok', notASong: true }]),
    ).toEqual({
      brokenIndices: new Set([0]),
      saveBlocked: true,
    })
  })
})
