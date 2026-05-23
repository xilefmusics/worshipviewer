import type { components } from '@/api/schema'

import { applyTocMetadataFilters, type TocSongMetadata } from '@/lib/player/toc-filters'

type TocItem = components['schemas']['TocItem']

export type TocDisplayMode = 'order' | 'alphabetical' | 'liked'

/** Display number for a TOC row; falls back to 1-based position in the source list. */
export function tocDisplayNr(toc: TocItem[], row: TocItem): string {
  const nr = row.nr.trim()
  if (nr) return nr
  const orderIndex = toc.findIndex((entry) => entry.idx === row.idx)
  return String(orderIndex >= 0 ? orderIndex + 1 : row.idx + 1)
}

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
