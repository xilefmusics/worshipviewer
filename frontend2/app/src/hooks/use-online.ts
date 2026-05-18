import { useSyncExternalStore } from 'react'

function subscribeOnline(cb: () => void) {
  globalThis.window.addEventListener('online', cb)
  globalThis.window.addEventListener('offline', cb)
  return () => {
    globalThis.window.removeEventListener('online', cb)
    globalThis.window.removeEventListener('offline', cb)
  }
}

function getOnlineSnapshot(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

function getServerSnapshot(): boolean {
  return true
}

/** Browser `navigator.onLine`, updated on `online` / `offline` events (no debounce). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot)
}
