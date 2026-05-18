import { useCallback, useEffect, useMemo, useState } from 'react'

import { HubSearchContext } from '@/context/hub-search-context'

const DEBOUNCE_MS = 300

export function HubSearchProvider({ children }: { children: React.ReactNode }) {
  const [qInput, setQInputState] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(qInput), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [qInput])

  const setQInput = useCallback((value: string) => {
    setQInputState(value)
  }, [])

  const value = useMemo(
    () => ({
      qInput,
      setQInput,
      debouncedQ,
    }),
    [qInput, setQInput, debouncedQ],
  )

  return <HubSearchContext.Provider value={value}>{children}</HubSearchContext.Provider>
}
