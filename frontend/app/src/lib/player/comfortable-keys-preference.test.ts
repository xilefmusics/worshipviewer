import { describe, expect, it, vi } from 'vitest'

import {
  COMFORTABLE_KEYS_CHANGE_EVENT,
  COMFORTABLE_KEYS_STORAGE_KEY,
  DEFAULT_COMFORTABLE_KEYS,
  readComfortableKeysPreference,
  writeComfortableKeysPreference,
} from '@/lib/player/comfortable-keys-preference'

describe('comfortable keys preference', () => {
  it('defaults to C, E, and G and ignores invalid stored values', () => {
    expect(readComfortableKeysPreference({ getItem: () => null })).toEqual(['C', 'E', 'G'])
    expect(DEFAULT_COMFORTABLE_KEYS).toEqual(['C', 'E', 'G'])
    expect(readComfortableKeysPreference({ getItem: () => JSON.stringify(['C', 'H', 'C']) })).toEqual([
      'C',
    ])
    expect(readComfortableKeysPreference({ getItem: () => 'not-json' })).toEqual(DEFAULT_COMFORTABLE_KEYS)
  })

  it('keeps at least one key selected', () => {
    expect(writeComfortableKeysPreference([], { setItem: vi.fn() })).toEqual(DEFAULT_COMFORTABLE_KEYS)
  })

  it('persists normalized keys and broadcasts the change', () => {
    const storage = { setItem: vi.fn() }
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    expect(writeComfortableKeysPreference(['G', 'C', 'G', 'H'], storage)).toEqual(['C', 'G'])
    expect(storage.setItem).toHaveBeenCalledWith(
      COMFORTABLE_KEYS_STORAGE_KEY,
      JSON.stringify(['C', 'G']),
    )
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: COMFORTABLE_KEYS_CHANGE_EVENT,
        detail: ['C', 'G'],
      }),
    )

    vi.unstubAllGlobals()
  })
})
