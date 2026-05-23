import { createContext, useContext, type RefObject } from 'react'

/** Ref to the hub `<main>` scrollport (wheel/touch scrolling lives here for Chrome compatibility). */
export const HubScrollContainerRefContext = createContext<RefObject<HTMLElement | null> | null>(null)

export function useHubScrollContainerRef(): RefObject<HTMLElement | null> {
  const ref = useContext(HubScrollContainerRefContext)
  if (!ref) {
    throw new Error('useHubScrollContainerRef must be used within HubScrollContainerRefContext.Provider')
  }
  return ref
}
