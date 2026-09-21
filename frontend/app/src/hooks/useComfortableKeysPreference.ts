import { useEffect, useState } from 'react'

import {
  COMFORTABLE_KEYS_CHANGE_EVENT,
  readComfortableKeysPreference,
  type ComfortableKey,
} from '@/lib/player/comfortable-keys-preference'

export function useComfortableKeysPreference(): ComfortableKey[] {
  const [keys, setKeys] = useState(readComfortableKeysPreference)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ComfortableKey[]>).detail
      setKeys(detail ?? readComfortableKeysPreference())
    }

    globalThis.window.addEventListener(COMFORTABLE_KEYS_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(COMFORTABLE_KEYS_CHANGE_EVENT, onChange)
  }, [])

  return keys
}
