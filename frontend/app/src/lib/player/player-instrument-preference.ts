import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'

export type PlayerInstrument = 'guitar' | 'keyboard'

export const PLAYER_INSTRUMENT_STORAGE_KEY = 'wv_player_instrument'
export const PLAYER_INSTRUMENT_CHANGE_EVENT = 'wv-player-instrument-change'
export const DEFAULT_PLAYER_INSTRUMENT: PlayerInstrument = 'guitar'

export function readPlayerInstrumentPreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): PlayerInstrument {
  return safeGetItem(PLAYER_INSTRUMENT_STORAGE_KEY, storage) === 'keyboard'
    ? 'keyboard'
    : DEFAULT_PLAYER_INSTRUMENT
}

export function writePlayerInstrumentPreference(
  instrument: PlayerInstrument,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  safeSetItem(PLAYER_INSTRUMENT_STORAGE_KEY, instrument, storage)

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(PLAYER_INSTRUMENT_CHANGE_EVENT, { detail: instrument }),
    )
  }
}
