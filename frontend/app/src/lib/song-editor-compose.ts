import type { ChordFormatPreference } from '@/lib/chord-format'
import { composePoolSymbolToLetterChord } from '@/lib/song-editor-compose-pool'
import {
  beatsPerMeasureFromTimeSignature,
  isWireLineEmptyForExport,
  songEditorFormatOptions,
} from '@/lib/song-editor-state'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

export type ComposeChord = {
  id: string
  /** Character index in the lyric track where the chord applies. */
  position: number
  symbol: string
  /** Duration in milliclicks (1000 per beat); null = no explicit duration. */
  durationMillis: number | null
}

export type ComposeLine = {
  id: string
  text: string
  /** Parallel lyric text for language tracks 2..N (index i = song language i + 1). */
  translations?: string[]
  /** Chords on the primary lyric track. */
  chords: ComposeChord[]
  /** Chords per translation track (parallel to `translations`). */
  translationChords?: ComposeChord[][]
  /** Empty line rendered as a chord progression bar instead of a lyric field. */
  chordBar?: boolean
}

export type ComposeSection = {
  id: string
  title: string
  lines: ComposeLine[]
  repeatCount: number
}

type WirePart = {
  chord?: unknown
  languages?: string[]
  comment?: boolean
}

type WireLine = {
  parts?: WirePart[]
}

type WireSection = {
  title?: string
  lines?: WireLine[]
  repeat_count?: number | null
}

export function composeLineTrackText(line: Pick<ComposeLine, 'text' | 'translations'>, trackIndex: number): string {
  if (trackIndex === 0) return line.text
  return line.translations?.[trackIndex - 1] ?? ''
}

function hasExplicitComposeLineTrackChords(
  line: Pick<ComposeLine, 'translationChords'>,
  trackIndex: number,
): boolean {
  if (trackIndex < 1) return true
  const translationChords = line.translationChords
  if (translationChords == null) return false
  return trackIndex - 1 < translationChords.length
}

/** Lyric-track index: 0 = primary, 1+ = translation slots. */
export function composeLineChordsForTrack(line: ComposeLine, trackIndex: number): ComposeChord[] {
  if (trackIndex === 0) return line.chords
  const translationIndex = trackIndex - 1
  if (hasExplicitComposeLineTrackChords(line, trackIndex)) {
    return line.translationChords?.[translationIndex] ?? []
  }
  const translationText = line.translations?.[translationIndex] ?? ''
  if (translationText.trim().length > 0) {
    return line.chords
  }
  return []
}

export function findComposeLineChordTrackIndex(line: ComposeLine, chordId: string): number | null {
  if (line.chords.some((chord) => chord.id === chordId)) return 0
  for (let index = 0; index < (line.translationChords?.length ?? 0); index += 1) {
    if (line.translationChords?.[index]?.some((chord) => chord.id === chordId)) {
      return index + 1
    }
  }
  return null
}

/** Whether a pool drop should create a chord-bar segment instead of a lyric-track chord. */
export function isComposeLineChordBarTarget(line: ComposeLine, trackIndex: number): boolean {
  if (trackIndex !== 0) return false
  if (isComposeChordBarRow(line)) return true
  if (line.text.trim().length > 0 || composeLineHasTranslationContent(line)) return false
  return line.chords.length === 0
}

export function updateComposeLineChordsForTrack(
  line: ComposeLine,
  trackIndex: number,
  chords: ComposeChord[],
): ComposeLine {
  if (trackIndex === 0) return { ...line, chords }

  const translationIndex = trackIndex - 1
  const translations = [...(line.translations ?? [])]
  const translationChords = [...(line.translationChords ?? [])]
  while (translations.length <= translationIndex) {
    translations.push('')
  }
  while (translationChords.length <= translationIndex) {
    translationChords.push([])
  }
  translationChords[translationIndex] = chords
  return { ...line, translations, translationChords }
}

export function clampComposeLineTrackChords(
  chords: ComposeChord[],
  textLength: number,
): ComposeChord[] {
  return chords.map((chord) => ({
    ...chord,
    position: clampChordPosition(chord.position, textLength),
  }))
}

export function createComposeChordForLineTrack(
  symbol: string,
  trackIndex: number,
  position: number,
  line: Pick<ComposeLine, 'text' | 'translations'>,
  id = crypto.randomUUID(),
  durationMillis: number | null = null,
): ComposeChord {
  const text = composeLineTrackText(line, trackIndex)
  return createComposeChord(symbol, clampChordPosition(position, text.length), id, durationMillis)
}

function clampComposeLineChordPositions(line: ComposeLine): ComposeLine {
  const chords = clampComposeLineTrackChords(line.chords, line.text.length)
  const translationCount = line.translations?.length ?? 0
  const translationChords = Array.from({ length: translationCount }, (_, index) =>
    clampComposeLineTrackChords(
      line.translationChords?.[index] ?? [],
      line.translations?.[index]?.length ?? 0,
    ),
  )

  const chordsUnchanged =
    chords.length === line.chords.length &&
    chords.every(
      (chord, index) =>
        chord.id === line.chords[index]?.id && chord.position === line.chords[index]?.position,
    )
  const translationUnchanged =
    translationCount === (line.translationChords?.length ?? 0) &&
    translationChords.every((trackChords, trackIndex) => {
      const previous = line.translationChords?.[trackIndex] ?? []
      return (
        trackChords.length === previous.length &&
        trackChords.every(
          (chord, index) =>
            chord.id === previous[index]?.id && chord.position === previous[index]?.position,
        )
      )
    })

  if (chordsUnchanged && translationUnchanged) return line
  const keepTranslationChords =
    line.translationChords != null || translationChords.some((trackChords) => trackChords.length > 0)
  return {
    ...line,
    chords,
    ...(translationCount > 0 && keepTranslationChords ? { translationChords } : {}),
  }
}

export function wireChordDurationMillis(chord: unknown): number | null {
  if (!chord || typeof chord !== 'object' || !('duration' in chord)) return null
  const duration = (chord as { duration?: unknown }).duration
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    return Math.round(duration)
  }
  return null
}

export function formatComposeChordDurationBeats(durationMillis: number): string {
  const beats = durationMillis / 1000
  if (Math.abs(beats - Math.round(beats)) < 1e-9) {
    return String(Math.round(beats))
  }
  return String(beats)
}

export function parseComposeChordDurationBeats(input: string): number | null {
  const trimmed = input.trim().replace(',', '.')
  if (!trimmed) return null
  const beats = Number.parseFloat(trimmed)
  if (!Number.isFinite(beats) || beats <= 0) return null
  return Math.round(beats * 1000)
}

export function parseFormattedChordToken(token: string): {
  symbol: string
  durationMillis: number | null
} {
  const match = /:(\d+(?:[.,]\d+)?)$/.exec(token)
  if (!match) return { symbol: token, durationMillis: null }
  const beats = Number.parseFloat(match[1]!.replace(',', '.'))
  if (!Number.isFinite(beats) || beats <= 0) return { symbol: token, durationMillis: null }
  return {
    symbol: token.slice(0, match.index),
    durationMillis: Math.round(beats * 1000),
  }
}

export function composeChordDisplayLabel(chord: Pick<ComposeChord, 'symbol' | 'durationMillis'>): string {
  const symbol = chord.symbol.trim()
  if (!symbol) return ''
  if (!chord.durationMillis) return symbol
  return `${symbol}:${formatComposeChordDurationBeats(chord.durationMillis)}`
}

/** Line has chords but no lyric text (intro / progression rows). */
export function isComposeChordOnlyLine(line: Pick<ComposeLine, 'text' | 'chords'>): boolean {
  return line.chords.length > 0 && line.text.trim().length === 0
}

/** Line shown as the chord progression bar row (with or without chords yet). */
export function isComposeChordBarRow(line: ComposeLine): boolean {
  if (line.text.trim().length > 0 || composeLineHasTranslationContent(line)) return false
  if (isComposeChordOnlyLine(line)) return true
  return line.chordBar === true
}

/** Placeholder lyric row with no text, translations, or exportable chords. */
export function isComposeLineEmptyForExport(line: ComposeLine): boolean {
  if (line.text.trim().length > 0) return false
  if (composeLineHasTranslationContent(line)) return false
  if (line.chords.some((chord) => isComposeBarDisplayChord(chord))) return false
  return !(line.translationChords ?? []).some((track) =>
    track.some((chord) => isComposeBarDisplayChord(chord)),
  )
}

export function convertComposeLineToChordBar(line: ComposeLine): ComposeLine {
  return normalizeChordOnlyLine({
    ...line,
    text: '',
    translations: undefined,
    translationChords: undefined,
    chordBar: true,
  })
}

export function sortedComposeLineChords(line: Pick<ComposeLine, 'chords'>): ComposeChord[] {
  return [...line.chords].sort((a, b) => a.position - b.position)
}

