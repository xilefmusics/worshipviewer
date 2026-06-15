import { createContext } from 'react'

export type HubSearchContextValue = {
  /** Immediate value bound to search inputs (header + palette). */
  qInput: string
  setQInput: (value: string) => void
  /** Debounced value passed to list queries (`q` API param). */
  debouncedQ: string
  /** Selected owning team filter for library lists; `null` means all accessible teams. */
  selectedTeamId: string | null
  setSelectedTeamId: (value: string | null) => void
}

export const HubSearchContext = createContext<HubSearchContextValue | null>(null)
