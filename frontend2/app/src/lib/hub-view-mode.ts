import type { HubEntity } from '@/lib/hub-entity'

export type HubViewMode = 'list' | 'card'

/** Fixed layout per hub: collections use cards (A4-style); songs and setlists use rows. */
export function getDefaultViewMode(entity: HubEntity): HubViewMode {
  return entity === 'collections' ? 'card' : 'list'
}
