import type { components } from '@/api/schema'

import { chordFormatToRepresentation, type ChordFormatPreference } from '@/lib/chord-format'
import {
  chordSymbolToPitchLevel,
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

/** Pause after typing before parse errors are shown in source mode. */
export const SONG_EDITOR_TYPING_DEBOUNCE_MS = 3000

export type SongEditorTimeSignature = (typeof SONG_EDITOR_TIME_SIGNATURES)[number]

export type SongMetadataStrip = {
  subtitle: string
  copyright: string
  languageEntries: SongLanguageEntry[]
  tempo: string
  /** `''` = unset; otherwise one of {@link SONG_EDITOR_TIME_SIGNATURES}. */
  timeSignature: string
  key: string
  tags: SongMetaTagEntry[]
}

export type SongLanguageEntry = {
  id: string
  language: string
  title: string
  artist: string
}

export type SongMetaTagEntry = {
  id: string
  key: string
  value: string
}

export function createSongLanguageEntry(
  language = '',
  title = '',
  artist = '',
  id = crypto.randomUUID(),
): SongLanguageEntry {
  return { id, language, title, artist }
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
): Record<string, string> {
  const record: Record<string, string> = {}
  if (!entries?.length) return record
  for (const { key, value } of entries) {
    const trimmedKey = key.trim()
    if (!trimmedKey) continue
    record[trimmedKey] = value.trim()
  }
  return record
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

/** Beats per bar for editor time signatures; `null` when unset or unsupported. */
export function beatsPerMeasureFromTimeSignature(timeSignature: string): number | null {
  const parsed = parseTimeSignature(timeSignature.trim())
  return parsed ? parsed[0]! : null
}

/** Parallel `titles`, `artists`, and `languages` slots grouped by index. */
export function songLanguageEntriesFromSongData(
  data: ChordSongData | null | undefined,
): SongLanguageEntry[] {
  const titles = Array.isArray(data?.titles) ? data.titles.map(String) : []
  const artists = Array.isArray(data?.artists) ? data.artists.map(String) : []
  const languages = Array.isArray(data?.languages) ? data.languages.map(String) : []
  const count = Math.max(titles.length, artists.length, languages.length)
  if (count === 0) return []

  return Array.from({ length: count }, (_, index) =>
    createSongLanguageEntry(languages[index] ?? '', titles[index] ?? '', artists[index] ?? ''),
  )
}

export function songLanguageEntriesToWireArrays(entries: SongLanguageEntry[] | undefined): {
  titles: string[]
  artists: string[]
  languages: string[]
} {
  if (!entries?.length) {
    return { titles: [], artists: [], languages: [] }
  }
  return {
    titles: entries.map(({ title }) => title.trim()),
    artists: entries.map(({ artist }) => artist.trim()),
    languages: entries.map(({ language }) => language.trim()),
  }
}

export function metadataStripFromSongData(data: ChordSongData): SongMetadataStrip {
  const tempo =
    typeof data.tempo === 'number' && Number.isFinite(data.tempo) ? String(Math.round(data.tempo)) : ''

  return {
    subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
    copyright: typeof data.copyright === 'string' ? data.copyright : '',
    languageEntries: songLanguageEntriesFromSongData(data),
    tempo,
    timeSignature: timeSignatureFromSongTime(data.time),
    key: coerceMusicalKeyString(data.key) ?? '',
    tags: songMetaTagsFromSongData(data),
  }
}

function normalizeMetadataStrip(strip: Partial<SongMetadataStrip>): SongMetadataStrip {
  return {
    subtitle: strip.subtitle ?? '',
    copyright: strip.copyright ?? '',
    languageEntries: strip.languageEntries ?? [],
    tempo: strip.tempo ?? '',
    timeSignature: strip.timeSignature ?? '',
    key: strip.key ?? '',
    tags: strip.tags ?? [],
  }
}

type WireLineLike = {
  parts?: Array<{ chord?: unknown; languages?: string[]; comment?: boolean }>
}

type WireSectionLike = {
  title?: string
  lines?: WireLineLike[]
  repeat_count?: number | null
}

export function isWireLineEmptyForExport(line: WireLineLike): boolean {
  const parts = Array.isArray(line.parts) ? line.parts : []
  if (!parts.length) return true
  return !parts.some((part) => {
    if (part.chord != null) return true
    return (part.languages ?? []).some((segment) => segment.trim().length > 0)
  })
}

export function stripEmptyLinesFromSongData(data: ChordSongData): ChordSongData {
  return {
    ...data,
    sections: stripEmptyLinesFromSections(data.sections) ?? [],
  }
}

function stripEmptyLinesFromSections(sections: ChordSongData['sections']): PatchSongData['sections'] {
  if (!Array.isArray(sections)) return sections as PatchSongData['sections']
  return sections.map((section) => {
    const wire = section as WireSectionLike
    const lines = Array.isArray(wire.lines) ? wire.lines : []
    return {
      ...section,
      lines: lines.filter((line) => !isWireLineEmptyForExport(line)),
    }
  }) as PatchSongData['sections']
}

export function patchSongDataFromParsed(
  parsed: ChordSongData,
  stripInput: SongMetadataStrip,
): PatchSongData {
  const strip = normalizeMetadataStrip(stripInput)
  const sections = stripEmptyLinesFromSections(
    Array.isArray(parsed.sections) ? parsed.sections : [],
  )
  const { titles: stripTitles, artists, languages } = songLanguageEntriesToWireArrays(
    strip.languageEntries,
  )
  const titles = stripTitles.some(Boolean)
    ? stripTitles
    : Array.isArray(parsed.titles) && parsed.titles.length
      ? parsed.titles.map(String)
      : ['']

  const keyWire = strip.key.trim() ? songLinkKeyEditorToWire(strip.key.trim()) : null
  const tags = songMetaTagsToWireRecord(strip.tags)

  return {
    titles,
    subtitle: strip.subtitle.trim() || null,
    artists,
    copyright: strip.copyright.trim() || null,
    languages,
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

export function mergeSongDataWithMetadataStrip(
  parsed: ChordSongData,
  strip: SongMetadataStrip,
): ChordSongData {
  const patch = patchSongDataFromParsed(parsed, strip)
  return {
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
}

export type KeyChangeChordMode = 'transpose' | 'keep'

/** Ask when switching between two set keys (not when clearing or first assigning). */
export function shouldPromptKeyChangeChords(previousKey: string, nextKey: string): boolean {
  const from = previousKey.trim()
  const to = nextKey.trim()
  return Boolean(from && to && from !== to)
}

function remapStoredLevelForKeyChange(
  stored: number,
  oldKeyPitchClass: number,
  newKeyPitchClass: number,
): number {
  const relative = ((Math.round(stored) % 12) + 12) % 12
  const absolute = (relative + oldKeyPitchClass) % 12
  return (absolute + 12 - newKeyPitchClass) % 12
}

type WireSimpleChord = { level?: number }
type WireChord = { main?: WireSimpleChord; base?: WireSimpleChord | null }
type WirePart = { chord?: WireChord | null }
type WireLine = { parts?: WirePart[] }
type WireSection = { lines?: WireLine[] }

function remapWireChord(chord: WireChord, oldKeyPc: number, newKeyPc: number): WireChord {
  const mainLevel = chord.main?.level
  if (typeof mainLevel !== 'number' || !Number.isFinite(mainLevel)) {
    return chord
  }

  const next: WireChord = {
    ...chord,
    main: {
      ...chord.main,
      level: remapStoredLevelForKeyChange(mainLevel, oldKeyPc, newKeyPc),
    },
  }

  const baseLevel = chord.base?.level
  if (chord.base != null && typeof baseLevel === 'number' && Number.isFinite(baseLevel)) {
    next.base = {
      ...chord.base,
      level: remapStoredLevelForKeyChange(baseLevel, oldKeyPc, newKeyPc),
    }
  }

  return next
}

/** Preserve absolute chord roots when only the song key metadata changes (chordlib `apply_key` does not do this). */
export function remapSongChordLevelsForAbsolutePitch(
  data: ChordSongData,
  previousKey: string,
  nextKey: string,
): ChordSongData {
  const oldKeyPc = chordSymbolToPitchLevel(previousKey)
  const newKeyPc = chordSymbolToPitchLevel(nextKey)
  if (oldKeyPc == null || newKeyPc == null) return data

  const sections = data.sections
  if (!Array.isArray(sections)) return data

  return {
    ...data,
    sections: sections.map((section) => {
      const sec = section as WireSection
      if (!Array.isArray(sec.lines)) return section

      return {
        ...sec,
        lines: sec.lines.map((line) => {
          const ln = line as WireLine
          if (!Array.isArray(ln.parts)) return line

          return {
            ...ln,
            parts: ln.parts.map((part) => {
              const p = part as WirePart
              const chord = p.chord
              if (chord == null || typeof chord !== 'object') return part
              return {
                ...p,
                chord: remapWireChord(chord, oldKeyPc, newKeyPc),
              }
            }),
          }
        }),
      }
    }),
  }
}

export function applyKeyChangeToSource(
  engine: ChordEngine,
  parsed: ChordSongData,
  strip: SongMetadataStrip,
  mode: KeyChangeChordMode,
  previousKey: string,
  chordFormat: ChordFormatPreference = 'letters',
): string {
  let merged = mergeSongDataWithMetadataStrip(parsed, strip)

  if (
    mode === 'keep' &&
    shouldPromptKeyChangeChords(previousKey, strip.key) &&
    strip.key.trim()
  ) {
    merged = remapSongChordLevelsForAbsolutePitch(merged, previousKey.trim(), strip.key.trim())
  }

  return engine.formatChordPro(merged, songEditorFormatOptions(chordFormat, merged))
}

export function applyMetadataStripToSource(
  engine: ChordEngine,
  parsed: ChordSongData,
  strip: SongMetadataStrip,
  chordFormat: ChordFormatPreference = 'letters',
): string {
  const merged = mergeSongDataWithMetadataStrip(parsed, strip)
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

function normalizeTagsSnapshot(tags: PatchSongData['tags']): Record<string, string> | null {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return null
  const entries = Object.entries(tags as Record<string, string>).filter(([key]) => key.trim())
  if (!entries.length) return null
  return Object.fromEntries(entries)
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
    tags: normalizeTagsSnapshot(data.tags),
  })
}

/** Collect parse errors for UI (single message today; list shape for future multi-error). */
export function parseErrorsFromResult(result: ParseSourceResult): string[] {
  return result.ok ? [] : [result.error]
}
