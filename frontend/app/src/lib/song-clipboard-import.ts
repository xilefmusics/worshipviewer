import {
  isLikelyUltimateGuitarHtml,
  parseUltimateGuitarHtml,
} from '@/lib/ultimate-guitar-import'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

const CHORDPRO_DIRECTIVE_PATTERN = /^\s*\{[a-z][\w-]*\s*(?::|\})/im
const CHORD_PATTERN = /\[(?:[A-G](?:#|b)?(?:(?:maj|min|dim|aug|sus|add|m)?[0-9]*(?:\/[A-G](?:#|b)?)?))\]/i

/** Return true for clipboard text with a recognizable supported song source shape. */
export function isLikelySongClipboardText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (isLikelyUltimateGuitarHtml(trimmed)) return true
  return CHORDPRO_DIRECTIVE_PATTERN.test(trimmed) || CHORD_PATTERN.test(trimmed)
}

/** Parse a recognizable clipboard song source. Unrecognized or invalid text returns null. */
export function parseSongClipboardText(
  engine: ChordEngine,
  text: string,
): ChordSongData | null {
  const trimmed = text.trim()
  if (!isLikelySongClipboardText(trimmed)) return null

  if (isLikelyUltimateGuitarHtml(trimmed)) {
    const result = parseUltimateGuitarHtml(engine, trimmed)
    return result.ok && hasMeaningfulSongData(result.data) ? result.data : null
  }

  try {
    const data = engine.parseChordPro(trimmed)
    return hasMeaningfulSongData(data) ? data : null
  } catch {
    return null
  }
}

function hasMeaningfulSongData(data: ChordSongData): boolean {
  const titles = Array.isArray(data.titles) ? data.titles : []
  if (titles.some((title) => typeof title === 'string' && title.trim().length > 0)) return true
  return Array.isArray(data.sections) && data.sections.length > 0
}
