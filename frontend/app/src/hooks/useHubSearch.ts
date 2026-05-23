import { useContext } from 'react'

import { HubSearchContext } from '@/context/hub-search-context'

export function useHubSearch() {
  const ctx = useContext(HubSearchContext)
  if (!ctx) {
    throw new Error('useHubSearch must be used within HubSearchProvider')
  }
  return ctx
}
