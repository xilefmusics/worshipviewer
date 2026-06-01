import { useEffect, useState } from 'react'

import { isPlayerMirrored } from '@/lib/offline/player-mirror-cache'
import type { PlayerEntityType } from '@/lib/player-route'

/** Whether a player mirror exists locally for the given entity. */
export function useIsPlayerCached(entityType: PlayerEntityType, entityId: string): boolean {
  const [cached, setCached] = useState(false)

  useEffect(() => {
    let cancelled = false
    void isPlayerMirrored(entityType, entityId).then((v) => {
      if (!cancelled) setCached(v)
    })
    return () => {
      cancelled = true
    }
  }, [entityType, entityId])

  return cached
}
