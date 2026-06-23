/* eslint-disable react-refresh/only-export-components -- registrar hook shares private React context */
import {
  createContext,
  useContext,
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

export type SongEditorNavigationBridge = {
  flushBeforeLeave: () => Promise<boolean>
}

const SongEditorNavigationRegistrarContext = createContext<Dispatch<
  SetStateAction<SongEditorNavigationBridge | null>
> | null>(null)

const SongEditorNavigationBridgeContext = createContext<SongEditorNavigationBridge | null>(null)

export function SongEditorNavigationBridgeProvider({
  bridge,
  setBridge,
  children,
}: {
  bridge: SongEditorNavigationBridge | null
  setBridge: Dispatch<SetStateAction<SongEditorNavigationBridge | null>>
  children: ReactNode
}) {
  return (
    <SongEditorNavigationRegistrarContext.Provider value={setBridge}>
      <SongEditorNavigationBridgeContext.Provider value={bridge}>
        {children}
      </SongEditorNavigationBridgeContext.Provider>
    </SongEditorNavigationRegistrarContext.Provider>
  )
}

export function useRegisterSongEditorNavigationBridge(
  bridge: SongEditorNavigationBridge | null,
): void {
  const setBridge = useContext(SongEditorNavigationRegistrarContext)
  useEffect(() => {
    if (!setBridge) return
    setBridge(bridge)
    return () => {
      setBridge(null)
    }
  }, [bridge, setBridge])
}

export function useSongEditorNavigationBridge(): SongEditorNavigationBridge | null {
  return useContext(SongEditorNavigationBridgeContext)
}
