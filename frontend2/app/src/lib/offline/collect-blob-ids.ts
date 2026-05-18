import type { components } from '@/api/schema'

type Player = components['schemas']['Player']

/** Blob ids referenced by a setlist player payload (items + embedded song assets). */
export function collectBlobIdsFromPlayer(player: Player): string[] {
  const set = new Set<string>()
  for (const item of player.items) {
    if (item.type === 'blob') {
      set.add(item.blob_id)
    } else {
      for (const link of item.song.blobs) {
        set.add(link.id)
      }
    }
  }
  return [...set]
}
