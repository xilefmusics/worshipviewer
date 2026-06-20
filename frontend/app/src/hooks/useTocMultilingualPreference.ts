import { useEffect, useState } from 'react'

import {
  TOC_MULTILINGUAL_CHANGE_EVENT,
  readTocMultilingualPreference,
} from '@/lib/toc-multilingual-preference'

export function useTocMultilingualPreference(): boolean {
  const [enabled, setEnabled] = useState(readTocMultilingualPreference)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      setEnabled(detail ?? readTocMultilingualPreference())
    }

    globalThis.window.addEventListener(TOC_MULTILINGUAL_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(TOC_MULTILINGUAL_CHANGE_EVENT, onChange)
  }, [])

  return enabled
}
