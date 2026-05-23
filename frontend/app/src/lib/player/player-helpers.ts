import type { components } from '@/api/schema'

import { resolveSongDataKey } from '@/lib/setlist-song-links'

type PlayerItem = components['schemas']['PlayerItem']
type TocItem = components['schemas']['TocItem']

export function itemTypeAt(items: PlayerItem[], index: number): 'blob' | 'chords' {
  const item = items[index]
  if (!item) return 'chords'
  return item.type === 'blob' ? 'blob' : 'chords'
}

export function tocEntryForIndex(toc: TocItem[], index: number): TocItem | undefined {
  return toc.find((row) => row.idx === index)
}

export function hasChordsItems(items: PlayerItem[]): boolean {
  return items.some((item) => item.type === 'chords')
}

/** Resolve display key for a chords item at `itemIndex`. */
export function resolvePlayerItemKey(
  item: Extract<PlayerItem, { type: 'chords' }>,
  playerType: 'collection' | 'song' | 'setlist',
  slotKey: string | null | undefined,
  localOverride: string | null | undefined,
): string | null {
  if (localOverride) return localOverride
  if (playerType === 'setlist' && slotKey) return slotKey
  return resolveSongDataKey(item.song.data as Record<string, unknown>)
}
