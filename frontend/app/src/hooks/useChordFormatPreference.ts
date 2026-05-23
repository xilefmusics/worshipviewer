import { useEffect, useState } from 'react'

import {
  CHORD_FORMAT_CHANGE_EVENT,
  readChordFormatPreference,
  type ChordFormatPreference,
} from '@/lib/chord-format'

export function useChordFormatPreference(): ChordFormatPreference {
  const [preference, setPreference] = useState(readChordFormatPreference)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ChordFormatPreference>).detail
      setPreference(detail ?? readChordFormatPreference())
    }

    globalThis.window.addEventListener(CHORD_FORMAT_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(CHORD_FORMAT_CHANGE_EVENT, onChange)
  }, [])

  return preference
}
