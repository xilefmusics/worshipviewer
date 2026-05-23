import type { components } from '@/api/schema'

import { chordFormatToRepresentation, type ChordFormatPreference } from '@/lib/chord-format'
import {
  coerceMusicalKeyString,
  resolveSongDataKey,
  songLinkKeyEditorToWire,
} from '@/lib/setlist-song-links'
import {
  ChordEngineError,
  type ChordEngine,
  type ChordSongData,
  type FormatChordProOptions,
} from '@/ports/chord-engine'

/** Format options for Worship Pro source in the song editor. */
export function songEditorFormatOptions(
  chordFormat: ChordFormatPreference = 'letters',
  data?: ChordSongData,
): FormatChordProOptions {
  const key = data ? (resolveSongDataKey(data as Record<string, unknown>) ?? undefined) : undefined
  return {
    worshipPro: true,
    key,
    representation: chordFormatToRepresentation(chordFormat),
  }
}

/** @deprecated Use {@link songEditorFormatOptions} */
export const SONG_EDITOR_FORMAT_OPTIONS: FormatChordProOptions = songEditorFormatOptions('letters')

export type PatchSongData = components['schemas']['PatchSongData']

/** Time signatures offered in the song editor meta strip. */
export const SONG_EDITOR_TIME_SIGNATURES = ['4/4', '6/8'] as const

/** Pause after typing before autosave runs or parse errors are shown in source mode. */
export const SONG_EDITOR_TYPING_DEBOUNCE_MS = 3000

export type SongEditorTimeSignature = (typeof SONG_EDITOR_TIME_SIGNATURES)[number]

export type SongMetadataStrip = {
  title: string
  subtitle: string
  artists: string
  copyright: string
  languages: string
  tempo: string
  /** `''` = unset; otherwise one of {@link SONG_EDITOR_TIME_SIGNATURES}. */
  timeSignature: string
  key: string
  tags: SongMetaTagEntry[]
}

export type SongMetaTagEntry = {
  id: string
  key: string
  value: string
}

export function createSongMetaTagEntry(key = '', value = '', id = crypto.randomUUID()): SongMetaTagEntry {
  return { id, key, value }
}

export function formatSongMetaTagValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** ChordPro `{meta: name value}` pairs from `data.tags`, sorted by key. */
export function songMetaTagsFromSongData(
  data: ChordSongData | null | undefined,
): SongMetaTagEntry[] {
  const tags = data?.tags
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return []

  return Object.entries(tags as Record<string, unknown>)
    .map(([key, value]) => createSongMetaTagEntry(key, formatSongMetaTagValue(value)))
    .filter(({ key, value }) => key.trim() || value.trim())
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: 'base' }))
}

export function songMetaTagsToWireRecord(
  entries: SongMetaTagEntry[] | undefined,
): Record<string, string> | null {
  if (!entries?.length) return null
  const record: Record<string, string> = {}
  for (const { key, value } of entries) {
    const trimmedKey = key.trim()
    if (!trimmedKey) continue
    record[trimmedKey] = value.trim()
  }
  return Object.keys(record).length ? record : null
}

export type ParseSourceResult =
  | { ok: true; data: ChordSongData }
  | { ok: false; error: string }

export function parseSourceWithEngine(engine: ChordEngine, source: string): ParseSourceResult {
  try {
    const data = engine.parseChordPro(source)
    return { ok: true, data }
  } catch (e) {
    const message = e instanceof ChordEngineError ? e.message : String(e)
    return { ok: false, error: message }
  }
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseTempoInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded <= 0 || rounded > 999) return null
  return rounded
}

function timeSignatureFromSongTime(time: unknown): string {
  if (!Array.isArray(time) || time.length < 2) return ''
  const n = Math.round(Number(time[0]))
  const d = Math.round(Number(time[1]))
  if (n === 4 && d === 4) return '4/4'
  if (n === 6 && d === 8) return '6/8'
  return ''
}

function parseTimeSignature(value: string): number[] | null {
  if (value === '4/4') return [4, 4]
  if (value === '6/8') return [6, 8]
  return null
}

