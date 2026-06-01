import { getChordEngine } from '@/lib/chord-engine'
import type { ChordFormatPreference } from '@/lib/chord-format'
import {
  exportSongPdf,
  exportSongText,
  type TextExportFormat,
} from '@/lib/song-import-export'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

export type SongExportKind = TextExportFormat | 'pdf'

export async function runSongExport(
  data: ChordSongData,
  kind: SongExportKind,
  chordFormat: ChordFormatPreference,
  engine?: ChordEngine,
): Promise<void> {
  const resolved = engine ?? (await getChordEngine())
  if (kind === 'pdf') {
    await exportSongPdf(resolved, data, chordFormat)
    return
  }
  exportSongText(resolved, data, kind, chordFormat)
}
