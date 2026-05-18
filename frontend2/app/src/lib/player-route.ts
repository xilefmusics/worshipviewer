import type { HubEntity } from '@/lib/hub-entity'

export type PlayerEntityType = 'collection' | 'song' | 'setlist'

export function hubEntityToPlayerType(entity: HubEntity): PlayerEntityType {
  if (entity === 'collections') return 'collection'
  if (entity === 'songs') return 'song'
  return 'setlist'
}

/** Search params for `/player` route. */
export function buildPlayerSearchParams(
  type: PlayerEntityType,
  id: string,
): Record<string, string> {
  return { type, id }
}