export function normalizeChordOnlyLine(line: ComposeLine, orderedChords?: ComposeChord[]): ComposeLine {
  const chords = (orderedChords ?? sortedComposeLineChords(line)).map((chord, index) => ({
    ...chord,
    position: index,
  }))
  return {
    ...line,
    text: '',
    chords,
  }
}

/** Flex weight for a chord bar segment; unset duration means one full bar. */
export function composeChordBarWeight(
  durationMillis: number | null | undefined,
  timeSignature: string,
): number {
  if (durationMillis && durationMillis > 0) return durationMillis
  return composeDefaultBarDurationMillis(timeSignature)
}

export const COMPOSE_BEAT_MILLIS = 1000
export const COMPOSE_BAR_MIN_DURATION_MILLIS = COMPOSE_BEAT_MILLIS
export const COMPOSE_BAR_SNAP_MILLIS = COMPOSE_BEAT_MILLIS
/** Placeholder segments that reserve empty bars on the chord grid (hidden in UI, omitted on export). */
export const COMPOSE_BAR_HOLD_SYMBOL = '%%'

export function isComposeBarHoldSymbol(symbol: string): boolean {
  return symbol === COMPOSE_BAR_HOLD_SYMBOL
}

export function isComposeBarDisplayChord(chord: Pick<ComposeChord, 'symbol'>): boolean {
  return chord.symbol.trim().length > 0 && !isComposeBarHoldSymbol(chord.symbol)
}

export function snapComposeBarDurationMillis(durationMillis: number): number {
  return Math.round(durationMillis / COMPOSE_BAR_SNAP_MILLIS) * COMPOSE_BAR_SNAP_MILLIS
}

export function composeBarTotalWeight(weights: number[]): number {
  return weights.reduce((sum, weight) => sum + weight, 0)
}

/** Visible measure columns; starts at one bar and grows when chords exceed the grid. */
export function composeChordBarMeasureCount(
  totalWeightMillis: number,
  timeSignature: string,
): number {
  const beatsPerMeasure = beatsPerMeasureFromTimeSignature(timeSignature) ?? 4
  const measureMillis = beatsPerMeasure * COMPOSE_BEAT_MILLIS
  if (totalWeightMillis <= 0) return 1
  return Math.max(1, Math.ceil(totalWeightMillis / measureMillis))
}

/** Minimum visible measure columns on every chord bar row (four-bar progression box). */
export const COMPOSE_CHORD_BAR_DISPLAY_MEASURE_COUNT = 4

export function composeChordBarDisplayMeasureCount(
  totalWeightMillis: number,
  timeSignature: string,
): number {
  if (totalWeightMillis <= 0) {
    return COMPOSE_CHORD_BAR_DISPLAY_MEASURE_COUNT
  }
  return composeChordBarMeasureCount(totalWeightMillis, timeSignature)
}

/** Total timeline width of a chord-only bar row for the current chord content. */
export function composeChordBarGridMillis(totalWeightMillis: number, timeSignature: string): number {
  const beatsPerMeasure = beatsPerMeasureFromTimeSignature(timeSignature) ?? 4
  const measureMillis = beatsPerMeasure * COMPOSE_BEAT_MILLIS
  return composeChordBarMeasureCount(totalWeightMillis, timeSignature) * measureMillis
}

/** Timeline width of the visible chord bar grid (four bars when empty, otherwise fits content). */
export function composeChordBarDisplayGridMillis(
  totalWeightMillis: number,
  timeSignature: string,
): number {
  const beatsPerMeasure = beatsPerMeasureFromTimeSignature(timeSignature) ?? 4
  const measureMillis = beatsPerMeasure * COMPOSE_BEAT_MILLIS
  return composeChordBarDisplayMeasureCount(totalWeightMillis, timeSignature) * measureMillis
}

export function composeBarSegmentLayout(
  weights: number[],
  timeSignature: string,
  gridMillisOverride?: number,
): Array<{ offsetPercent: number; widthPercent: number }> {
  const gridMillis =
    gridMillisOverride ??
    composeChordBarDisplayGridMillis(composeBarTotalWeight(weights), timeSignature)
  if (gridMillis <= 0 || weights.length === 0) return []

  let offsetMillis = 0
  return weights.map((weight) => {
    const layout = {
      offsetPercent: (offsetMillis / gridMillis) * 100,
      widthPercent: (weight / gridMillis) * 100,
    }
    offsetMillis += weight
    return layout
  })
}

export function composeBarBoundaryPercent(
  weights: number[],
  boundaryIndex: number,
  timeSignature: string,
  gridMillisOverride?: number,
): number {
  const gridMillis =
    gridMillisOverride ??
    composeChordBarDisplayGridMillis(composeBarTotalWeight(weights), timeSignature)
  if (gridMillis <= 0) return 0

  const before = weights.slice(0, boundaryIndex + 1).reduce((sum, weight) => sum + weight, 0)
  return (before / gridMillis) * 100
}

export function composeBarInsertMarkerPercent(
  insertIndex: number,
  chordCount: number,
  weights: number[],
  timeSignature: string,
  pointerMillis: number | null = null,
): number {
  const totalWeight = composeBarTotalWeight(weights)
  const displayGridMillis = composeChordBarDisplayGridMillis(totalWeight, timeSignature)
  if (displayGridMillis <= 0) return 0

  if (chordCount <= 0) {
    const displayMeasures = composeChordBarDisplayMeasureCount(totalWeight, timeSignature)
    const barSlot = Math.max(0, Math.min(displayMeasures - 1, insertIndex))
    return ((barSlot + 0.5) / displayMeasures) * 100
  }

  if (insertIndex >= chordCount) {
    const snappedPointer =
      pointerMillis != null
        ? snapComposeBarDurationMillis(Math.max(totalWeight, Math.min(displayGridMillis, pointerMillis)))
        : totalWeight
    return (snappedPointer / displayGridMillis) * 100
  }

  const before = weights.slice(0, Math.max(0, Math.min(insertIndex, weights.length))).reduce(
    (sum, weight) => sum + weight,
    0,
  )
  return (before / displayGridMillis) * 100
}

/** Duration a newly inserted bar chord would receive at the given insert index. */
export function composeBarInsertPreviewDurationMillis(
  insertIndex: number,
  chordCount: number,
  weights: number[],
  timeSignature: string,
): number {
  const defaultBarDuration = composeDefaultBarDurationMillis(timeSignature)
  if (chordCount <= 0) return defaultBarDuration
  if (insertIndex >= chordCount) {
    return composeBarAppendDurationMillis(weights, timeSignature) ?? defaultBarDuration
  }
  return defaultBarDuration
}

/** Timeline weights after virtually inserting a preview chord at the given index. */
export function composeBarInsertPreviewWeights(
  weights: number[],
  insertIndex: number,
  timeSignature: string,
): number[] | null {
  if (insertIndex < 0) return null

  const chordCount = weights.length
  const previewDuration = composeBarInsertPreviewDurationMillis(
    insertIndex,
    chordCount,
    weights,
    timeSignature,
  )
  if (previewDuration <= 0) return null

  const defaultBarDuration = composeDefaultBarDurationMillis(timeSignature)
  if (chordCount <= 0) {
    const padded = Array.from({ length: insertIndex }, () => defaultBarDuration)
    padded.push(previewDuration)
    return padded
  }

  if (insertIndex >= chordCount) {
    return [...weights, previewDuration]
  }

  const next = [...weights]
  next.splice(insertIndex, 0, previewDuration)
  return next
}

/** Segment layout for a virtual chord insert, including the preview slot index. */
export function composeBarInsertPreviewSegmentLayout(
  weights: number[],
  insertIndex: number,
  timeSignature: string,
): {
  previewIndex: number
  layouts: Array<{ offsetPercent: number; widthPercent: number }>
} | null {
  if (insertIndex < 0) return null

  if (weights.length <= 0) {
    const defaultBarDuration = composeDefaultBarDurationMillis(timeSignature)
    const displayGridMillis = composeChordBarDisplayGridMillis(0, timeSignature)
    const displayMeasures = composeChordBarDisplayMeasureCount(0, timeSignature)
    const barSlot = Math.max(0, Math.min(displayMeasures - 1, insertIndex))
    return {
      previewIndex: 0,
      layouts: [
        {
          offsetPercent: (barSlot / displayMeasures) * 100,
          widthPercent: (defaultBarDuration / displayGridMillis) * 100,
        },
      ],
    }
  }

  const previewWeights = composeBarInsertPreviewWeights(weights, insertIndex, timeSignature)
  if (!previewWeights) return null

  const previewIndex = insertIndex >= weights.length ? previewWeights.length - 1 : insertIndex
  const layouts = composeBarSegmentLayout(previewWeights, timeSignature)
  if (previewIndex < 0 || previewIndex >= layouts.length) return null

  return { previewIndex, layouts }
}

