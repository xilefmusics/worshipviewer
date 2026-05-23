import { describe, expect, it } from 'vitest'

import { resolvePlayerMode } from '@/lib/player/player-mode'

describe('resolvePlayerMode', () => {
  it('uses explicit search mode when valid', () => {
    expect(resolvePlayerMode('av', 'normal')).toBe('av')
    expect(resolvePlayerMode('normal', 'av')).toBe('normal')
  })

  it('falls back to global default when search mode is missing or invalid', () => {
    expect(resolvePlayerMode(undefined, 'av')).toBe('av')
    expect(resolvePlayerMode(null, 'normal')).toBe('normal')
    expect(resolvePlayerMode('invalid', 'av')).toBe('av')
  })
})
