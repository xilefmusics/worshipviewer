import type { ChordFormatPreference } from '@/lib/chord-format'
import { formatSourceFromSongData } from '@/lib/song-editor-state'
import { ChordEngineError, type ChordEngine, type ChordSongData } from '@/ports/chord-engine'

const UG_URL_PATTERN =
  /^https?:\/\/(?:www\.|tabs\.)?ultimate-guitar\.com\/[^\s]+$/i

export type ImportUltimateGuitarResult =
  | { ok: true; data: ChordSongData; source: string }
  | { ok: false; error: string }

export type ParseUltimateGuitarResult =
  | { ok: true; data: ChordSongData }
  | { ok: false; error: string }

export function isUltimateGuitarUrl(text: string): boolean {
  return UG_URL_PATTERN.test(text.trim())
}

export function isLikelyUltimateGuitarHtml(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  const looksLikeHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML')

  if (!looksLikeHtml) return false

  const lower = trimmed.toLowerCase()
  return (
    lower.includes('ultimate-guitar') ||
    lower.includes('js-store') ||
    lower.includes('data-content')
  )
}

export function shouldAttemptUgImport(source: string, parseOk: boolean): boolean {
  if (parseOk) return false
  return isLikelyUltimateGuitarHtml(source)
}

export function parseUltimateGuitarHtml(
  engine: ChordEngine,
  html: string,
): ParseUltimateGuitarResult {
  if (!isLikelyUltimateGuitarHtml(html)) {
    return { ok: false, error: 'Source does not look like Ultimate Guitar page HTML.' }
  }

  try {
    return { ok: true, data: engine.parseUltimateGuitarHtml(html) }
  } catch (e) {
    const message = e instanceof ChordEngineError ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export function importUltimateGuitarHtml(
  engine: ChordEngine,
  html: string,
  chordFormat: ChordFormatPreference,
): ImportUltimateGuitarResult {
  const parsed = parseUltimateGuitarHtml(engine, html)
  if (!parsed.ok) return parsed
  const source = formatSourceFromSongData(engine, parsed.data, chordFormat)
  return { ok: true, data: parsed.data, source }
}