/** Default duration for a chord appended into the unfilled tail of the display grid. */
export function composeBarAppendDurationMillis(
  weights: number[],
  timeSignature: string,
): number | null {
  const totalWeight = composeBarTotalWeight(weights)
  const displayGridMillis = composeChordBarDisplayGridMillis(totalWeight, timeSignature)
  const defaultBarDuration = composeDefaultBarDurationMillis(timeSignature)
  const tailMillis = displayGridMillis - totalWeight
  if (tailMillis <= 0) return null

  const beatsPerMeasure = beatsPerMeasureFromTimeSignature(timeSignature) ?? 4
  const measureMillis = beatsPerMeasure * COMPOSE_BEAT_MILLIS
  const offsetInMeasure = totalWeight % measureMillis
  const remainingInMeasure =
    offsetInMeasure === 0 ? defaultBarDuration : measureMillis - offsetInMeasure
  const duration = Math.min(defaultBarDuration, remainingInMeasure, tailMillis)

  return Math.max(COMPOSE_BAR_MIN_DURATION_MILLIS, snapComposeBarDurationMillis(duration))
}

/** Adjust only the left bar duration; the right bar keeps its length. */
export function resizeComposeBarDuration(
  weight: number,
  deltaMillis: number,
  minDurationMillis = COMPOSE_BAR_MIN_DURATION_MILLIS,
): number {
  return Math.max(minDurationMillis, snapComposeBarDurationMillis(weight + deltaMillis))
}

export function resizeAdjacentComposeBarDurations(
  leftWeight: number,
  rightWeight: number,
  deltaMillis: number,
  minDurationMillis = COMPOSE_BAR_MIN_DURATION_MILLIS,
): { leftDurationMillis: number; rightDurationMillis: number } {
  return {
    leftDurationMillis: resizeComposeBarDuration(leftWeight, deltaMillis, minDurationMillis),
    rightDurationMillis: rightWeight,
  }
}

export function composeBarWeightsFromChords(
  chords: ComposeChord[],
  timeSignature: string,
  durationOverrides?: Readonly<Record<string, number>>,
): number[] {
  return chords.map((chord) => {
    const override = durationOverrides?.[chord.id]
    if (override != null) return override
    return composeChordBarWeight(chord.durationMillis, timeSignature)
  })
}

export function composeChordOnlyLineTotalMillis(
  line: Pick<ComposeLine, 'text' | 'chords'>,
  timeSignature: string,
): number {
  return sortedComposeLineChords(line).reduce(
    (sum, chord) => sum + composeChordBarWeight(chord.durationMillis, timeSignature),
    0,
  )
}

/** Chord-only rows always span the full dynamic measure grid. */
export function composeChordBarRowWidthPercent(
  line: Pick<ComposeLine, 'id' | 'text' | 'chords'>,
  sectionLines: ReadonlyArray<Pick<ComposeLine, 'id' | 'text' | 'chords'>>,
  timeSignature: string,
): number {
  void line
  void sectionLines
  void timeSignature
  return 100
}

export function composeChordOnlyLineMeasureMismatch(
  line: ComposeLine,
  timeSignature: string,
): { totalBeats: string; beatsPerMeasure: number; timeSignature: string } | null {
  if (!isComposeChordOnlyLine(line)) return null

  const beatsPerMeasure = beatsPerMeasureFromTimeSignature(timeSignature)
  if (beatsPerMeasure == null) return null

  const totalMillis = composeChordOnlyLineTotalMillis(line, timeSignature)
  if (totalMillis <= 0) return null

  const measureMillis = beatsPerMeasure * 1000
  if (totalMillis % measureMillis === 0) return null

  return {
    totalBeats: formatComposeChordDurationBeats(totalMillis),
    beatsPerMeasure,
    timeSignature,
  }
}

/** Map a pointer x coordinate to an insert index between bar segments (0..chordCount). */
export function positionFromBarPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number,
  chordCount: number,
  weights: number[],
  timeSignature: string,
): number {
  if (containerWidth <= 0) return 0

  const totalWeight = composeBarTotalWeight(weights)
  const displayGridMillis = composeChordBarDisplayGridMillis(totalWeight, timeSignature)
  if (displayGridMillis <= 0) return 0

  const relativeX = Math.max(0, Math.min(containerWidth, clientX - containerLeft))
  const pointerMillis = snapComposeBarDurationMillis((relativeX / containerWidth) * displayGridMillis)
  const measureMillis = composeDefaultBarDurationMillis(timeSignature)

  if (chordCount <= 0) {
    const displayMeasures = composeChordBarDisplayMeasureCount(totalWeight, timeSignature)
    return Math.max(
      0,
      Math.min(displayMeasures - 1, Math.floor(pointerMillis / measureMillis)),
    )
  }

  let accumulated = 0
  for (let index = 0; index < chordCount; index += 1) {
    const weight = weights[index]!
    const midpoint = accumulated + weight / 2
    if (pointerMillis < midpoint) return index
    accumulated += weight
  }

  return chordCount
}

/** Default duration for a newly placed chord bar segment (one full bar). */
export function composeDefaultBarDurationMillis(timeSignature: string): number {
  const beatsPerMeasure = beatsPerMeasureFromTimeSignature(timeSignature)
  return (beatsPerMeasure ?? 4) * 1000
}

/** Whether a stored duration equals one full bar for the song time signature. */
export function isComposeFullBarDuration(
  durationMillis: number | null | undefined,
  timeSignature: string,
): boolean {
  if (!durationMillis || durationMillis <= 0) return true
  return durationMillis === composeDefaultBarDurationMillis(timeSignature)
}

/** Duration to emit in ChordPro wire parts; omits explicit length for one full bar. */
export function composeChordDurationForWire(
  durationMillis: number | null | undefined,
  timeSignature: string,
): number | null {
  if (isComposeFullBarDuration(durationMillis, timeSignature)) return null
  return durationMillis && durationMillis > 0 ? durationMillis : null
}

export function addComposeChordAtIndex(
  line: ComposeLine,
  symbol: string,
  index: number,
  durationMillis: number | null = null,
  timeSignature = '4/4',
): ComposeLine {
  const sorted = sortedComposeLineChords(line)
  const targetIndex = Math.max(0, index)
  const defaultBarDuration = composeDefaultBarDurationMillis(timeSignature)

  while (sorted.length < targetIndex) {
    sorted.push(
      createComposeChord(
        COMPOSE_BAR_HOLD_SYMBOL,
        sorted.length,
        crypto.randomUUID(),
        defaultBarDuration,
      ),
    )
  }

  const isAppend = targetIndex >= sorted.length
  const nextDuration =
    durationMillis ??
    (isAppend
      ? composeBarAppendDurationMillis(
          composeBarWeightsFromChords(sorted, timeSignature),
          timeSignature,
        )
      : null)

  sorted.splice(
    targetIndex,
    0,
    createComposeChord(symbol, targetIndex, crypto.randomUUID(), nextDuration),
  )
  return normalizeChordOnlyLine(line, sorted)
}

export function moveComposeChordToIndex(line: ComposeLine, chordId: string, index: number): ComposeLine {
  const sorted = sortedComposeLineChords(line)
  const fromIndex = sorted.findIndex((chord) => chord.id === chordId)
  if (fromIndex < 0) return line

  const [moved] = sorted.splice(fromIndex, 1)
  if (!moved) return line

  let target = Math.max(0, Math.min(index, sorted.length))
  if (fromIndex < target) target -= 1
  sorted.splice(target, 0, moved)
  return normalizeChordOnlyLine(line, sorted)
}

export function createComposeLine(
  text = '',
  id: string = crypto.randomUUID(),
  translationCount = 0,
): ComposeLine {
  return {
    id,
    text,
    translations: Array.from({ length: translationCount }, () => ''),
    chords: [],
    ...(translationCount > 0
      ? { translationChords: Array.from({ length: translationCount }, () => []) }
      : {}),
  }
}

