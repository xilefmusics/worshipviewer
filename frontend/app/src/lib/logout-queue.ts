/**
 * Offline logout: wipe locally first; retry server `POST /auth/logout` when online (minimal queue).
 */
import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { clearAllLocalData } from '@/lib/clear-local'

const STORAGE_KEY = 'wv_pending_server_logout'

function hasPending(): boolean {
  return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
}

function setPending(on: boolean): void {
  if (on) globalThis.localStorage?.setItem(STORAGE_KEY, '1')
  else globalThis.localStorage?.removeItem(STORAGE_KEY)
}

async function tryServerLogout(): Promise<boolean> {
  if (!globalThis.navigator.onLine) return false
  const { response } = await api.POST('/auth/logout', {})
  return response.ok || response.status === 204 || response.status === 401
}

export function initLogoutQueue(): void {
  const flush = async () => {
    if (!hasPending() || !globalThis.navigator.onLine) return
    const ok = await tryServerLogout()
    if (ok) setPending(false)
  }

  void flush()
  globalThis.addEventListener('online', () => {
    void flush()
  })
}

/** Call when user chooses logout: POST if online, else mark pending for flush when back online. */
export async function performLogout(queryClient: QueryClient): Promise<void> {
  if (globalThis.navigator.onLine) {
    await api.POST('/auth/logout', {})
    setPending(false)
  } else {
    setPending(true)
  }
  await clearAllLocalData(queryClient)
}
