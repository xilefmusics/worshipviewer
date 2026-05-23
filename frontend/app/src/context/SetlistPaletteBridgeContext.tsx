/* eslint-disable react-refresh/only-export-components -- registrar hook shares private React context */
import {
  createContext,
  useContext,
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

import type { SetlistPaletteBridge } from '@/lib/setlist-palette-bridge'

const SetlistPaletteRegistrarContext = createContext<Dispatch<
  SetStateAction<SetlistPaletteBridge | null>
> | null>(null)

export function SetlistPaletteRegistrarProvider({
  value,
  children,
}: {
  value: Dispatch<SetStateAction<SetlistPaletteBridge | null>>
  children: ReactNode
}) {
  return (
    <SetlistPaletteRegistrarContext.Provider value={value}>{children}</SetlistPaletteRegistrarContext.Provider>
  )
}

export function useRegisterSetlistPaletteBridge(bridge: SetlistPaletteBridge | null): void {
  const setBridge = useContext(SetlistPaletteRegistrarContext)
  useEffect(() => {
    if (!setBridge) return
    setBridge(bridge)
    return () => {
      setBridge(null)
    }
  }, [bridge, setBridge])
}
