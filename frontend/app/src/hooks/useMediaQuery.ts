import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof globalThis.window === 'undefined') return false
    return globalThis.window.matchMedia(query).matches
  })

  useEffect(() => {
    const mq = globalThis.window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export function useIsPhoneWidth(): boolean {
  return !useMediaQuery('(min-width: 768px)')
}