export function splitPasteIntoLineSegments(pastedText: string): string[] | null {
  if (!/[\r\n]/.test(pastedText)) return null
  return pastedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function sumPasteSegmentLengths(segments: string[], endExclusive: number): number {
  let total = 0
  for (let index = 0; index < endExclusive; index += 1) {
    total += segments[index]?.length ?? 0
  }
  return total
}

function remapTrackChordsAfterPasteReplace(
  chords: ComposeChord[],
  selectionStart: number,
  selectionEnd: number,
  pastedLength: number,
): ComposeChord[] {
  const delta = pastedLength - (selectionEnd - selectionStart)
  return chords
    .filter((chord) => chord.position < selectionStart || chord.position >= selectionEnd)
    .map((chord) => ({
      ...chord,
      position: chord.position < selectionStart ? chord.position : chord.position + delta,
    }))
}

function extractTrackChordsForSegment(
  chords: ComposeChord[],
  segmentStart: number,
  segmentEnd: number,
): ComposeChord[] {
  return chords
    .filter((chord) => chord.position >= segmentStart && chord.position < segmentEnd)
    .map((chord) => ({ ...chord, position: chord.position - segmentStart }))
}

function composeLineTextForPasteSegment(
  originalText: string,
  pastedTrackIndex: number,
  trackIndex: number,
  selectionStart: number,
  selectionEnd: number,
  segments: string[],
  lineIndex: number,
): string {
  const before = originalText.slice(0, selectionStart)
  const after = originalText.slice(selectionEnd)
  const lineCount = segments.length

  if (trackIndex === pastedTrackIndex) {
    if (lineIndex === 0) return before + (segments[0] ?? '')
    if (lineIndex === lineCount - 1) return (segments[lineIndex] ?? '') + after
    return segments[lineIndex] ?? ''
  }

  if (lineIndex === 0) return before
  if (lineIndex === lineCount - 1) return after
  return ''
}

function composeLineChordBoundsForPasteSegment(
  originalText: string,
  pastedTrackIndex: number,
  trackIndex: number,
  selectionStart: number,
  selectionEnd: number,
  segments: string[],
  lineIndex: number,
): { start: number; end: number } {
  const lineCount = segments.length
  const pastedLength = sumPasteSegmentLengths(segments, segments.length)

  if (trackIndex === pastedTrackIndex) {
    const virtualLength = selectionStart + pastedLength + originalText.length - selectionEnd
    const start =
      lineIndex === 0 ? 0 : selectionStart + sumPasteSegmentLengths(segments, lineIndex)
    const end =
      lineIndex === lineCount - 1
        ? virtualLength
        : selectionStart + sumPasteSegmentLengths(segments, lineIndex + 1)
    return { start, end }
  }

  if (lineIndex === 0) return { start: 0, end: selectionStart }
  if (lineIndex === lineCount - 1) return { start: selectionEnd, end: originalText.length }
  return { start: selectionStart, end: selectionStart }
}

/** Split one compose line into multiple rows when pasting multi-line clipboard text. */
export function buildComposeLinesFromPaste(
  line: ComposeLine,
  pastedTrackIndex: number,
  selectionStart: number,
  selectionEnd: number,
  pastedText: string,
): { lines: ComposeLine[]; focusLineId: string } | null {
  const segments = splitPasteIntoLineSegments(pastedText)
  if (!segments || segments.length <= 1) return null

  const translationCount = line.translations?.length ?? 0
  const trackCount = translationCount + 1
  if (pastedTrackIndex < 0 || pastedTrackIndex >= trackCount) return null

  const pastedLength = sumPasteSegmentLengths(segments, segments.length)
  const focusLineId = crypto.randomUUID()
  const lines: ComposeLine[] = []

  for (let lineIndex = 0; lineIndex < segments.length; lineIndex += 1) {
    const text = composeLineTextForPasteSegment(
      line.text,
      pastedTrackIndex,
      0,
      selectionStart,
      selectionEnd,
      segments,
      lineIndex,
    )
    const translations = Array.from({ length: translationCount }, (_, trackIndex) =>
      composeLineTextForPasteSegment(
        line.translations?.[trackIndex] ?? '',
        pastedTrackIndex,
        trackIndex + 1,
        selectionStart,
        selectionEnd,
        segments,
        lineIndex,
      ),
    )
    const primaryBounds = composeLineChordBoundsForPasteSegment(
      line.text,
      pastedTrackIndex,
      0,
      selectionStart,
      selectionEnd,
      segments,
      lineIndex,
    )
    const chords = extractTrackChordsForSegment(
      pastedTrackIndex === 0
        ? remapTrackChordsAfterPasteReplace(line.chords, selectionStart, selectionEnd, pastedLength)
        : line.chords,
      primaryBounds.start,
      primaryBounds.end,
    )
    const translationChords =
      translationCount > 0
        ? Array.from({ length: translationCount }, (_, trackIndex) => {
            const originalText = line.translations?.[trackIndex] ?? ''
            const trackChords = line.translationChords?.[trackIndex] ?? []
            const { start, end } = composeLineChordBoundsForPasteSegment(
              originalText,
              pastedTrackIndex,
              trackIndex + 1,
              selectionStart,
              selectionEnd,
              segments,
              lineIndex,
            )
            const remapped =
              pastedTrackIndex === trackIndex + 1
                ? remapTrackChordsAfterPasteReplace(
                    trackChords,
                    selectionStart,
                    selectionEnd,
                    pastedLength,
                  )
                : trackChords
            return extractTrackChordsForSegment(remapped, start, end)
          })
        : undefined

    const nextLine = clampComposeLineChordPositions({
      id: lineIndex === segments.length - 1 ? focusLineId : crypto.randomUUID(),
      text,
      ...(translationCount > 0 ? { translations, translationChords } : {}),
      chords,
    })
    lines.push(nextLine)
  }

  lines[0] = { ...lines[0]!, id: line.id }
  return { lines, focusLineId }
}

/** Ensure `translations` length matches the number of non-primary language tracks. */
export function normalizeComposeLineForLanguageTracks(
  line: ComposeLine,
  languageTrackCount: number,
): ComposeLine {
  const translationCount = Math.max(0, languageTrackCount - 1)
  const translations = [...(line.translations ?? [])]
  while (translations.length < translationCount) translations.push('')
  if (translations.length > translationCount) translations.length = translationCount

  const translationChords = [...(line.translationChords ?? [])]
  while (translationChords.length < translationCount) translationChords.push([])
  if (translationChords.length > translationCount) translationChords.length = translationCount

  const previousTranslations = line.translations ?? []
  const previousTranslationChords = line.translationChords ?? []
  const unchanged =
    previousTranslations.length === translations.length &&
    previousTranslations.every((value, index) => value === translations[index]) &&
    previousTranslationChords.length === translationChords.length &&
    previousTranslationChords.every(
      (trackChords, index) => trackChords === translationChords[index],
    )

  return unchanged
    ? line
    : clampComposeLineChordPositions({ ...line, translations, translationChords })
}

function wireLineLanguageTrackCount(line: WireLine): number {
  const parts = Array.isArray(line.parts) ? line.parts : []
  return parts.reduce((max, part) => Math.max(max, part.languages?.length ?? 0), 0)
}

function wireLinePrimaryText(line: WireLine): string {
  const parts = Array.isArray(line.parts) ? line.parts : []
  return parts.reduce((text, part) => `${text}${part.languages?.[0] ?? ''}`, '')
}

function isTranslationOnlyWireLine(line: WireLine): boolean {
  const parts = Array.isArray(line.parts) ? line.parts : []
  if (!parts.length) return false
  const primaryText = wireLinePrimaryText(line).trim()
  if (primaryText.length > 0) return false
  return parts.some((part) => (part.languages?.slice(1) ?? []).some((segment) => segment.trim().length > 0))
}

function mergePrimaryAndTranslationComposeLines(
  primary: ComposeLine,
  translation: ComposeLine,
): ComposeLine {
  const mergedTranslations = [...(primary.translations ?? [])]
  for (let index = 0; index < (translation.translations?.length ?? 0); index += 1) {
    while (mergedTranslations.length <= index) mergedTranslations.push('')
    const next = translation.translations?.[index]?.trim()
    if (next) mergedTranslations[index] = translation.translations?.[index] ?? ''
  }

  const mergedTranslationChords = [...(primary.translationChords ?? [])]
  for (let index = 0; index < (translation.translations?.length ?? 0); index += 1) {
    while (mergedTranslationChords.length <= index) mergedTranslationChords.push([])
    const fromTranslationTrack = translation.translationChords?.[index] ?? []
    const fromCompanionPrimary =
      index === 0 && !translation.text.trim() ? translation.chords : []
    const nextChords = fromTranslationTrack.length > 0 ? fromTranslationTrack : fromCompanionPrimary
    if (nextChords.length > 0) mergedTranslationChords[index] = nextChords
  }

  return clampComposeLineChordPositions({
    ...primary,
    translations: mergedTranslations.length ? mergedTranslations : primary.translations,
    translationChords: mergedTranslationChords.length ? mergedTranslationChords : primary.translationChords,
  })
}

function composeTrackChordsCompatible(
  primary: ComposeChord[],
  translation: ComposeChord[],
  timeSignature: string,
): boolean {
  if (translation.length === 0) return true

  const primarySorted = sortedComposeLineChords({ chords: primary }).filter((chord) => chord.symbol.trim())
  const translationSorted = sortedComposeLineChords({ chords: translation }).filter((chord) =>
    chord.symbol.trim(),
  )
  if (primarySorted.length !== translationSorted.length) return false

  return primarySorted.every((chord, index) => {
    const other = translationSorted[index]
    if (!other) return false
    if (chord.symbol.trim() !== other.symbol.trim()) return false
    return (
      composeChordDurationForWire(chord.durationMillis, timeSignature) ===
      composeChordDurationForWire(other.durationMillis, timeSignature)
    )
  })
}

export function composeTranslationTrackChordsMismatch(
  line: Pick<ComposeLine, 'chords' | 'translations' | 'translationChords'>,
  trackIndex: number,
  timeSignature: string,
): boolean {
  if (trackIndex < 1) return false
  const translationText = line.translations?.[trackIndex - 1] ?? ''
  if (!translationText.trim()) return false

  const primaryChords = sortedComposeLineChords({ chords: line.chords }).filter((chord) =>
    chord.symbol.trim(),
  )
  if (primaryChords.length === 0) return false

  if (!hasExplicitComposeLineTrackChords(line, trackIndex)) return false

  const translationChords = line.translationChords?.[trackIndex - 1] ?? []
  const translationChordsWithSymbols = sortedComposeLineChords({ chords: translationChords }).filter(
    (chord) => chord.symbol.trim(),
  )
  if (translationChordsWithSymbols.length === 0) return true

  return !composeTrackChordsCompatible(line.chords, translationChords, timeSignature)
}

export function createComposeChord(
  symbol = 'C',
  position = 0,
  id = crypto.randomUUID(),
  durationMillis: number | null = null,
): ComposeChord {
  return { id, position, symbol, durationMillis }
}

export function composeLineHasTranslationContent(line: Pick<ComposeLine, 'translations'>): boolean {
  return (line.translations ?? []).some((translation) => translation.trim().length > 0)
}

/** Language tracks to emit for a line; omits translation slots when every translation is blank. */
export function composeLineEffectiveLanguageTrackCount(
  line: Pick<ComposeLine, 'translations'>,
  songLanguageTrackCount: number,
): number {
  if (songLanguageTrackCount <= 1) return 1
  return composeLineHasTranslationContent(line) ? songLanguageTrackCount : 1
}

function partLanguagesForTrackSlice(
  line: ComposeLine,
  starts: number[],
  ends: number[],
  languageTrackCount: number,
): string[] {
  const languages: string[] = []
  for (let trackIndex = 0; trackIndex < languageTrackCount; trackIndex += 1) {
    const text = composeLineTrackText(line, trackIndex)
    const start = clampChordPosition(starts[trackIndex] ?? 0, text.length)
    const end = clampChordPosition(ends[trackIndex] ?? text.length, text.length)
    languages.push(text.slice(Math.min(start, end), Math.max(start, end)))
  }
  return languages
}

function emptyPartLanguages(languageTrackCount: number): string[] {
  return Array.from({ length: Math.max(1, languageTrackCount) }, () => '')
}

export function createComposeChordOnlyLine(
  symbol: string,
  lineId = crypto.randomUUID(),
  durationMillis: number | null = null,
): ComposeLine {
  return normalizeChordOnlyLine({ id: lineId, text: '', chords: [] }, [
    createComposeChord(symbol, 0, crypto.randomUUID(), durationMillis),
  ])
}

export function findComposeLineInSections(
  sections: ComposeSection[],
  lineId: string,
): { sectionIndex: number; lineIndex: number } | null {
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const lineIndex = sections[sectionIndex]!.lines.findIndex((line) => line.id === lineId)
    if (lineIndex >= 0) return { sectionIndex, lineIndex }
  }
  return null
}

