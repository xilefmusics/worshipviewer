import { useEffect, useState } from 'react'

import {
  DEVELOPER_OPTIONS_CHANGE_EVENT,
  readDeveloperOptionsPreference,
} from '@/lib/developer-options-preference'

export function useDeveloperOptionsPreference(): boolean {
  const [enabled, setEnabled] = useState(readDeveloperOptionsPreference)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      setEnabled(detail ?? readDeveloperOptionsPreference())
    }

    globalThis.window.addEventListener(DEVELOPER_OPTIONS_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(DEVELOPER_OPTIONS_CHANGE_EVENT, onChange)
  }, [])

  return enabled
}
