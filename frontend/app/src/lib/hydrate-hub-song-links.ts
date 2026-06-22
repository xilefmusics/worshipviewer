import type { QueryClient } from '@tanstack/react-query'

import { fetchSongForHubSlot } from '@/api/setlists-detail'
import { getChordEngine } from '@/lib/chord-engine'
import type { ChordFormatPreference } from '@/lib/chord-format'
import { applyFlowToSongDataAsync } from '@/lib/player/apply-song-flow'
import {
  exportOrderedSongsZip,
  exportSetlistPdf,
  type HubExportSong,
  type TextExportFormat,
} from '@/lib/song-import-export'
import {
  coerceMusicalKeyString,
  languageIndexForSongLink,
  resolveSongDataKey,
} from '@/lib/setlist-song-links'
import type { ChordSongData, SongFlowItem } from '@/ports/chord-engine'

export type HubExportSongLink = {
  id: string
  key?: unknown
  language?: unknown
  flow?: SongFlowItem[] | null
}

export async function hydrateSongLinksForHubExport(
  queryClient: QueryClient,
  links: HubExportSongLink[],
): Promise<HubExportSong[]> {
  const hydrated = await Promise.all(
    links.map(async (link) => {
      const song = await fetchSongForHubSlot(queryClient, { id: link.id })
      if (!song || song.not_a_song) return null
      const rawData = song.data as ChordSongData
      const data = await applyFlowToSongDataAsync(rawData, link.flow)
      const key =
        coerceMusicalKeyString(link.key) ??
        resolveSongDataKey(data as Record<string, unknown>) ??
        undefined
      const language = languageIndexForSongLink(data as Record<string, unknown>, link.language)
      const row: HubExportSong = { data, key, language }
      return row
    }),
  )
  return hydrated.filter((row): row is HubExportSong => row != null)
}

export async function runOrderedSongsPdfExport(
  queryClient: QueryClient,
  title: string,
  links: HubExportSongLink[],
  chordFormat: ChordFormatPreference,
  hideChords?: boolean,
): Promise<void> {
  const songs = await hydrateSongLinksForHubExport(queryClient, links)
  const engine = await getChordEngine()
  await exportSetlistPdf(engine, title, songs, chordFormat, hideChords)
}

export async function runOrderedSongsZipExport(
  queryClient: QueryClient,
  title: string,
  links: HubExportSongLink[],
  format: TextExportFormat,
  chordFormat: ChordFormatPreference,
  hideChords?: boolean,
): Promise<void> {
  const songs = await hydrateSongLinksForHubExport(queryClient, links)
  const engine = await getChordEngine()
  await exportOrderedSongsZip(engine, title, songs, format, chordFormat, hideChords)
}
