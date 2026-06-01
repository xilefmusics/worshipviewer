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
  getItem: (key: string) => appDb.kv.get(key).then((row) => row?.value ?? null),
  setItem: (key: string, value: string) => appDb.kv.put({ key, value }),
  removeItem: (key: string) => appDb.kv.delete(key),
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
