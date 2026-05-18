import { createContext, useContext } from 'react'

export type PwaInstallContextValue = {
  canShowInstall: boolean
  openInstall: () => void
}

export const PwaInstallContext = createContext<PwaInstallContextValue | null>(null)

export function usePwaInstall(): PwaInstallContextValue {
  const ctx = useContext(PwaInstallContext)
  if (!ctx) {
    throw new Error('usePwaInstall must be used within PwaInstallProvider')
  }
  return ctx
}
