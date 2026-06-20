import { useEffect, useState } from 'react'

import {
  AV_BILINGUAL_CHANGE_EVENT,
  readAvBilingualPreference,
} from '@/lib/av-bilingual-preference'

export function useAvBilingualPreference(): boolean {
  const [enabled, setEnabled] = useState(readAvBilingualPreference)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      setEnabled(detail ?? readAvBilingualPreference())
    }

    globalThis.window.addEventListener(AV_BILINGUAL_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(AV_BILINGUAL_CHANGE_EVENT, onChange)
  }, [])

  return enabled
}
