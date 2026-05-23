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

const dexieKvStorage: AsyncStorage<string> = {
  getItem: (key: string) => appDb.kv.get(key).then((row) => row?.value ?? null),
  setItem: (key: string, value: string) => appDb.kv.put({ key, value }),
  removeItem: (key: string) => appDb.kv.delete(key),
}

export function createHubListsQueryPersister() {
  return createAsyncStoragePersister({
    storage: dexieKvStorage,
    key: HUB_LISTS_STORAGE_KEY,
  })
}

export function shouldDehydrateHubListQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && isHubListQueryKey(query.queryKey)
}

export const hubListsDehydrateOptions: DehydrateOptions = {
  shouldDehydrateQuery: shouldDehydrateHubListQuery,
  shouldDehydrateMutation: () => false,
}
