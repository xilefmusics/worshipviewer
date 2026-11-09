import { chordFormatToRepresentation, type ChordFormatPreference } from '@/lib/chord-format'
import { getChordEngine } from '@/lib/chord-engine'
import { applyFlowToSongData } from '@/lib/player/apply-song-flow'
import { resolveSongDataKey } from '@/lib/setlist-song-links'
import { stripChordsFromChordpro } from '@/lib/strip-chords-from-chordpro'
import type { ChordEngine, ChordSongData, SongFlowItem } from '@/ports/chord-engine'

export type PlayerSongCopyOptions = {
  key?: string | null
  languageIndex?: number | null
  chordFormat: ChordFormatPreference
  hideChords: boolean
}

/** Format one player item as Worship Pro, applying its slot flow and display options. */
export function formatPlayerSongAsWorshipPro(
  engine: ChordEngine,
  data: ChordSongData,
  flow: SongFlowItem[] | null | undefined,
  options: PlayerSongCopyOptions,
): string {
  const resolvedData = applyFlowToSongData(engine, data, flow)
  const text = engine.formatChordPro(resolvedData, {
    worshipPro: true,
    key: options.key ?? resolveSongDataKey(resolvedData as Record<string, unknown>) ?? undefined,
    language: options.languageIndex ?? undefined,
    representation: chordFormatToRepresentation(options.chordFormat),
  })
  return options.hideChords ? stripChordsFromChordpro(text) : text
}

export async function copyPlayerSongAsWorshipPro(
  data: ChordSongData,
  flow: SongFlowItem[] | null | undefined,
  options: PlayerSongCopyOptions,
): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('Clipboard is unavailable')
  }
  const engine = await getChordEngine()
  const text = formatPlayerSongAsWorshipPro(engine, data, flow, options)
  await navigator.clipboard.writeText(text)
}
