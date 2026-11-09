import { getChordEngine } from '@/lib/chord-engine'
import type { ChordFormatPreference } from '@/lib/chord-format'
import { applyFlowToSongData } from '@/lib/player/apply-song-flow'
import type { ChordSongData, SongFlowItem } from '@/ports/chord-engine'

export type PlayerSongPdfOptions = {
  key?: string | null
  languageIndex?: number | null
  capoFret?: number | null
  chordFormat: ChordFormatPreference
  hideChords: boolean
}

/** Print only the requested player song using the same A4 preview as Export PDF. */
export async function printPlayerSongPdf(
  data: ChordSongData,
  flow: SongFlowItem[] | null | undefined,
  options: PlayerSongPdfOptions,
): Promise<void> {
  const engine = await getChordEngine()
  const resolvedData = applyFlowToSongData(engine, data, flow)
  const { exportSongPdf } = await import('@/lib/song-import-export')

  await exportSongPdf(engine, resolvedData, options.chordFormat, options.hideChords, {
    key: options.key,
    language: options.languageIndex,
    titleLanguage: options.languageIndex,
    capo: options.capoFret,
  })
}