export function insertComposeLineAfter(
  sections: ComposeSection[],
  afterLineId: string,
  newLine: ComposeLine,
): ComposeSection[] {
  const found = findComposeLineInSections(sections, afterLineId)
  if (!found) return sections

  return sections.map((section, sectionIndex) => {
    if (sectionIndex !== found.sectionIndex) return section
    const lines = [...section.lines]
    lines.splice(found.lineIndex + 1, 0, newLine)
    return { ...section, lines }
  })
}

export function moveComposeChordToLineAfter(
  sections: ComposeSection[],
  afterLineId: string,
  sourceLineId: string,
  chordId: string,
): ComposeSection[] {
  const foundAfter = findComposeLineInSections(sections, afterLineId)
  const foundSource = findComposeLineInSections(sections, sourceLineId)
  if (!foundAfter || !foundSource) return sections
  if (foundAfter.sectionIndex !== foundSource.sectionIndex) return sections

  const section = sections[foundAfter.sectionIndex]!
  const sourceLine = section.lines[foundSource.lineIndex]!
  const chord = sourceLine.chords.find((item) => item.id === chordId)
  if (!chord) return sections

  const remainingChords = sourceLine.chords.filter((item) => item.id !== chordId)
  const updatedSourceLine = isComposeChordOnlyLine(sourceLine)
    ? remainingChords.length === 0
      ? { ...sourceLine, text: '', chords: [] }
      : normalizeChordOnlyLine(sourceLine, remainingChords)
    : { ...sourceLine, chords: remainingChords }

  const newLine = normalizeChordOnlyLine({ id: crypto.randomUUID(), text: '', chords: [] }, [
    { ...chord, position: 0 },
  ])

  return sections.map((item, sectionIndex) => {
    if (sectionIndex !== foundAfter.sectionIndex) return item
    const lines = item.lines.map((line, lineIndex) =>
      lineIndex === foundSource.lineIndex ? updatedSourceLine : line,
    )
    lines.splice(foundAfter.lineIndex + 1, 0, newLine)
    return { ...item, lines }
  })
}

export function duplicateComposeChordInLine(
  line: ComposeLine,
  sourceTrackIndex: number,
  chordId: string,
  targetTrackIndex: number,
  position: number,
): ComposeLine {
  const sourceChord = composeLineChordsForTrack(line, sourceTrackIndex).find(
    (chord) => chord.id === chordId,
  )
  if (!sourceChord) return line

  if (isComposeLineChordBarTarget(line, sourceTrackIndex)) {
    return addComposeChordAtIndex(line, sourceChord.symbol, position, sourceChord.durationMillis)
  }

  const clampedPosition = clampChordPosition(
    position,
    composeLineTrackText(line, targetTrackIndex).length,
  )
  const duplicate = createComposeChord(
    sourceChord.symbol,
    clampedPosition,
    crypto.randomUUID(),
    sourceChord.durationMillis,
  )
  const targetChords = [...composeLineChordsForTrack(line, targetTrackIndex), duplicate].sort(
    (a, b) => a.position - b.position,
  )
  return updateComposeLineChordsForTrack(line, targetTrackIndex, targetChords)
}

export function moveComposeChordInLine(
  line: ComposeLine,
  chordId: string,
  targetTrackIndex: number,
  position: number,
): ComposeLine {
  const sourceTrackIndex = findComposeLineChordTrackIndex(line, chordId)
  if (sourceTrackIndex == null) return line

  if (isComposeLineChordBarTarget(line, sourceTrackIndex)) {
    return moveComposeChordToIndex(line, chordId, position)
  }

  const clampedPosition = clampChordPosition(
    position,
    composeLineTrackText(line, targetTrackIndex).length,
  )

  if (sourceTrackIndex === targetTrackIndex) {
    const trackChords = composeLineChordsForTrack(line, targetTrackIndex).map((chord) =>
      chord.id === chordId ? { ...chord, position: clampedPosition } : chord,
    )
    return updateComposeLineChordsForTrack(line, targetTrackIndex, trackChords)
  }

  const movedChord = composeLineChordsForTrack(line, sourceTrackIndex).find(
    (chord) => chord.id === chordId,
  )
  if (!movedChord) return line

  const sourceChords = composeLineChordsForTrack(line, sourceTrackIndex).filter(
    (chord) => chord.id !== chordId,
  )
  const targetChords = [
    ...composeLineChordsForTrack(line, targetTrackIndex),
    { ...movedChord, position: clampedPosition },
  ].sort((a, b) => a.position - b.position)

  let nextLine = updateComposeLineChordsForTrack(line, sourceTrackIndex, sourceChords)
  nextLine = updateComposeLineChordsForTrack(nextLine, targetTrackIndex, targetChords)
  return nextLine
}

function removeComposeChordFromLineTrack(
  line: ComposeLine,
  trackIndex: number,
  chordId: string,
): ComposeLine {
  if (isComposeLineChordBarTarget(line, trackIndex)) {
    const remainingChords = sortedComposeLineChords(line).filter((chord) => chord.id !== chordId)
    if (remainingChords.length === 0) {
      return { ...line, text: '', chords: [] }
    }
    return normalizeChordOnlyLine(line, remainingChords)
  }

  const trackChords = composeLineChordsForTrack(line, trackIndex).filter((chord) => chord.id !== chordId)
  return updateComposeLineChordsForTrack(line, trackIndex, trackChords)
}

