import { useEffect, useState } from 'react'

import type { HubEntity } from '@/lib/hub-entity'
import { readHubListsUpdatedAt } from '@/lib/query-persistence'

/** Last hub-list persist timestamp — only fetched while offline. */
export function useHubListsUpdatedAt(
  offline: boolean,
  entity: HubEntity,
  hasListData: boolean,
): string | null {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!offline) return
    void readHubListsUpdatedAt().then(setUpdatedAt)
  }, [offline, entity, hasListData])

  if (!offline) return null
  return updatedAt
}
