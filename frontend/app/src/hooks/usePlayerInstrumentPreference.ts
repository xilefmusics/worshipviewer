import { useEffect, useState } from 'react'

import {
  PLAYER_INSTRUMENT_CHANGE_EVENT,
  readPlayerInstrumentPreference,
  type PlayerInstrument,
} from '@/lib/player/player-instrument-preference'

export function usePlayerInstrumentPreference(): PlayerInstrument {
  const [instrument, setInstrument] = useState(readPlayerInstrumentPreference)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<PlayerInstrument>).detail
      setInstrument(detail ?? readPlayerInstrumentPreference())
    }

    globalThis.window.addEventListener(PLAYER_INSTRUMENT_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(PLAYER_INSTRUMENT_CHANGE_EVENT, onChange)
  }, [])

  return instrument
}
