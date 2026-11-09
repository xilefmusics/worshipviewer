import type { components } from '@/api/schema'

import { resolveSongDataKey } from '@/lib/setlist-song-links'

type PlayerItem = components['schemas']['PlayerItem']
type TocItem = components['schemas']['TocItem']

export function itemTypeAt(items: PlayerItem[], index: number): 'blob' | 'chords' {
  const item = items[index]
  if (!item) return 'chords'
  return item.type === 'chords' ? 'chords' : 'blob'
}

export function tocEntryForIndex(toc: TocItem[], index: number): TocItem | undefined {
  return toc.find((row) => row.idx === index)
}

/** Resolve the owning TOC slot for a flattened player item, including later sheet pages. */
export function tocSlotEntryForIndex(toc: TocItem[], index: number): TocItem | undefined {
  let match: TocItem | undefined
  for (const row of toc) {
    if (row.idx > index) continue
    if (!match || row.idx >= match.idx) match = row
  }
  return match
}

export function hasChordsItems(items: PlayerItem[]): boolean {
  return items.some((item) => item.type === 'chords')
}

/** Resolve display key for a chords item at `itemIndex`. */
export function resolvePlayerItemKey(
  item: Extract<PlayerItem, { type: 'chords' }>,
  playerType: 'collection' | 'song' | 'setlist' | 'library',
  slotKey: string | null | undefined,
  localOverride: string | null | undefined,
): string | null {
  if (localOverride) return localOverride
  if (playerType === 'setlist' && slotKey) return slotKey
  return resolveSongDataKey(item.song.data as Record<string, unknown>)
}