function insertComposeChordOnLineTrack(
  line: ComposeLine,
  trackIndex: number,
  chord: ComposeChord,
  position: number,
  duplicate: boolean,
  timeSignature = '4/4',
): ComposeLine {
  if (isComposeLineChordBarTarget(line, trackIndex)) {
    if (duplicate) {
      return addComposeChordAtIndex(line, chord.symbol, position, chord.durationMillis, timeSignature)
    }

    const sorted = sortedComposeLineChords(line).filter((entry) => entry.id !== chord.id)
    const targetIndex = Math.max(0, position)
    const defaultBarDuration = composeDefaultBarDurationMillis(timeSignature)

    while (sorted.length < targetIndex) {
      sorted.push(
        createComposeChord(
          COMPOSE_BAR_HOLD_SYMBOL,
          sorted.length,
          crypto.randomUUID(),
          defaultBarDuration,
        ),
      )
    }

    const insertAt = Math.min(targetIndex, sorted.length)
    sorted.splice(insertAt, 0, { ...chord, position: insertAt })
    return normalizeChordOnlyLine(line, sorted)
  }

  const trackText = composeLineTrackText(line, trackIndex)
  if (trackText.trim().length === 0) return line

  const clampedPosition = clampChordPosition(position, trackText.length)
  const nextChord = duplicate
    ? createComposeChord(chord.symbol, clampedPosition, crypto.randomUUID(), chord.durationMillis)
    : { ...chord, position: clampedPosition }
  const trackChords = [...composeLineChordsForTrack(line, trackIndex), nextChord].sort(
    (a, b) => a.position - b.position,
  )
  return updateComposeLineChordsForTrack(line, trackIndex, trackChords)
}

export function replaceComposeLineInSections(
  sections: ComposeSection[],
  lineId: string,
  nextLine: ComposeLine,
): ComposeSection[] {
  const found = findComposeLineInSections(sections, lineId)
  if (!found) return sections

  return sections.map((section, sectionIndex) => {
    if (sectionIndex !== found.sectionIndex) return section
    return {
      ...section,
      lines: section.lines.map((line, lineIndex) =>
        lineIndex === found.lineIndex ? nextLine : line,
      ),
    }
  })
}

export function moveComposeChordBetweenLines(
  sections: ComposeSection[],
  sourceLineId: string,
  targetLineId: string,
  targetTrackIndex: number,
  chordId: string,
  position: number,
  languageTrackCount: number,
): ComposeSection[] {
  const sourceFound = findComposeLineInSections(sections, sourceLineId)
  const targetFound = findComposeLineInSections(sections, targetLineId)
  if (!sourceFound || !targetFound) return sections

  const sourceLine = normalizeComposeLineForLanguageTracks(
    sections[sourceFound.sectionIndex]!.lines[sourceFound.lineIndex]!,
    languageTrackCount,
  )
  const targetLine = normalizeComposeLineForLanguageTracks(
    sections[targetFound.sectionIndex]!.lines[targetFound.lineIndex]!,
    languageTrackCount,
  )

  if (sourceLineId === targetLineId) {
    return replaceComposeLineInSections(
      sections,
      sourceLineId,
      moveComposeChordInLine(sourceLine, chordId, targetTrackIndex, position),
    )
  }

  const sourceTrackIndex = findComposeLineChordTrackIndex(sourceLine, chordId)
  if (sourceTrackIndex == null) return sections

  const movedChord = composeLineChordsForTrack(sourceLine, sourceTrackIndex).find(
    (chord) => chord.id === chordId,
  )
  if (!movedChord) return sections

  const nextSourceLine = removeComposeChordFromLineTrack(sourceLine, sourceTrackIndex, chordId)
  const nextTargetLine = insertComposeChordOnLineTrack(
    targetLine,
    targetTrackIndex,
    movedChord,
    position,
    false,
  )
  if (nextTargetLine === targetLine) return sections

  let nextSections = replaceComposeLineInSections(sections, sourceLineId, nextSourceLine)
  nextSections = replaceComposeLineInSections(nextSections, targetLineId, nextTargetLine)
  return nextSections
}

export function duplicateComposeChordBetweenLines(
  sections: ComposeSection[],
  sourceLineId: string,
  targetLineId: string,
  targetTrackIndex: number,
  chordId: string,
  position: number,
  languageTrackCount: number,
): ComposeSection[] {
  const sourceFound = findComposeLineInSections(sections, sourceLineId)
  const targetFound = findComposeLineInSections(sections, targetLineId)
  if (!sourceFound || !targetFound) return sections

  const sourceLine = normalizeComposeLineForLanguageTracks(
    sections[sourceFound.sectionIndex]!.lines[sourceFound.lineIndex]!,
    languageTrackCount,
  )
  const targetLine = normalizeComposeLineForLanguageTracks(
    sections[targetFound.sectionIndex]!.lines[targetFound.lineIndex]!,
    languageTrackCount,
  )

  if (sourceLineId === targetLineId) {
    const sourceTrackIndex = findComposeLineChordTrackIndex(sourceLine, chordId)
    if (sourceTrackIndex == null) return sections
    return replaceComposeLineInSections(
      sections,
      sourceLineId,
      duplicateComposeChordInLine(
        sourceLine,
        sourceTrackIndex,
        chordId,
        targetTrackIndex,
        position,
      ),
    )
  }

  const sourceTrackIndex = findComposeLineChordTrackIndex(sourceLine, chordId)
  if (sourceTrackIndex == null) return sections

  const sourceChord = composeLineChordsForTrack(sourceLine, sourceTrackIndex).find(
    (chord) => chord.id === chordId,
  )
  if (!sourceChord) return sections

  const nextTargetLine = insertComposeChordOnLineTrack(
    targetLine,
    targetTrackIndex,
    sourceChord,
    position,
    true,
  )
  if (nextTargetLine === targetLine) return sections

  return replaceComposeLineInSections(sections, targetLineId, nextTargetLine)
}

export function duplicateComposeChordToLineAfter(
  sections: ComposeSection[],
  afterLineId: string,
  sourceLineId: string,
  chordId: string,
): ComposeSection[] {
  const foundAfter = findComposeLineInSections(sections, afterLineId)
  const foundSource = findComposeLineInSections(sections, sourceLineId)
  if (!foundAfter || !foundSource) return sections
  if (foundAfter.sectionIndex !== foundSource.sectionIndex) return sections

  const section = sections[foundAfter.sectionIndex]!
  const sourceLine = section.lines[foundSource.lineIndex]!
  const chord = sourceLine.chords.find((item) => item.id === chordId)
  if (!chord) return sections

  const newLine = normalizeChordOnlyLine({ id: crypto.randomUUID(), text: '', chords: [] }, [
    createComposeChord(chord.symbol, 0, crypto.randomUUID(), chord.durationMillis),
  ])

  return sections.map((item, sectionIndex) => {
    if (sectionIndex !== foundAfter.sectionIndex) return item
    const lines = [...item.lines]
    lines.splice(foundAfter.lineIndex + 1, 0, newLine)
    return { ...item, lines }
  })
}

export function createComposeSection(title = '', id = crypto.randomUUID()): ComposeSection {
  return { id, title, lines: [createComposeLine()], repeatCount: 1 }
}

export function defaultSectionTitle(existingCount: number): string {
  if (existingCount === 0) return 'Verse 1'
  if (existingCount === 1) return 'Chorus'
  return `Section ${existingCount + 1}`
}

export function composeSectionsFromSongData(
  data: ChordSongData | null | undefined,
  engine: ChordEngine,
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): ComposeSection[] {
  const sections = Array.isArray(data?.sections) ? data.sections : []
  if (!sections.length) return []

  return sections.map((section) => {
    const wire = section as WireSection
    const lines = (Array.isArray(wire.lines) ? wire.lines : []).filter(
      (line) => !isWireLineEmptyForExport(line),
    )
    return {
      id: crypto.randomUUID(),
      title: typeof wire.title === 'string' ? wire.title : '',
      repeatCount:
        typeof wire.repeat_count === 'number' && wire.repeat_count >= 1 ? wire.repeat_count : 1,
      lines: lines.length
        ? mergeImportedWireLinesIntoComposeLines(
            lines,
            engine,
            songKey,
            chordFormat,
          )
        : [createComposeLine()],
    }
  })
}

