import type { HubEntity } from '@/lib/hub-entity'

export const hubListRootKey = ['hubLists'] as const

export function hubListKey(entity: HubEntity, q: string, teamId?: string | null) {
  return [...hubListRootKey, entity, q, teamId ?? null] as const
}

/** True for collections, songs, and setlists list query keys. */
export function isHubListQueryKey(queryKey: unknown): boolean {
  return Array.isArray(queryKey) && queryKey[0] === hubListRootKey[0]
}
