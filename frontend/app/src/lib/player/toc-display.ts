import type { components } from '@/api/schema'

import { applyTocMetadataFilters, type TocSongMetadata } from '@/lib/player/toc-filters'
import {
  languageIndexForSongLink,
  songTitleForLanguage,
  songTitleVariantsForDisplay,
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
  override?: {
    title: string
    languageIndex: number | null
    showNumber?: boolean
  },
): TocDisplayEntry {
  const item = items[row.idx]
  const sourceIdx = row.idx
  const liked = row.liked
  const showNumber = override?.showNumber ?? true

  if (override) {
    return {
      key: displayEntryKey(sourceIdx, override.languageIndex, row.id ?? undefined),
      sourceIdx,
      title: override.title,
      languageIndex: override.languageIndex,
      liked,
      showNumber,
    }
  }

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

function compareDisplayEntries(a: TocDisplayEntry, b: TocDisplayEntry): number {
  const titleCompare = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  if (titleCompare !== 0) return titleCompare
  if (a.sourceIdx !== b.sourceIdx) return a.sourceIdx - b.sourceIdx
  const aLanguageIndex = a.languageIndex ?? -1
  const bLanguageIndex = b.languageIndex ?? -1
  if (aLanguageIndex !== bLanguageIndex) return aLanguageIndex - bLanguageIndex
  return a.key.localeCompare(b.key)
}

function displayEntriesForRow(
  row: TocItem,
  items: PlayerItem[],
  multilingualToc: boolean,
  languageId: string | undefined,
  mode: TocDisplayMode,
): TocDisplayEntry[] {
  const item = items[row.idx]
  if (mode === 'alphabetical' && multilingualToc && !languageId && item?.type === 'chords') {
    const variants = songTitleVariantsForDisplay(item.song.data as Record<string, unknown>, row.title)
    if (variants.length > 1) {
      return variants.map((variant) =>
        displayEntryForRow(row, items, multilingualToc, languageId, {
          title: variant.title,
          languageIndex: variant.languageIndex,
          showNumber: false,
        }),
      )
    }
    const variant = variants[0]
    return [
      displayEntryForRow(row, items, multilingualToc, languageId, {
        title: variant?.title ?? row.title,
        languageIndex: variant?.languageIndex ?? 0,
        showNumber: false,
      }),
    ]
  }
  if (mode === 'alphabetical' && multilingualToc && item?.type === 'chords') {
    const baseEntry = displayEntryForRow(row, items, multilingualToc, languageId)
    return [
      displayEntryForRow(row, items, multilingualToc, languageId, {
        title: baseEntry.title,
        languageIndex: baseEntry.languageIndex,
        showNumber: false,
      }),
    ]
  }
  return [displayEntryForRow(row, items, multilingualToc, languageId)]
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
    const entries = rows
      .flatMap((row) =>
        displayEntriesForRow(
          row,
          metadataFilters.items,
          metadataFilters.multilingualToc,
          languageId,
          mode,
        ),
      )
      .sort(compareDisplayEntries)
    return metadataFilters.multilingualToc
      ? entries.map((entry) => ({ ...entry, showNumber: false }))
      : entries
  }

  return rows.map((row) =>
    displayEntryForRow(row, metadataFilters.items, metadataFilters.multilingualToc, languageId),
  )
}
