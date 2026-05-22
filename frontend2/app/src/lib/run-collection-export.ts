import type { QueryClient } from '@tanstack/react-query'

import { fetchCollectionDetail } from '@/api/collections-detail'
import type { ChordFormatPreference } from '@/lib/chord-format'
import { runOrderedSongsPdfExport } from '@/lib/hydrate-songs-for-pdf-export'
import { normalizeSongLinksForCollectionEditor } from '@/lib/setlist-song-links'

export async function runCollectionPdfExport(
  queryClient: QueryClient,
  collectionId: string,
  chordFormat: ChordFormatPreference,
): Promise<void> {
  const detail = await fetchCollectionDetail(queryClient, { id: collectionId })
  const links = normalizeSongLinksForCollectionEditor(detail.songs)
  await runOrderedSongsPdfExport(queryClient, detail.title, links, chordFormat)
}
