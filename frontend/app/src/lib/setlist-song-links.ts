import type { components } from '@/api/schema'

import { normalizedTempoBpm } from '@/lib/song-display-meta'

export type SongLink = components['schemas']['SongLink']
export type FlowSlot = components['schemas']['FlowSlot']
export type SongFlow = FlowSlot[] | null

/** Editor slot with a coerced chord symbol; wire `SongLink.key` is `{ level }`. */
export type EditorSongLink = {
  id: string
  key: string | null
  tempo?: number | null
  language?: string | null
  nr?: string | null
  flow?: SongFlow
}

export type SimpleChord = components['schemas']['SimpleChord']

/** Pitch-class index on wire (`SimpleChord.level` / chordlib): 0 = A, then chromatically … 11 = Ab (flat spellings). */
const PITCH_CLASS_TO_SYMBOL = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab'] as const

/** Longest-symbol-first match (`Eb` wins over `E`), same order as `[level] → symbol`. */
const PITCH_CLASS_ROOT_ENTRIES = [...PITCH_CLASS_TO_SYMBOL].map((sym, level) => ({ sym, level }))
PITCH_CLASS_ROOT_ENTRIES.sort((a, b) => b.sym.length - a.sym.length)

/** Sharp roots rewritten to flat equivalents (`F#m` → `Gbm`). Order: longest sharp prefix first. */
const SHARP_ROOT_TO_FLAT: readonly [string, string][] = [
  ['C#', 'Db'],
  ['D#', 'Eb'],
  ['F#', 'Gb'],
  ['G#', 'Ab'],
  ['A#', 'Bb'],
]

/** Normalize display / coercion output to prefer flat spellings for enharmonic equivalents. */
export function preferFlatEnharmonicSpelling(symbol: string): string {
  const s = symbol.trim()
  if (!s.length) return s
  for (const [sharp, flat] of SHARP_ROOT_TO_FLAT) {
    if (s === sharp || s.startsWith(sharp)) {
      return flat + s.slice(sharp.length)
    }
  }
  return s
}

function finalizeCoercedKey(s: string | null): string | null {
  if (s == null) return null
  const t = s.trim()
  return t.length ? preferFlatEnharmonicSpelling(t) : null
}

/** Map API `key.level` (0–11) to a letter: **0 = A**, then chromatically with flat spellings (**11 = Ab**). */
export function pitchClassLevelToKeySymbol(level: unknown): string | null {
  if (typeof level !== 'number' || !Number.isFinite(level)) return null
  const pc = ((Math.round(level) % 12) + 12) % 12
  return PITCH_CLASS_TO_SYMBOL[pc] ?? null
}

/**
 * Inverse of `pitchClassLevelToKeySymbol`: map a chord / key symbol (flat spellings preferred) to
 * `level` (`0=A` … `11=Ab`) for PATCH/POST bodies.
 */
export function chordSymbolToPitchLevel(symbol: string): number | null {
  const flat = finalizeCoercedKey(symbol.trim())
  if (flat == null) return null
  for (const { sym, level } of PITCH_CLASS_ROOT_ENTRIES) {
    if (flat.startsWith(sym) && chordTailKeepsMatchedRoot(sym, flat.slice(sym.length))) {
      return level
    }
  }
  return null
}

