import type { components } from '@/api/schema'

import { applyTocMetadataFilters, type TocSongMetadata } from '@/lib/player/toc-filters'

type TocItem = components['schemas']['TocItem']

export type TocDisplayMode = 'order' | 'alphabetical' | 'liked'

export type TocMetadataFilters = {
  metadataBySongId: Map<string, TocSongMetadata>
  activeLanguageIds: ReadonlySet<string>
  activeTagIds: ReadonlySet<string>
}

export function displayTocEntries(
  toc: TocItem[],
  mode: TocDisplayMode,
  metadataFilters?: TocMetadataFilters & { items: components['schemas']['PlayerItem'][] },
): TocItem[] {
  let rows = metadataFilters
    ? applyTocMetadataFilters(
        toc,
        metadataFilters.items,
        metadataFilters.metadataBySongId,
        metadataFilters.activeLanguageIds,
        metadataFilters.activeTagIds,
      )
    : toc

  if (mode === 'liked') {
    rows = rows.filter((row) => row.liked)
  } else if (mode === 'alphabetical') {
    rows = [...rows].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    )
  }
  return rows
}
