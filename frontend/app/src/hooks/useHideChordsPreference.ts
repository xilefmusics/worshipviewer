import { useEffect, useState } from 'react'

import {
  HIDE_CHORDS_CHANGE_EVENT,
  readHideChordsPreference,
} from '@/lib/hide-chords-preference'

export function useHideChordsPreference(): boolean {
  const [enabled, setEnabled] = useState(readHideChordsPreference)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      setEnabled(detail ?? readHideChordsPreference())
    }

    globalThis.window.addEventListener(HIDE_CHORDS_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(HIDE_CHORDS_CHANGE_EVENT, onChange)
  }, [])

  return enabled
}
