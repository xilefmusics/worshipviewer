import type { QueryClient } from '@tanstack/react-query'

import { fetchSetlistDetail } from '@/api/setlists-detail'
import type { ChordFormatPreference } from '@/lib/chord-format'
import {
  runOrderedSongsPdfExport,
  runOrderedSongsZipExport,
} from '@/lib/hydrate-hub-song-links'
import type { TextExportFormat } from '@/lib/song-import-export'
import { normalizeSongLinksForEditor } from '@/lib/setlist-song-links'

export type SetlistExportKind = TextExportFormat | 'pdf'

export async function runSetlistExport(
  queryClient: QueryClient,
  setlistId: string,
  kind: SetlistExportKind,
  chordFormat: ChordFormatPreference,
): Promise<void> {
  const detail = await fetchSetlistDetail(queryClient, { id: setlistId })
  const links = normalizeSongLinksForEditor(detail.songs)
  if (kind === 'pdf') {
    await runOrderedSongsPdfExport(queryClient, detail.title, links, chordFormat)
    return
  }
  await runOrderedSongsZipExport(queryClient, detail.title, links, kind, chordFormat)
}

/** @deprecated Use {@link runSetlistExport}. */
export async function runSetlistPdfExport(
  queryClient: QueryClient,
  setlistId: string,
  chordFormat: ChordFormatPreference,
): Promise<void> {
  await runSetlistExport(queryClient, setlistId, 'pdf', chordFormat)
}
