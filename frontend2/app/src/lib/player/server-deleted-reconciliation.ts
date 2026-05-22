import type { components } from '@/api/schema'

import { evictOneSetlistMirror } from '@/lib/offline/setlist-player-cache'
import { appDb } from '@/lib/dexie-db'

type Player = components['schemas']['Player']

export const SETLIST_DELETED_EVENT = 'wv-setlist-deleted-reconciled'

export type SetlistDeletedReconcileResult =
  | { kind: 'none' }
  | { kind: 'reconciled'; player: Player; setlistId: string }

/**
 * When the network returns 404 but a local mirror exists, play the cached snapshot once
 * and clear the mirror.
 */
export async function reconcileSetlistPlayer404(
  setlistId: string,
  status: number,
): Promise<SetlistDeletedReconcileResult> {
  if (status !== 404) return { kind: 'none' }

  const row = await appDb.setlistPlayerMirror.get(setlistId)
  if (!row) return { kind: 'none' }

  let player: Player
  try {
    player = JSON.parse(row.playerJson) as Player
  } catch {
    await evictOneSetlistMirror(setlistId)
    return { kind: 'none' }
  }

  await evictOneSetlistMirror(setlistId)

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(SETLIST_DELETED_EVENT, { detail: { setlistId } }),
    )
  }

  return { kind: 'reconciled', player, setlistId }
}