function mergeImportedWireLinesIntoComposeLines(
  lines: WireLine[],
  engine: ChordEngine,
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): ComposeLine[] {
  const composeLines: ComposeLine[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const wireLine = lines[index]!
    const nextWireLine = lines[index + 1]
    const current = composeLineFromWireLine(wireLine, engine, songKey, chordFormat)

    if (nextWireLine && isTranslationOnlyWireLine(nextWireLine) && !isTranslationOnlyWireLine(wireLine)) {
      const translation = composeLineFromWireLine(nextWireLine, engine, songKey, chordFormat)
      composeLines.push(mergePrimaryAndTranslationComposeLines(current, translation))
      index += 1
      continue
    }

    composeLines.push(current)
  }
  return composeLines
}

function parseWireLineTrack(
  parts: WirePart[],
  languageIndex: number,
  engine: ChordEngine,
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): { text: string; chords: ComposeChord[] } {
  let text = ''
  const chords: ComposeChord[] = []

  for (const part of parts) {
    const segment = part.languages?.[languageIndex] ?? ''
    if (part.chord != null && typeof part.chord === 'object') {
      let position = text.length
      const lastChord = chords.at(-1)
      if (lastChord && lastChord.position >= position) {
        position = lastChord.position + 1
      }
      const formatted = wireChordToSymbol(engine, part.chord, songKey, chordFormat)
      const parsed = parseFormattedChordToken(formatted)
      chords.push(
        createComposeChord(
          parsed.symbol,
          position,
          crypto.randomUUID(),
          wireChordDurationMillis(part.chord) ?? parsed.durationMillis,
        ),
      )
    }
    text += segment
  }

  const maxPosition = chords.reduce((max, chord) => Math.max(max, chord.position), -1)
  if (maxPosition >= text.length && text.trim().length > 0) {
    text = text.padEnd(maxPosition + 1, ' ')
  }

  return { text, chords }
}

function composeChordSymbolsMatch(left: ComposeChord, right: ComposeChord): boolean {
  return left.symbol.trim().toUpperCase() === right.symbol.trim().toUpperCase()
}

/** Import translation-track chords only when they differ from primary-aligned defaults. */
function importTranslationTrackChords(
  parts: WirePart[],
  languageIndex: number,
  primary: { text: string; chords: ComposeChord[] },
  engine: ChordEngine,
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): ComposeChord[] {
  const track = parseWireLineTrack(parts, languageIndex, engine, songKey, chordFormat)
  if (track.chords.length === 0 || primary.chords.length === 0) return []

  const sharesPrimaryChordMarkers =
    track.chords.length === primary.chords.length &&
    track.chords.every(
      (chord, index) =>
        primary.chords[index] != null &&
        composeChordSymbolsMatch(chord, primary.chords[index]!) &&
        chord.position === primary.chords[index]!.position,
    )

  return sharesPrimaryChordMarkers ? [] : track.chords
}

function composeLineFromWireLine(
  line: WireLine,
  engine: ChordEngine,
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): ComposeLine {
  const parts = Array.isArray(line.parts) ? line.parts : []
  const languageTrackCount = wireLineLanguageTrackCount(line)
  const translationOnly = isTranslationOnlyWireLine(line)

  if (translationOnly) {
    const translations = Array.from({ length: Math.max(0, languageTrackCount - 1) }, (_, index) =>
      parseWireLineTrack(parts, index + 1, engine, songKey, chordFormat).text,
    )
    const translationChords = Array.from({ length: Math.max(0, languageTrackCount - 1) }, (_, index) =>
      parseWireLineTrack(parts, index + 1, engine, songKey, chordFormat).chords,
    )

    return clampComposeLineChordPositions({
      id: crypto.randomUUID(),
      text: '',
      ...(translations.length ? { translations } : {}),
      chords: [],
      ...(translationChords.some((trackChords) => trackChords.length > 0)
        ? { translationChords }
        : {}),
    })
  }

  const primary = parseWireLineTrack(parts, 0, engine, songKey, chordFormat)
  const translations = Array.from({ length: Math.max(0, languageTrackCount - 1) }, (_, index) =>
    parseWireLineTrack(parts, index + 1, engine, songKey, chordFormat).text,
  )
  const translationChords = translations.map((_, trackIndex) =>
    importTranslationTrackChords(parts, trackIndex + 1, primary, engine, songKey, chordFormat),
  )

  const lineResult: ComposeLine = {
    id: crypto.randomUUID(),
    text: primary.text,
    ...(translations.length ? { translations } : {}),
    chords: primary.chords,
    ...(translationChords.some((trackChords) => trackChords.length > 0)
      ? { translationChords }
      : {}),
  }
  if (isComposeChordOnlyLine(lineResult)) {
    return normalizeChordOnlyLine(lineResult)
  }

  return clampComposeLineChordPositions(lineResult)
}

export function composeSectionsToSongSections(
  sections: ComposeSection[],
  engine: ChordEngine,
  songKey: string | null,
  timeSignature = '',
  languageTrackCount = 1,
  chordFormat: ChordFormatPreference = 'letters',
): ChordSongData['sections'] {
  return sections.map((section) => ({
    title: section.title.trim(),
    repeat_count: section.repeatCount >= 1 ? section.repeatCount : 1,
    lines: section.lines
      .filter((line) => !isComposeLineEmptyForExport(line))
      .flatMap((line) =>
        composeLineToWireLines(
          normalizeComposeLineForLanguageTracks(line, languageTrackCount),
          engine,
          songKey,
          timeSignature,
          languageTrackCount,
          chordFormat,
        ).map((parts) => ({ parts })),
      ),
  }))
}

function languageSlotSegment(
  segment: string,
  trackIndex: number,
  languageTrackCount: number,
): string[] {
  return Array.from({ length: languageTrackCount }, (_, index) => (index === trackIndex ? segment : ''))
}

function buildLyricTrackWireParts(
  text: string,
  chords: ComposeChord[],
  fillTrackIndex: number,
  languageTrackCount: number,
  engine: ChordEngine,
  songKey: string | null,
  timeSignature: string,
  chordFormat: ChordFormatPreference,
): WirePart[] {
  const sorted = sortedComposeLineChords({ chords }).filter(
    (chord) => chord.symbol.trim() && !isComposeBarHoldSymbol(chord.symbol),
  )
  const parts: WirePart[] = []
  let currentStart = 0

  for (let index = 0; index < sorted.length; index += 1) {
    const chord = sorted[index]!
    const chordStart = clampChordPosition(chord.position, text.length)
    if (chordStart > currentStart) {
      parts.push({
        chord: null,
        languages: languageSlotSegment(
          text.slice(currentStart, chordStart),
          fillTrackIndex,
          languageTrackCount,
        ),
        comment: false,
      })
    }

    const nextStart =
      index + 1 < sorted.length
        ? clampChordPosition(sorted[index + 1]!.position, text.length)
        : text.length

    parts.push({
      chord: symbolToWireChord(
        engine,
        chord.symbol,
        songKey,
        composeChordDurationForWire(chord.durationMillis, timeSignature),
        chordFormat,
      ),
      languages: languageSlotSegment(text.slice(chordStart, nextStart), fillTrackIndex, languageTrackCount),
      comment: false,
    })
    currentStart = nextStart
  }

  if (currentStart < text.length) {
    parts.push({
      chord: null,
      languages: languageSlotSegment(text.slice(currentStart), fillTrackIndex, languageTrackCount),
      comment: false,
    })
  }

  if (!parts.length) {
    parts.push({ chord: null, languages: emptyPartLanguages(languageTrackCount), comment: false })
  }

  return parts
}

