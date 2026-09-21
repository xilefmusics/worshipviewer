import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_PLAYER_INSTRUMENT,
  PLAYER_INSTRUMENT_CHANGE_EVENT,
  PLAYER_INSTRUMENT_STORAGE_KEY,
  readPlayerInstrumentPreference,
  writePlayerInstrumentPreference,
} from '@/lib/player/player-instrument-preference'

describe('player instrument preference', () => {
  it('defaults to guitar and accepts keyboard', () => {
    expect(readPlayerInstrumentPreference({ getItem: () => null })).toBe(DEFAULT_PLAYER_INSTRUMENT)
    expect(readPlayerInstrumentPreference({ getItem: () => 'keyboard' })).toBe('keyboard')
    expect(readPlayerInstrumentPreference({ getItem: () => 'piano' })).toBe('guitar')
  })

  it('persists and broadcasts the instrument', () => {
    const storage = { setItem: vi.fn() }
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    writePlayerInstrumentPreference('keyboard', storage)

    expect(storage.setItem).toHaveBeenCalledWith(PLAYER_INSTRUMENT_STORAGE_KEY, 'keyboard')
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PLAYER_INSTRUMENT_CHANGE_EVENT,
        detail: 'keyboard',
      }),
    )

    vi.unstubAllGlobals()
  })
})
