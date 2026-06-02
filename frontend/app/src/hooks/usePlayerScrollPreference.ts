import { useEffect, useState } from 'react'

import {
  PLAYER_SCROLL_CHANGE_EVENT,
  readPlayerLayoutPreferences,
  type PlayerLayoutPreferences,
} from '@/lib/player-scroll-preference'

export function usePlayerLayoutPreference(): PlayerLayoutPreferences {
  const [preferences, setPreferences] = useState(readPlayerLayoutPreferences)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<PlayerLayoutPreferences>).detail
      setPreferences(detail ?? readPlayerLayoutPreferences())
    }

    globalThis.window.addEventListener(PLAYER_SCROLL_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(PLAYER_SCROLL_CHANGE_EVENT, onChange)
  }, [])

  return preferences
}

/** @deprecated Use usePlayerLayoutPreference */
export function usePlayerScrollPreference(): PlayerLayoutPreferences {
  return usePlayerLayoutPreference()
}
