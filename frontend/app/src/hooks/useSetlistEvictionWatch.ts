import { useEffect, useState } from 'react'

import { appDb, playerMirrorId } from '@/lib/dexie-db'

/** Detect when the active setlist mirror was evicted while the player is open. */
export function useSetlistEvictionWatch(setlistId: string | undefined, enabled: boolean): boolean {
  const [evicted, setEvicted] = useState(false)

  useEffect(() => {
    if (!enabled || !setlistId) return

    let alive = true

    const check = async () => {
      const row = await appDb.playerMirror.get(playerMirrorId('setlist', setlistId))
      if (!alive) return
      if (!row) setEvicted(true)
    }

    void check()
    const interval = window.setInterval(() => void check(), 2000)
    return () => {
      alive = false
      window.clearInterval(interval)
    }
  }, [setlistId, enabled])

  return evicted
}