/** Root match for `Eb`/`E` prefixes: tolerate common chord qualities after canonical flat-letter root. */
function chordTailKeepsMatchedRoot(_root: string, tail: string): boolean {
  if (tail === '') return true
  const low = tail.toLowerCase()
  if (low.startsWith('maj')) return true
  if (/^Δ/.test(tail)) return true
  if (tail.startsWith('M') && /^M(?!aj)/.test(tail)) return true
  if (/^min/i.test(low)) return true
  if (/^m(?!aj)/i.test(low)) return true
  if (/^(dim|aug|ø|half|omit|no|add|sus|[#()/]|\/|\d)/i.test(tail)) return true
  return false
}

/** Map editor slot key (string chord symbol after coercion, or inputs `coerceMusicalKeyString` accepts). */
export function songLinkKeyEditorToWire(key: unknown): SimpleChord | null {
  const coerced = coerceMusicalKeyString(key)
  if (coerced == null) return null
  const level = chordSymbolToPitchLevel(coerced)
  if (level == null) return null
  return { level }
}

/** One wire `SongLink` for PATCH/POST `songs`; server expects `key` as `{ level }` or JSON `null`. */
export function songLinkForSetlistMutation(
  link: EditorSongLink,
): Pick<SongLink, 'id' | 'key' | 'tempo' | 'language' | 'flow'> {
  return {
    id: normalizeSongLinkId(link.id),
    key: songLinkKeyEditorToWire(link.key),
    tempo: songLinkTempoEditorToWire(link.tempo),
    language: normalizeSongLinkLanguage(link.language),
    flow: normalizeSongFlow(link.flow),
  }
}

/** Normalize editor tempo to wire BPM or `null` (inherit song default). */
export function songLinkTempoEditorToWire(tempo: unknown): number | null {
  return normalizedTempoBpm(tempo)
}

/** Normalize custom flow payloads; invalid or empty flows collapse to `null` (default flow). */
export function normalizeSongFlow(flow: unknown): SongFlow {
  if (!Array.isArray(flow)) return null
  const slots: FlowSlot[] = []
  for (const raw of flow) {
    const slot = normalizeFlowSlot(raw)
    if (!slot) return null
    slots.push(slot)
  }
  return slots.length > 0 ? slots : null
}

function normalizeFlowSlot(raw: unknown): FlowSlot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const sectionTitle =
    typeof value.section_title === 'string' ? value.section_title.trim() : ''
  if (!sectionTitle) return null
  const occurrenceIndex = normalizeFlowIndex(value.occurrence_index)
  const repeatCount = normalizeFlowIndex(value.repeat_count)
  if (occurrenceIndex == null || repeatCount == null || repeatCount < 1) return null
  return {
    section_title: sectionTitle,
    occurrence_index: occurrenceIndex,
    repeat_count: repeatCount,
  }
}

function normalizeFlowIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.trunc(value)
  return n >= 0 && n === value ? n : null
}

/** Preserve only non-empty language tags from song metadata / setlist slots. */
export function normalizeSongLinkLanguage(language: unknown): string | null {
  if (typeof language !== 'string') return null
  const trimmed = language.trim()
  return trimmed.length ? trimmed : null
}

/** Song metadata languages as selectable labels/tags, with empty entries removed. */
export function songLanguageOptions(data: Record<string, unknown> | undefined | null): string[] {
  const raw = data?.languages
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    const lang = normalizeSongLinkLanguage(value)
    if (!lang || seen.has(lang)) continue
    seen.add(lang)
    out.push(lang)
  }
  return out
}

/** Default slot language when inserting a song into a setlist. */
export function defaultSongLinkLanguage(data: Record<string, unknown> | undefined | null): string | null {
  return songLanguageOptions(data)[0] ?? null
}

/** Convert a stored setlist language tag into the chord engine's zero-based language index. */
export function languageIndexForSongLink(
  data: Record<string, unknown> | undefined | null,
  language: unknown,
): number | undefined {
  const selected = normalizeSongLinkLanguage(language)
  if (!selected) return undefined
  const idx = songLanguageOptions(data).indexOf(selected)
  return idx >= 0 ? idx : undefined
}

