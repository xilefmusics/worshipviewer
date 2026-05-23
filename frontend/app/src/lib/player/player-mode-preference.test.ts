import { describe, expect, it } from 'vitest'

import {
  PLAYER_DEFAULT_MODE_STORAGE_KEY,
  readPlayerDefaultMode,
  writePlayerDefaultMode,
} from '@/lib/player/player-mode-preference'

describe('player-mode-preference', () => {
  it('defaults to normal when unset', () => {
    const storage = { getItem: () => null, setItem: () => {} }
    expect(readPlayerDefaultMode(storage)).toBe('normal')
  })

  it('round-trips av mode', () => {
    const map = new Map<string, string>()
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value)
      },
    }
    writePlayerDefaultMode('av', storage)
    expect(map.get(PLAYER_DEFAULT_MODE_STORAGE_KEY)).toBe('av')
    expect(readPlayerDefaultMode(storage)).toBe('av')
  })
})
