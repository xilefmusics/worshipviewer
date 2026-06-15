/**
 * Offline logout: wipe locally first; retry server `POST /auth/logout` when online (minimal queue).
 */
import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { getLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/browser-storage'
import { clearAllLocalData } from '@/lib/clear-local'

const STORAGE_KEY = 'wv_pending_server_logout'

function hasPending(): boolean {
  return safeGetItem(STORAGE_KEY, getLocalStorage()) === '1'
}

function setPending(on: boolean): void {
  if (on) safeSetItem(STORAGE_KEY, '1', getLocalStorage())
  else safeRemoveItem(STORAGE_KEY, getLocalStorage())
}

async function tryServerLogout(): Promise<boolean> {
  if (typeof globalThis.navigator !== 'undefined' && !globalThis.navigator.onLine) return false
  const { response } = await api.POST('/auth/logout', {})
  return response.ok || response.status === 204 || response.status === 401
}

export function initLogoutQueue(): void {
  const flush = async () => {
    if (!hasPending()) return
    if (typeof globalThis.navigator !== 'undefined' && !globalThis.navigator.onLine) return
    const ok = await tryServerLogout()
    if (ok) setPending(false)
  }

  void flush()
  globalThis.addEventListener?.('online', () => {
    void flush()
  })
}

/** Call when user chooses logout: POST if online, else mark pending for flush when back online. */
export async function performLogout(queryClient: QueryClient): Promise<void> {
  if (typeof globalThis.navigator === 'undefined' || globalThis.navigator.onLine) {
    await api.POST('/auth/logout', {})
    setPending(false)
  } else {
    setPending(true)
  }
  await clearAllLocalData(queryClient)
}