/** Resolve a song title using the setlist slot language when parallel titles are available. */
export function songTitleForLanguage(
  data: Record<string, unknown> | undefined | null,
  language: unknown,
  fallback = 'Untitled',
): string {
  const titles = Array.isArray(data?.titles) ? data.titles : []
  const titleAt = (index: number): string | null => {
    const value = titles[index]
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  const languageIndex = languageIndexForSongLink(data, language)
  return (languageIndex != null ? titleAt(languageIndex) : null) ?? titleAt(0) ?? fallback
}

export type SongTitleVariant = {
  languageIndex: number
  title: string
}

/**
 * Return the non-empty title variants stored in a song's metadata.
 *
 * Titles are kept in language-slot order so the TOC can fan out one row per translated title.
 * When a song has no titles at all, keep a single fallback row for the caller-provided display
 * title so single-language songs still render.
 */
export function songTitleVariantsForDisplay(
  data: Record<string, unknown> | undefined | null,
  fallback = '',
): SongTitleVariant[] {
  const titles = Array.isArray(data?.titles) ? data.titles : []
  const variants: SongTitleVariant[] = []

  for (let index = 0; index < titles.length; index += 1) {
    const value = titles[index]
    if (typeof value !== 'string') continue
    const title = value.trim()
    if (!title) continue
    variants.push({ languageIndex: index, title })
  }

  if (variants.length > 0) return variants

  const fallbackTitle = fallback.trim()
  return fallbackTitle ? [{ languageIndex: 0, title: fallbackTitle }] : []
}

/** Resolve a song artist using the setlist slot language when parallel artists are available. */
export function songArtistForLanguage(
  data: Record<string, unknown> | undefined | null,
  language: unknown,
  fallback = '',
): string {
  const artists = Array.isArray(data?.artists) ? data.artists : []
  const artistAt = (index: number): string | null => {
    const value = artists[index]
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  const languageIndex = languageIndexForSongLink(data, language)
  return (languageIndex != null ? artistAt(languageIndex) : null) ?? artistAt(0) ?? fallback
}

/** Opaque IDs should be strings on the wire; JSON may deserialize numeric-looking ids locally. */
export function normalizeSongLinkId(id: unknown): string {
  if (typeof id === 'string') return id
  if (typeof id === 'number' && Number.isFinite(id)) return String(id)
  if (id == null) return ''
  return String(id)
}

/**
 * Normalize slot / song metadata into a chord symbol string for UI and editor state.
 *
 * Incoming API values may use strings, `{ level: 0–11 }`, or nested legacy shapes. Outgoing setlist
 * PATCH uses `songLinkForSetlistMutation`, which converts these strings back to `{ level }`.
 */
export function coerceMusicalKeyString(value: unknown, depth = 0): string | null {
  if (value == null || depth > 4) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return finalizeCoercedKey(pitchClassLevelToKeySymbol(value))
  }
  if (typeof value === 'string') {
    const t = value.trim()
    return t.length ? finalizeCoercedKey(t) : null
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    if ('level' in o) {
      const fromPitch = pitchClassLevelToKeySymbol(o.level)
      if (fromPitch) return finalizeCoercedKey(fromPitch)
    }
    for (const prop of [
      'key',
      'name',
      'label',
      'symbol',
      'root',
      'note',
      'tonic',
      'chord',
      'value',
      'pitch',
    ] as const) {
      const inner = o[prop]
      if (typeof inner === 'string' && inner.trim()) return finalizeCoercedKey(inner.trim())
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        const nested = coerceMusicalKeyString(inner, depth + 1)
        if (nested) return nested
      }
    }
  }
  return null
}

/** Prefer `data.key`, tags, optional metadata aliases, structured sections, then deep scan. */
export function resolveSongDataKey(data: Record<string, unknown> | undefined | null): string | null {
  if (!data) return null
  const record = data

  if (Array.isArray(record.key)) {
    const fromArr = coerceMusicalKeyString(record.key[0])
    if (fromArr) return fromArr
  }

  const direct = coerceMusicalKeyString(record.key)
  if (direct) return direct

  for (const field of ['default_key', 'musical_key'] as const) {
    const alt = coerceMusicalKeyString(record[field])
    if (alt) return alt
  }

  const metaRoot = record.meta
  if (metaRoot && typeof metaRoot === 'object' && !Array.isArray(metaRoot)) {
    const mk = coerceMusicalKeyString((metaRoot as Record<string, unknown>).key)
    if (mk) return mk
  }

  const tags = record.tags
  if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
    for (const name of ['key', 'Key', 'KEY', 'kc'] as const) {
      if (!Object.prototype.hasOwnProperty.call(tags, name)) continue
      const v = coerceMusicalKeyString((tags as Record<string, unknown>)[name])
      if (v) return v
    }

    for (const [tagKey, tagVal] of Object.entries(tags)) {
      if (tagKey.toLowerCase() !== 'key') continue
      const v = coerceMusicalKeyString(tagVal)
      if (v) return v
    }
  }

  const fromSections = keyFromSongSections(record.sections)
  if (fromSections) return fromSections

  return deepScanMusicalKeyInSongData(data)
}

