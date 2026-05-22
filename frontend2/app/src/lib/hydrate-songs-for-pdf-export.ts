import type { QueryClient } from '@tanstack/react-query'

import { fetchSongForHubSlot } from '@/api/setlists-detail'
import { getChordEngine } from '@/lib/chord-engine'
import type { ChordFormatPreference } from '@/lib/chord-format'
import { exportSetlistPdf, type SetlistPdfExportSong } from '@/lib/song-import-export'
import { coerceMusicalKeyString, resolveSongDataKey } from '@/lib/setlist-song-links'
import type { ChordSongData } from '@/ports/chord-engine'

export type PdfExportSongLink = { id: string; key?: unknown }

export async function hydrateSongLinksForPdfExport(
  queryClient: QueryClient,
  links: PdfExportSongLink[],
): Promise<SetlistPdfExportSong[]> {
  const hydrated = await Promise.all(
    links.map(async (link) => {
      const song = await fetchSongForHubSlot(queryClient, { id: link.id })
      if (!song || song.not_a_song) return null
      const data = song.data as ChordSongData
      const key =
        coerceMusicalKeyString(link.key) ??
        resolveSongDataKey(data as Record<string, unknown>) ??
        undefined
      return { data, key } satisfies SetlistPdfExportSong
    }),
  )
  return hydrated.filter((row): row is SetlistPdfExportSong => row != null)
}

export async function runOrderedSongsPdfExport(
  queryClient: QueryClient,
  title: string,
  links: PdfExportSongLink[],
  chordFormat: ChordFormatPreference,
): Promise<void> {
  const songs = await hydrateSongLinksForPdfExport(queryClient, links)
  const engine = await getChordEngine()
  await exportSetlistPdf(engine, title, songs, chordFormat)
}
