import type { QueryClient } from '@tanstack/react-query'

import { appDb } from '@/lib/dexie-db'

/**
 * TanStack Query cache + Dexie wipe — same as full logout / 401 invalidation (see repo docs api-integration.md).
 * Does not clear i18n / locale preferences.
 */
export async function clearAllLocalData(queryClient: QueryClient): Promise<void> {
  queryClient.clear()
  await appDb.delete()
  await appDb.open()
}
