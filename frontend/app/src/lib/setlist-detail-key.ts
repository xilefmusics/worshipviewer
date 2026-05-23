import type { PlayerEntityType } from '@/lib/player-route'

/** Root key for `/player` payload queries (`['player', type, id]`). */
export function playerQueriesRootKey() {
  return ['player'] as const
}

export function playerQueryKey(type: PlayerEntityType, id: string) {
  return [...playerQueriesRootKey(), type, id] as const
}

export function setlistDetailKey(id: string) {
  return ['setlistDetail', id] as const
}

/** Player chrome title only — must not share keys with full detail queries. */
export function playerResourceTitleKey(type: PlayerEntityType, id: string) {
  return ['player', 'resourceTitle', type, id] as const
}

export function collectionDetailKey(id: string) {
  return ['collectionDetail', id] as const
}

/** Canonical React Query key for `GET /api/v1/songs/{id}` (setlist rows, detail views, etc.). */
export function songDetailQueryKey(id: string) {
  return ['song', 'detail', id] as const
}

