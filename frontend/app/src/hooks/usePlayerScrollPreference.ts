import { useEffect, useState } from 'react'

import {
  PLAYER_SCROLL_CHANGE_EVENT,
  readPlayerScrollPreferences,
  type PlayerScrollPreferences,
} from '@/lib/player-scroll-preference'

export function usePlayerScrollPreference(): PlayerScrollPreferences {
  const [preferences, setPreferences] = useState(readPlayerScrollPreferences)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<PlayerScrollPreferences>).detail
      setPreferences(detail ?? readPlayerScrollPreferences())
    }

    globalThis.window.addEventListener(PLAYER_SCROLL_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(PLAYER_SCROLL_CHANGE_EVENT, onChange)
  }, [])

  return preferences
}