/** Walk nested `Song.data` JSON (bounded) for key-* fields or `{key: …}` ChordPro snippets in short strings. */
export function deepScanMusicalKeyInSongData(data: unknown): string | null {
  let steps = 0
  const seen = new WeakSet<object>()

  function walk(node: unknown, depth: number): string | null {
    if (++steps > 9000 || depth > 20 || node == null) return null

    if (typeof node === 'string') {
      if (node.length > 480) return null
      return chordProKeyDirectiveFromString(node)
    }

    if (typeof node !== 'object') return null

    if (seen.has(node as object)) return null
    seen.add(node as object)

    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item, depth + 1)
        if (hit) return hit
      }
      return null
    }

    const o = node as Record<string, unknown>
    for (const [prop, val] of Object.entries(o)) {
      if (isMusicalMetadataField(prop)) {
        const hit = coerceMusicalKeyString(val)
        if (hit) return hit
      }
    }

    for (const val of Object.values(o)) {
      const hit = walk(val, depth + 1)
      if (hit) return hit
    }

    return null
  }

  return walk(data, 0)
}

function isMusicalMetadataField(name: string): boolean {
  const l = name.toLowerCase()
  return (
    l === 'key' ||
    l === 'kc' ||
    l === 'level' ||
    l === 'musical_key' ||
    l === 'song_key' ||
    l === 'root_key' ||
    l === 'default_key' ||
    l === 'tonality'
  )
}

function chordProKeyDirectiveFromString(s: string): string | null {
  const m = /\{key\s*:\s*([^}]+)\}/i.exec(s)
  if (!m?.[1]) return null
  const token = (m[1].trim().split(/\s+/)[0] ?? '').trim()
  return coerceMusicalKeyString(token)
}

function sectionsAsBlocks(sections: unknown): unknown[] {
  if (sections == null) return []
  if (Array.isArray(sections)) return sections
  if (typeof sections === 'object') return Object.values(sections as Record<string, unknown>)
  return []
}

function keyFromSongSections(sections: unknown): string | null {
  for (const block of sectionsAsBlocks(sections)) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue
    const o = block as Record<string, unknown>
    const k = coerceMusicalKeyString(o.key)
    if (k) return k
    const meta = o.meta
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      const mk = coerceMusicalKeyString((meta as Record<string, unknown>).key)
      if (mk) return mk
    }
  }
  return null
}

/** Strip `nr` for setlist UX + PATCH payloads (order = array index). */
export function normalizeSongLinksForEditor(links: SongLink[] | null | undefined): EditorSongLink[] {
  return (links ?? []).map((l) => ({
    id: normalizeSongLinkId(l.id),
    key: coerceMusicalKeyString(l.key),
    tempo: normalizedTempoBpm(l.tempo),
    language: normalizeSongLinkLanguage(l.language),
    flow: normalizeSongFlow(l.flow),
  }))
}

/** Human slot number for collections; empty / whitespace → `null`. */
export function normalizeSongLinkNr(nr: unknown): string | null {
  if (nr == null) return null
  if (typeof nr === 'string') {
    const t = nr.trim()
    return t.length ? t : null
  }
  return null
}

/** Collection editor slots: coerce `key`, preserve **`nr`** (empty → `null`). */
export function normalizeSongLinksForCollectionEditor(links: SongLink[] | null | undefined): EditorSongLink[] {
  return (links ?? []).map((l) => ({
    id: normalizeSongLinkId(l.id),
    key: coerceMusicalKeyString(l.key),
    nr: normalizeSongLinkNr(l.nr),
    flow: normalizeSongFlow(l.flow),
  }))
}

/** One wire `SongLink` for collection PATCH bodies (`key` wire + `nr`). */
export function songLinkForCollectionMutation(link: EditorSongLink): SongLink {
  return {
    id: normalizeSongLinkId(link.id),
    key: songLinkKeyEditorToWire(link.key),
    nr: normalizeSongLinkNr(link.nr),
    flow: normalizeSongFlow(link.flow),
  }
}

export function moveIndex<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return [...arr]
  if (from < 0 || from >= arr.length) return [...arr]
  if (to < 0 || to >= arr.length) return [...arr]
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function insertAt<T>(arr: T[], index: number, item: T): T[] {
  if (index < 0 || index > arr.length) return [...arr]
  const next = [...arr]
  next.splice(index, 0, item)
  return next
}

export function removeAt<T>(arr: T[], index: number): T[] {
  if (index < 0 || index >= arr.length) return [...arr]
  const next = [...arr]
  next.splice(index, 1)
  return next
}

export function applyOptimisticReorder<T>(prev: T[], from: number, to: number): T[] {
  return moveIndex(prev, from, to)
}
