import type { components } from '@/api/schema'

import { playerMirrorId } from '@/lib/dexie-db'
import { evictOnePlayerMirror } from '@/lib/offline/player-mirror-cache'
import { appDb } from '@/lib/dexie-db'
import type { PlayerEntityType } from '@/lib/player-route'

type Player = components['schemas']['Player']

export const SETLIST_DELETED_EVENT = 'wv-setlist-deleted-reconciled'

export type PlayerDeletedReconcileResult =
  | { kind: 'none' }
  | { kind: 'reconciled'; player: Player; entityType: PlayerEntityType; entityId: string }

/** @deprecated */
export type SetlistDeletedReconcileResult =
  | { kind: 'none' }
  | { kind: 'reconciled'; player: Player; setlistId: string }

/**
 * When the network returns 404 but a local mirror exists, play the cached snapshot once
 * and clear the mirror.
 */
export async function reconcilePlayer404(
  entityType: PlayerEntityType,
  entityId: string,
  status: number,
): Promise<PlayerDeletedReconcileResult> {
  if (status !== 404) return { kind: 'none' }

  const row = await appDb.playerMirror.get(playerMirrorId(entityType, entityId))
  if (!row) return { kind: 'none' }

  let player: Player
  try {
    player = JSON.parse(row.playerJson) as Player
  } catch {
    await evictOnePlayerMirror(row.id)
    return { kind: 'none' }
  }

  await evictOnePlayerMirror(row.id)

  if (entityType === 'setlist' && typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(SETLIST_DELETED_EVENT, { detail: { setlistId: entityId } }),
    )
  }

  return { kind: 'reconciled', player, entityType, entityId }
}

/** @deprecated Use reconcilePlayer404 */
export async function reconcileSetlistPlayer404(
  setlistId: string,
  status: number,
): Promise<SetlistDeletedReconcileResult> {
  const res = await reconcilePlayer404('setlist', setlistId, status)
  if (res.kind === 'none') return { kind: 'none' }
  return { kind: 'reconciled', player: res.player, setlistId: res.entityId }
}
