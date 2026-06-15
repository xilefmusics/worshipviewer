import { useEffect, useState } from 'react'

import { listenToMediaQuery } from '@/lib/browser-apis'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof globalThis.window === 'undefined' || typeof globalThis.window.matchMedia !== 'function') {
      return false
    }
    return globalThis.window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof globalThis.window.matchMedia !== 'function') return
    const mq = globalThis.window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    return listenToMediaQuery(mq, onChange)
  }, [query])

  return matches
}

export function useIsPhoneWidth(): boolean {
  return !useMediaQuery('(min-width: 768px)')
}
