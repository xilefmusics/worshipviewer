import type { RoomSourceType } from '@/lib/room'
import type { HubEntity } from '@/lib/hub-entity'

export function roomSourceType(entity: HubEntity): RoomSourceType {
  switch (entity) {
    case 'collections':
      return 'collection'
    case 'songs':
      return 'song'
    case 'setlists':
      return 'setlist'
  }
}