export function metadataStripFromSongData(data: ChordSongData): SongMetadataStrip {
  const titles = Array.isArray(data.titles) ? data.titles : []
  const artists = Array.isArray(data.artists) ? data.artists.filter(Boolean) : []
  const languages = Array.isArray(data.languages) ? data.languages.filter(Boolean) : []
  const tempo =
    typeof data.tempo === 'number' && Number.isFinite(data.tempo) ? String(Math.round(data.tempo)) : ''

  return {
    title: typeof titles[0] === 'string' ? titles[0] : '',
    subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
    artists: artists.join(', '),
    copyright: typeof data.copyright === 'string' ? data.copyright : '',
    languages: languages.join(', '),
    tempo,
    timeSignature: timeSignatureFromSongTime(data.time),
    key: coerceMusicalKeyString(data.key) ?? '',
    tags: songMetaTagsFromSongData(data),
  }
}

function normalizeMetadataStrip(strip: Partial<SongMetadataStrip>): SongMetadataStrip {
  return {
    title: strip.title ?? '',
    subtitle: strip.subtitle ?? '',
    artists: strip.artists ?? '',
    copyright: strip.copyright ?? '',
    languages: strip.languages ?? '',
    tempo: strip.tempo ?? '',
    timeSignature: strip.timeSignature ?? '',
    key: strip.key ?? '',
    tags: strip.tags ?? [],
  }
}

export function patchSongDataFromParsed(
  parsed: ChordSongData,
  stripInput: SongMetadataStrip,
): PatchSongData {
  const strip = normalizeMetadataStrip(stripInput)
  const sections = Array.isArray(parsed.sections) ? parsed.sections : []
  const title = strip.title.trim()
  const titles = title
    ? [title]
    : Array.isArray(parsed.titles) && parsed.titles.length
      ? parsed.titles.map(String)
      : ['']

  const keyWire = strip.key.trim() ? songLinkKeyEditorToWire(strip.key.trim()) : null
  const tags = songMetaTagsToWireRecord(strip.tags)

  return {
    titles,
    subtitle: strip.subtitle.trim() || null,
    artists: splitCsv(strip.artists),
    copyright: strip.copyright.trim() || null,
    languages: splitCsv(strip.languages),
    tempo: parseTempoInput(strip.tempo),
    time: parseTimeSignature(strip.timeSignature.trim()),
    key: keyWire,
    sections,
    tags: tags as PatchSongData['tags'],
  }
}

export function patchSongDataFromSongData(data: ChordSongData): PatchSongData {
  return patchSongDataFromParsed(data, metadataStripFromSongData(data))
}

export function applyMetadataStripToSource(
  engine: ChordEngine,
  parsed: ChordSongData,
  strip: SongMetadataStrip,
  chordFormat: ChordFormatPreference = 'letters',
): string {
  const patch = patchSongDataFromParsed(parsed, strip)
  const merged: ChordSongData = {
    ...parsed,
    titles: patch.titles ?? undefined,
    subtitle: patch.subtitle,
    artists: patch.artists,
    copyright: patch.copyright,
    languages: patch.languages,
    tempo: patch.tempo,
    time: patch.time,
    key: patch.key,
    tags: patch.tags ?? undefined,
  }
  return engine.formatChordPro(merged, songEditorFormatOptions(chordFormat, merged))
}

export function formatSourceFromSongData(
  engine: ChordEngine,
  data: ChordSongData,
  chordFormat: ChordFormatPreference = 'letters',
): string {
  return engine.formatChordPro(data, songEditorFormatOptions(chordFormat, data))
}

export function songDataSnapshotsEqual(a: PatchSongData, b: PatchSongData): boolean {
  return stableSnapshotJson(a) === stableSnapshotJson(b)
}

function stableSnapshotJson(data: PatchSongData): string {
  return JSON.stringify({
    titles: data.titles ?? null,
    subtitle: data.subtitle ?? null,
    artists: data.artists ?? null,
    copyright: data.copyright ?? null,
    languages: data.languages ?? null,
    tempo: data.tempo ?? null,
    time: data.time ?? null,
    key: data.key ?? null,
    sections: data.sections ?? null,
    tags: data.tags ?? null,
  })
}

/** Collect parse errors for UI (single message today; list shape for future multi-error). */
export function parseErrorsFromResult(result: ParseSourceResult): string[] {
  return result.ok ? [] : [result.error]
}
