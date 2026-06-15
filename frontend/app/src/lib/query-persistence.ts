import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import {
  defaultShouldDehydrateQuery,
  type DehydrateOptions,
  type Query,
} from '@tanstack/query-core'
import type { AsyncStorage } from '@tanstack/query-persist-client-core'

import { appDb } from '@/lib/dexie-db'
import { isHubListQueryKey } from '@/lib/hub-list-keys'

/** Buster: bump to invalidate on-disk hub list cache shape / semantics. */
export const HUB_LISTS_PERSIST_BUSTER = 'hub-lists-v1'

/** Storage key for the single dehydrated `PersistedClient` blob in Dexie `kv`. */
export const HUB_LISTS_STORAGE_KEY = 'tanstack-query-hub-lists'

/** ISO timestamp written when hub lists are persisted to Dexie. */
export const HUB_LISTS_UPDATED_AT_KEY = 'tanstack-query-hub-lists-updated-at'

const dexieKvStorage: AsyncStorage<string> = {
  getItem: async (key: string) => {
    try {
      const row = await appDb.kv.get(key)
      return row?.value ?? null
    } catch {
      return null
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await appDb.kv.put({ key, value })
    } catch {
      /* Persistence is best-effort; online usage must continue without IndexedDB. */
    }
  },
  removeItem: async (key: string) => {
    try {
      await appDb.kv.delete(key)
    } catch {
      /* Persistence is best-effort; online usage must continue without IndexedDB. */
    }
  },
}

const hubListsStorage: AsyncStorage<string> = {
  getItem: (key: string) => dexieKvStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    await dexieKvStorage.setItem(key, value)
    if (key === HUB_LISTS_STORAGE_KEY) {
      await dexieKvStorage.setItem(HUB_LISTS_UPDATED_AT_KEY, new Date().toISOString())
    }
  },
  removeItem: (key: string) => dexieKvStorage.removeItem(key),
}

export function createHubListsQueryPersister() {
  return createAsyncStoragePersister({
    storage: hubListsStorage,
    key: HUB_LISTS_STORAGE_KEY,
  })
}

export async function readHubListsUpdatedAt(): Promise<string | null> {
  const value = await dexieKvStorage.getItem(HUB_LISTS_UPDATED_AT_KEY)
  return value ?? null
}

export function shouldDehydrateHubListQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && isHubListQueryKey(query.queryKey)
}

export const hubListsDehydrateOptions: DehydrateOptions = {
  shouldDehydrateQuery: shouldDehydrateHubListQuery,
  shouldDehydrateMutation: () => false,
}
