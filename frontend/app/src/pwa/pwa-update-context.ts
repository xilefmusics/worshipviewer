import { createContext, useContext } from 'react'

export type PwaUpdateStatus =
  | 'idle'
  | 'checking'
  | 'updateAvailable'
  | 'upToDate'
  | 'unsupported'

export type PwaUpdateContextValue = {
  status: PwaUpdateStatus
  needRefresh: boolean
  checkForUpdate: () => Promise<PwaUpdateStatus>
  applyUpdate: () => void
}

export const PwaUpdateContext = createContext<PwaUpdateContextValue | null>(null)

export function usePwaUpdate(): PwaUpdateContextValue {
  const ctx = useContext(PwaUpdateContext)
  if (!ctx) {
    throw new Error('usePwaUpdate must be used within PwaUpdateProvider')
  }
  return ctx
}
