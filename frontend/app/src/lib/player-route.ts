import type { HubEntity } from '@/lib/hub-entity'
import type { PlayerMode } from '@/lib/player/player-mode'

export type PlayerEntityType = 'collection' | 'song' | 'setlist'

export function hubEntityToPlayerType(entity: HubEntity): PlayerEntityType {
  if (entity === 'collections') return 'collection'
  if (entity === 'songs') return 'song'
  return 'setlist'
}

/** Search params for `/player` route. */
export function buildPlayerSearch(
  type: PlayerEntityType,
  id: string,
  index?: number,
  mode?: PlayerMode,
): {
  type: PlayerEntityType
  id: string
  index: number | undefined
  mode: PlayerMode | undefined
} {
  return { type, id, index, mode }
}

/** @deprecated Prefer {@link buildPlayerSearch} for typed TanStack Router search. */
export function buildPlayerSearchParams(
  type: PlayerEntityType,
  id: string,
): Record<string, string> {
  return { type, id }
}
