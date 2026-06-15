import type { QueryClient } from '@tanstack/react-query'

import { fetchCollectionDetail } from '@/api/collections-detail'
import type { ChordFormatPreference } from '@/lib/chord-format'
import {
  runOrderedSongsPdfExport,
  runOrderedSongsZipExport,
} from '@/lib/hydrate-hub-song-links'
import type { TextExportFormat } from '@/lib/song-import-export'
import { normalizeSongLinksForCollectionEditor } from '@/lib/setlist-song-links'

export type CollectionExportKind = TextExportFormat | 'pdf'

export async function runCollectionExport(
  queryClient: QueryClient,
  collectionId: string,
  kind: CollectionExportKind,
  chordFormat: ChordFormatPreference,
  hideChords?: boolean,
): Promise<void> {
  const detail = await fetchCollectionDetail(queryClient, { id: collectionId })
  const links = normalizeSongLinksForCollectionEditor(detail.songs)
  if (kind === 'pdf') {
    await runOrderedSongsPdfExport(queryClient, detail.title, links, chordFormat, hideChords)
    return
  }
  await runOrderedSongsZipExport(queryClient, detail.title, links, kind, chordFormat, hideChords)
}

/** @deprecated Use {@link runCollectionExport}. */
export async function runCollectionPdfExport(
  queryClient: QueryClient,
  collectionId: string,
  chordFormat: ChordFormatPreference,
): Promise<void> {
  await runCollectionExport(queryClient, collectionId, 'pdf', chordFormat)
}
