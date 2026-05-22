import type { QueryClient } from '@tanstack/react-query'

import { fetchSetlistDetail, fetchSongForHubSlot } from '@/api/setlists-detail'
import { getChordEngine } from '@/lib/chord-engine'
import type { ChordFormatPreference } from '@/lib/chord-format'
import { exportSetlistPdf, type SetlistPdfExportSong } from '@/lib/song-import-export'
import {
  coerceMusicalKeyString,
  normalizeSongLinksForEditor,
  resolveSongDataKey,
} from '@/lib/setlist-song-links'
import type { ChordSongData } from '@/ports/chord-engine'

export async function runSetlistPdfExport(
  queryClient: QueryClient,
  setlistId: string,
  chordFormat: ChordFormatPreference,
): Promise<void> {
  const detail = await fetchSetlistDetail(queryClient, { id: setlistId })
  const links = normalizeSongLinksForEditor(detail.songs)

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

  const songs = hydrated.filter((row): row is SetlistPdfExportSong => row != null)
  const engine = await getChordEngine()
  await exportSetlistPdf(engine, detail.title, songs, chordFormat)
}
