import type { HubEntity } from '@/lib/hub-entity'

export const hubListRootKey = ['hubLists'] as const

export function hubListKey(entity: HubEntity, q: string) {
  return [...hubListRootKey, entity, q] as const
}

/** True for collections, songs, and setlists list query keys. */
export function isHubListQueryKey(queryKey: unknown): boolean {
  return Array.isArray(queryKey) && queryKey[0] === hubListRootKey[0]
}
