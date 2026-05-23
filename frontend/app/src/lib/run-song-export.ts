import { getChordEngine } from '@/lib/chord-engine'
import type { ChordFormatPreference } from '@/lib/chord-format'
import {
  exportSongPdf,
  exportSongText,
  type TextExportFormat,
} from '@/lib/song-import-export'
import type { ChordSongData } from '@/ports/chord-engine'

export type SongExportKind = TextExportFormat | 'pdf'

export async function runSongExport(
  data: ChordSongData,
  kind: SongExportKind,
  chordFormat: ChordFormatPreference,
): Promise<void> {
  const engine = await getChordEngine()
  if (kind === 'pdf') {
    await exportSongPdf(engine, data, chordFormat)
    return
  }
  exportSongText(engine, data, kind, chordFormat)
}
