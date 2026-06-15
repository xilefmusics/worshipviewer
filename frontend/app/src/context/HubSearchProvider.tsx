import { useCallback, useEffect, useMemo, useState } from 'react'

import { HubSearchContext } from '@/context/hub-search-context'

const DEBOUNCE_MS = 300

export function HubSearchProvider({ children }: { children: React.ReactNode }) {
  const [qInput, setQInputState] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

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
      selectedTeamId,
      setSelectedTeamId,
    }),
    [qInput, setQInput, debouncedQ, selectedTeamId],
  )

  return <HubSearchContext.Provider value={value}>{children}</HubSearchContext.Provider>
}
