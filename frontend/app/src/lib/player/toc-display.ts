import type { components } from '@/api/schema'

import { applyTocMetadataFilters, type TocSongMetadata } from '@/lib/player/toc-filters'
import {
  languageIndexForSongLink,
  songTitleForLanguage,
} from '@/lib/setlist-song-links'

type PlayerItem = components['schemas']['PlayerItem']
type TocItem = components['schemas']['TocItem']

export type TocDisplayMode = 'order' | 'alphabetical' | 'liked'

export type TocDisplayEntry = {
  key: string
  sourceIdx: number
  title: string
  languageIndex: number | null
  liked: boolean
  showNumber: boolean
}

/** Display number for a TOC row; falls back to 1-based position in the source list. */
export function tocDisplayNr(toc: TocItem[], rowOrSourceIdx: TocItem | number): string {
  const sourceIdx = typeof rowOrSourceIdx === 'number' ? rowOrSourceIdx : rowOrSourceIdx.idx
  const row =
    typeof rowOrSourceIdx === 'number'
      ? toc.find((entry) => entry.idx === sourceIdx)
      : rowOrSourceIdx
  const nr = row?.nr.trim() ?? ''
  if (nr) return nr
  const orderIndex = toc.findIndex((entry) => entry.idx === sourceIdx)
  return String(orderIndex >= 0 ? orderIndex + 1 : sourceIdx + 1)
}

export type TocMetadataFilters = {
  metadataBySongId: Map<string, TocSongMetadata>
  activeLanguageIds: ReadonlySet<string>
  activeTagIds: ReadonlySet<string>
}

export type TocDisplayFilters = TocMetadataFilters & {
  items: PlayerItem[]
  multilingualToc: boolean
}

function firstLanguageId(ids: ReadonlySet<string>): string | undefined {
  for (const id of ids) return id
  return undefined
}

function displayEntryKey(sourceIdx: number, languageIndex: number | null, rowId?: string): string {
  return [rowId ?? 'toc', sourceIdx, languageIndex ?? 'slot'].join(':')
}

function resolveDisplayLanguageId(filters: TocDisplayFilters): string | undefined {
  if (!filters.multilingualToc) return undefined
  return firstLanguageId(filters.activeLanguageIds)
}

function displayEntryForRow(
  row: TocItem,
  items: PlayerItem[],
  multilingualToc: boolean,
  languageId: string | undefined,
): TocDisplayEntry {
  const item = items[row.idx]
  const sourceIdx = row.idx
  const liked = row.liked
  const showNumber = true

  if (multilingualToc && item?.type === 'chords' && languageId) {
    const languageIndex = languageIndexForSongLink(item.song.data as Record<string, unknown>, languageId)
    return {
      key: displayEntryKey(sourceIdx, languageIndex ?? null, row.id ?? undefined),
      sourceIdx,
      title: songTitleForLanguage(item.song.data as Record<string, unknown>, languageId, row.title),
      languageIndex: languageIndex ?? 0,
      liked,
      showNumber,
    }
  }

  const languageIndex =
    item?.type === 'chords'
      ? languageIndexForSongLink(item.song.data as Record<string, unknown>, item.language) ?? 0
      : null

  return {
    key: displayEntryKey(sourceIdx, languageIndex, row.id ?? undefined),
    sourceIdx,
    title: row.title,
    languageIndex,
    liked,
    showNumber,
  }
}

export function displayTocEntries(
  toc: TocItem[],
  mode: TocDisplayMode,
  metadataFilters?: TocDisplayFilters,
): TocDisplayEntry[] {
  if (!metadataFilters) {
    return toc.map((row) => ({
      key: displayEntryKey(row.idx, null, row.id ?? undefined),
      sourceIdx: row.idx,
      title: row.title,
      languageIndex: null,
      liked: row.liked,
      showNumber: true,
    }))
  }

  const languageId = resolveDisplayLanguageId(metadataFilters)
  const effectiveLanguageIds =
    metadataFilters.multilingualToc && languageId
      ? new Set([languageId])
      : metadataFilters.activeLanguageIds

  const rows = applyTocMetadataFilters(
    toc,
    metadataFilters.items,
    metadataFilters.metadataBySongId,
    effectiveLanguageIds,
    metadataFilters.activeTagIds,
  )

  if (mode === 'liked') {
    return rows
      .filter((row) => row.liked)
      .map((row) =>
        displayEntryForRow(row, metadataFilters.items, metadataFilters.multilingualToc, languageId),
      )
  }

  if (mode === 'alphabetical') {
    return [...rows]
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
      .map((row) =>
        displayEntryForRow(row, metadataFilters.items, metadataFilters.multilingualToc, languageId),
      )
  }

  return rows.map((row) =>
    displayEntryForRow(row, metadataFilters.items, metadataFilters.multilingualToc, languageId),
  )
}
