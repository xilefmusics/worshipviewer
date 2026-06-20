import type { components } from '@/api/schema'

import { applyTocMetadataFilters, type TocSongMetadata } from '@/lib/player/toc-filters'
import { languageIndexForSongLink, songTitleVariantsForDisplay } from '@/lib/setlist-song-links'

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

function titleAtLanguageIndex(
  data: Record<string, unknown> | undefined | null,
  languageIndex: number,
): string | null {
  const titles = Array.isArray(data?.titles) ? data.titles : []
  const value = titles[languageIndex]
  if (typeof value !== 'string') return null
  const title = value.trim()
  return title.length > 0 ? title : null
}

function displayEntryForRow(row: TocItem, items: PlayerItem[], showNumber: boolean): TocDisplayEntry {
  const item = items[row.idx]
  const languageIndex =
    item?.type === 'chords'
      ? languageIndexForSongLink(item.song.data as Record<string, unknown>, item.language) ?? 0
      : null

  return {
    key: displayEntryKey(row.idx, languageIndex, row.id ?? undefined),
    sourceIdx: row.idx,
    title: row.title,
    languageIndex,
    liked: row.liked,
    showNumber,
  }
}

function strictEntryForLanguageId(
  row: TocItem,
  items: PlayerItem[],
  languageId: string,
): TocDisplayEntry | null {
  const item = items[row.idx]
  if (item?.type !== 'chords') return null

  const languageIndex = languageIndexForSongLink(item.song.data as Record<string, unknown>, languageId)
  if (languageIndex == null) return null

  const title = titleAtLanguageIndex(item.song.data as Record<string, unknown>, languageIndex)
  if (!title) return null

  return {
    key: displayEntryKey(row.idx, languageIndex, row.id ?? undefined),
    sourceIdx: row.idx,
    title,
    languageIndex,
    liked: row.liked,
    showNumber: true,
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
  const showNumber = mode === 'order' || !multilingualToc

  if (item?.type === 'blob') {
    return [displayEntryForRow(row, items, showNumber)]
  }

  if (multilingualToc && languageId) {
    const strictEntry = strictEntryForLanguageId(row, items, languageId)
    return strictEntry ? [{ ...strictEntry, showNumber: mode === 'order' }] : []
  }

  if (multilingualToc && item?.type === 'chords' && mode !== 'order') {
    const variants = songTitleVariantsForDisplay(item.song.data as Record<string, unknown>, row.title)
    return variants.map((variant) => ({
      key: displayEntryKey(row.idx, variant.languageIndex, row.id ?? undefined),
      sourceIdx: row.idx,
      title: variant.title,
      languageIndex: variant.languageIndex,
      liked: row.liked,
      showNumber: false,
    }))
  }

  return [displayEntryForRow(row, items, showNumber)]
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
      .flatMap((row) =>
        displayEntriesForRow(
          row,
          metadataFilters.items,
          metadataFilters.multilingualToc,
          languageId,
          mode,
        ),
      )
      .map((entry) => ({
        ...entry,
        showNumber: metadataFilters.multilingualToc ? false : entry.showNumber,
      }))
  }

  if (mode === 'alphabetical') {
    const entries = rows.flatMap((row) =>
      displayEntriesForRow(
        row,
        metadataFilters.items,
        metadataFilters.multilingualToc,
        languageId,
        mode,
      ),
    )
    entries.sort(compareDisplayEntries)
    return metadataFilters.multilingualToc
      ? entries.map((entry) => ({ ...entry, showNumber: false }))
      : entries
  }

  return rows.flatMap((row) =>
    displayEntriesForRow(
      row,
      metadataFilters.items,
      metadataFilters.multilingualToc,
      languageId,
      mode,
    ),
  )
}