function buildMergedMultiLanguageWireParts(
  line: ComposeLine,
  effectiveLanguageTrackCount: number,
  engine: ChordEngine,
  songKey: string | null,
  timeSignature: string,
  chordFormat: ChordFormatPreference,
): WirePart[] {
  const trackCount = Math.max(1, effectiveLanguageTrackCount)
  const primarySorted = sortedComposeLineChords({ chords: line.chords }).filter((chord) =>
    chord.symbol.trim(),
  )
  const translationSortedByTrack = Array.from({ length: trackCount - 1 }, (_, index) =>
    sortedComposeLineChords({ chords: line.translationChords?.[index] ?? [] }).filter((chord) =>
      chord.symbol.trim(),
    ),
  )

  const parts: WirePart[] = []
  const currentStarts = Array.from({ length: trackCount }, () => 0)

  for (let index = 0; index < primarySorted.length; index += 1) {
    const chord = primarySorted[index]!
    const chordStarts = Array.from({ length: trackCount }, (_, trackIndex) => {
      if (trackIndex === 0) return clampChordPosition(chord.position, line.text.length)
      const translationChord = translationSortedByTrack[trackIndex - 1]?.[index]
      const translationText = line.translations?.[trackIndex - 1] ?? ''
      return clampChordPosition(translationChord?.position ?? chord.position, translationText.length)
    })

    if (chordStarts.some((start, trackIndex) => start > currentStarts[trackIndex]!)) {
      parts.push({
        chord: null,
        languages: partLanguagesForTrackSlice(
          line,
          currentStarts,
          chordStarts,
          effectiveLanguageTrackCount,
        ),
        comment: false,
      })
    }

    const nextStarts =
      index + 1 < primarySorted.length
        ? Array.from({ length: trackCount }, (_, trackIndex) => {
            if (trackIndex === 0) {
              return clampChordPosition(primarySorted[index + 1]!.position, line.text.length)
            }
            const translationChord = translationSortedByTrack[trackIndex - 1]?.[index + 1]
            const translationText = line.translations?.[trackIndex - 1] ?? ''
            return clampChordPosition(
              translationChord?.position ?? primarySorted[index + 1]!.position,
              translationText.length,
            )
          })
        : Array.from({ length: trackCount }, (_, trackIndex) =>
            composeLineTrackText(line, trackIndex).length,
          )

    parts.push({
      chord: symbolToWireChord(
        engine,
        chord.symbol,
        songKey,
        composeChordDurationForWire(chord.durationMillis, timeSignature),
        chordFormat,
      ),
      languages: partLanguagesForTrackSlice(
        line,
        chordStarts,
        nextStarts,
        effectiveLanguageTrackCount,
      ),
      comment: false,
    })
    currentStarts.splice(0, trackCount, ...nextStarts)
  }

  const ends = Array.from({ length: trackCount }, (_, trackIndex) =>
    composeLineTrackText(line, trackIndex).length,
  )
  if (currentStarts.some((start, trackIndex) => start < ends[trackIndex]!)) {
    parts.push({
      chord: null,
      languages: partLanguagesForTrackSlice(line, currentStarts, ends, effectiveLanguageTrackCount),
      comment: false,
    })
  }

  if (!parts.length) {
    parts.push({ chord: null, languages: emptyPartLanguages(effectiveLanguageTrackCount), comment: false })
  }

  return parts
}

function composeLineToWireLines(
  line: ComposeLine,
  engine: ChordEngine,
  songKey: string | null,
  timeSignature: string,
  languageTrackCount: number,
  chordFormat: ChordFormatPreference,
): WirePart[][] {
  const normalized = clampComposeLineChordPositions(
    normalizeComposeLineForLanguageTracks(line, languageTrackCount),
  )
  const effectiveLanguageTrackCount = composeLineEffectiveLanguageTrackCount(
    normalized,
    languageTrackCount,
  )

  if (isComposeChordOnlyLine(normalized)) {
    return [
      buildLyricTrackWireParts(
        '',
        normalized.chords,
        0,
        effectiveLanguageTrackCount,
        engine,
        songKey,
        timeSignature,
        chordFormat,
      ),
    ]
  }

  if (effectiveLanguageTrackCount <= 1) {
    return [
      buildLyricTrackWireParts(
        normalized.text,
        normalized.chords,
        0,
        1,
        engine,
        songKey,
        timeSignature,
        chordFormat,
      ),
    ]
  }

  const translationCount = effectiveLanguageTrackCount - 1
  const hasTranslationContent = composeLineHasTranslationContent(normalized)
  if (!hasTranslationContent) {
    return [
      buildLyricTrackWireParts(
        normalized.text,
        normalized.chords,
        0,
        1,
        engine,
        songKey,
        timeSignature,
        chordFormat,
      ),
    ]
  }

  const incompatibleTranslationTracks: number[] = []
  for (let trackIndex = 0; trackIndex < translationCount; trackIndex += 1) {
    const translationText = normalized.translations?.[trackIndex] ?? ''
    if (!translationText.trim()) continue
    const translationChords = normalized.translationChords?.[trackIndex] ?? []
    if (
      translationChords.length > 0 &&
      !composeTrackChordsCompatible(normalized.chords, translationChords, timeSignature)
    ) {
      incompatibleTranslationTracks.push(trackIndex)
    }
  }

  if (incompatibleTranslationTracks.length === 0) {
    return [
      buildMergedMultiLanguageWireParts(
        normalized,
        effectiveLanguageTrackCount,
        engine,
        songKey,
        timeSignature,
        chordFormat,
      ),
    ]
  }

  const wireLines: WirePart[][] = [
    buildLyricTrackWireParts(
      normalized.text,
      normalized.chords,
      0,
      effectiveLanguageTrackCount,
      engine,
      songKey,
      timeSignature,
      chordFormat,
    ),
  ]

  for (const trackIndex of incompatibleTranslationTracks) {
    wireLines.push(
      buildLyricTrackWireParts(
        normalized.translations?.[trackIndex] ?? '',
        normalized.translationChords?.[trackIndex] ?? [],
        trackIndex + 1,
        effectiveLanguageTrackCount,
        engine,
        songKey,
        timeSignature,
        chordFormat,
      ),
    )
  }

  return wireLines
}

export function wireChordToSymbol(
  engine: ChordEngine,
  chord: unknown,
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): string {
  const miniSong: ChordSongData = {
    titles: ['_'],
    ...(songKey ? { key: parseKeyLine(engine, songKey) } : {}),
    sections: [
      {
        title: '_',
        repeat_count: 1,
        lines: [{ parts: [{ chord, languages: ['x'], comment: false }] }],
      },
    ],
  }

  const formatted = engine.formatChordPro(miniSong, songEditorFormatOptions(chordFormat, miniSong))
  const match = /\[[^\]]+\]/.exec(formatted)
  return match ? match[0].slice(1, -1) : ''
}

export function symbolToWireChord(
  engine: ChordEngine,
  symbol: string,
  songKey: string | null,
  durationMillis: number | null = null,
  chordFormat: ChordFormatPreference = 'letters',
): unknown | null {
  const trimmed = symbol.trim()
  if (!trimmed) return null

  const parseSymbol = composePoolSymbolToLetterChord(trimmed, songKey, chordFormat)
  const durationSuffix =
    durationMillis && durationMillis > 0
      ? `:${formatComposeChordDurationBeats(durationMillis)}`
      : ''
  const parseKey = songKey?.trim() || 'C'
  const source = `{title: _}\n{key: ${parseKey}}\n\n[${parseSymbol}${durationSuffix}]x`
  try {
    const parsed = engine.parseChordPro(source)
    const line = (parsed.sections as WireSection[] | undefined)?.[0]?.lines?.[0]
    const parts = Array.isArray(line?.parts) ? line.parts : []
    const part = parts.find((item) => item.chord != null) ?? parts[0]
    return part?.chord ?? null
  } catch {
    return null
  }
}

function parseKeyLine(engine: ChordEngine, songKey: string): unknown {
  try {
    const parsed = engine.parseChordPro(`{title: _}\n{key: ${songKey}}`)
    return parsed.key ?? null
  } catch {
    return null
  }
}

export function mergeSongDataWithComposeSections(
  parsed: ChordSongData,
  sections: ComposeSection[],
  engine: ChordEngine,
  songKey: string | null,
  timeSignature = '',
  languageTrackCount = 1,
  chordFormat: ChordFormatPreference = 'letters',
): ChordSongData {
  return {
    ...parsed,
    sections: composeSectionsToSongSections(
      sections,
      engine,
      songKey,
      timeSignature,
      languageTrackCount,
      chordFormat,
    ),
  }
}

export function clampChordPosition(position: number, textLength: number): number {
  return Math.max(0, Math.min(textLength, Math.round(position)))
}

export function positionFromPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number,
  textLength: number,
): number {
  if (textLength <= 0 || containerWidth <= 0) return 0
  const relativeX = clientX - containerLeft
  const ratio = relativeX / containerWidth
  return clampChordPosition(Math.round(ratio * textLength), textLength)
}

/** Map a pointer x coordinate to a character index using laid-out char spans. */
export function positionFromCharMirror(
  mirror: HTMLElement,
  clientX: number,
  textLength: number,
): number {
  if (textLength <= 0) return 0
  const spans = mirror.querySelectorAll<HTMLElement>('[data-char-index]')
  if (spans.length === 0) return 0

  for (const span of spans) {
    const index = Number(span.dataset.charIndex)
    if (!Number.isFinite(index)) continue
    const rect = span.getBoundingClientRect()
    if (clientX < rect.right) {
      const mid = rect.left + rect.width / 2
      return clampChordPosition(clientX < mid ? index : index + 1, textLength)
    }
  }
  return textLength
}

/** Map a pointer x coordinate to a character index using measured monospace cell width. */
export function positionFromMonospacePointer(
  clientX: number,
  textLeft: number,
  paddingLeft: number,
  charWidth: number,
  textLength: number,
): number {
  if (charWidth <= 0 || textLength <= 0) return 0
  const relativeX = clientX - textLeft - paddingLeft
  const index = Math.floor(relativeX / charWidth)
  return clampChordPosition(index, textLength)
}
