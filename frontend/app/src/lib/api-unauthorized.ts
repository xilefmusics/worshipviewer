import type { QueryClient } from '@tanstack/react-query'

import { clearAllLocalData } from '@/lib/clear-local'
import { sanitizeAppRedirect } from '@/lib/returnTo'

/**
 * 401 from API while browsing: wipe local session state and hard-navigate to login.
 * (Same cleanup as logout; avoids relying on router instance inside query functions.)
 */
export async function redirectToLoginAfterUnauthorized(queryClient: QueryClient): Promise<void> {
  await clearAllLocalData(queryClient)
  if (typeof globalThis.window === 'undefined') return
  const returnTo = sanitizeAppRedirect(
    globalThis.window.location.pathname + globalThis.window.location.search,
    '/',
  )
  const qs = new URLSearchParams({ return_to: returnTo })
  globalThis.window.location.assign(`/login?${qs.toString()}`)
}
