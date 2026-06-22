import type { ChordFormatPreference } from '@/lib/chord-format'
import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'
import { chordSymbolToPitchLevel, coerceMusicalKeyString, pitchClassLevelToKeySymbol } from '@/lib/setlist-song-links'

const DIATONIC_QUALITIES = ['', 'm', 'm', '', '', 'm'] as const

const DIATONIC_NASHVILLE = ['1', '2m', '3m', '4', '5', '6m'] as const

/** Diatonic roots (degrees 1–6) spelled for each major key signature. */
const MAJOR_DIATONIC_ROOTS: Record<(typeof MUSICAL_KEYS)[number], readonly string[]> = {
  C: ['C', 'D', 'E', 'F', 'G', 'A'],
  Db: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb'],
  D: ['D', 'E', 'F#', 'G', 'A', 'B'],
  Eb: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C'],
  E: ['E', 'F#', 'G#', 'A', 'B', 'C#'],
  F: ['F', 'G', 'A', 'Bb', 'C', 'D'],
  Gb: ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb'],
  G: ['G', 'A', 'B', 'C', 'D', 'E'],
  Ab: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F'],
  A: ['A', 'B', 'C#', 'D', 'E', 'F#'],
  Bb: ['Bb', 'C', 'D', 'Eb', 'F', 'G'],
  B: ['B', 'C#', 'D#', 'E', 'F#', 'G#'],
}

/** Flat-VII roots (mixolydian b7) spelled for each major key signature. */
const MAJOR_B7_ROOTS: Record<(typeof MUSICAL_KEYS)[number], string> = {
  C: 'Bb',
  Db: 'Cb',
  D: 'C',
  Eb: 'Db',
  E: 'D',
  F: 'Eb',
  Gb: 'Fb',
  G: 'F',
  Ab: 'Gb',
  A: 'G',
  Bb: 'Ab',
  B: 'A',
}

/** Flat-III roots spelled for each major key signature. */
const MAJOR_B3_ROOTS: Record<(typeof MUSICAL_KEYS)[number], string> = {
  C: 'Eb',
  Db: 'E',
  D: 'F',
  Eb: 'Gb',
  E: 'G',
  F: 'Ab',
  Gb: 'A',
  G: 'Bb',
  Ab: 'B',
  A: 'C',
  Bb: 'Db',
  B: 'D',
}

/** Flat-VI roots spelled for each major key signature. */
const MAJOR_B6_ROOTS: Record<(typeof MUSICAL_KEYS)[number], string> = {
  C: 'Ab',
  Db: 'A',
  D: 'Bb',
  Eb: 'B',
  E: 'C',
  F: 'Db',
  Gb: 'D',
  G: 'Eb',
  Ab: 'E',
  A: 'F',
  Bb: 'Gb',
  B: 'G',
}

const OTHER_POOL_NASHVILLE = ['4m', '3/#5', '1/3', '5/7', 'b6', 'b3'] as const

/** Keyboard index 6 selects the mixolydian flat-VII (b7) chord. */
export const CHORD_MODE_FLAT7_SELECTED_INDEX = 6 as const

export type ComposePoolChord = {
  id: string
  symbol: string
}

export function isDiatonicPoolSymbolMinor(symbol: string): boolean {
  const parsed = parseDiatonicNashvilleSymbol(symbol)
  if (parsed) return parsed.minor
  return symbol.trim().endsWith('m')
}

export function isDiatonicPoolSymbolFlat(symbol: string): boolean {
  return parseDiatonicNashvilleSymbol(symbol)?.flat ?? false
}

export function withDiatonicPoolMinor(symbol: string, minor: boolean): string {
  const parsed = parseDiatonicNashvilleSymbol(symbol)
  if (parsed) return formatDiatonicNashvilleSymbol({ ...parsed, minor })
  const trimmed = symbol.trim()
  const root = trimmed.endsWith('m') ? trimmed.slice(0, -1) : trimmed
  return minor ? `${root}m` : root
}

export function withDiatonicPoolFlat(symbol: string, flat: boolean): string {
  const parsed = parseDiatonicNashvilleSymbol(symbol)
  if (parsed) return formatDiatonicNashvilleSymbol({ ...parsed, flat })
  return symbol
}

export function parseDiatonicNashvilleSymbol(
  symbol: string,
): { degree: number; minor: boolean; flat: boolean } | null {
  const match = /^(b)?([1-6])(m)?$/i.exec(symbol.trim())
  if (!match) return null
  return {
    flat: Boolean(match[1]),
    degree: Number.parseInt(match[2]!, 10),
    minor: Boolean(match[3]),
  }
}

export function formatDiatonicNashvilleSymbol(options: {
  degree: number
  minor: boolean
  flat: boolean
}): string {
  const { degree, minor, flat } = options
  return `${flat ? 'b' : ''}${degree}${minor ? 'm' : ''}`
}

export function formatDiatonicSlashBass(degree: number): string {
  return String(degree)
}

export type ChordModeExtensionKind = 'add' | 'sus' | 'extend'

export function formatChordModeExtension(kind: ChordModeExtensionKind, digit: number): string | null {
  if (!Number.isFinite(digit) || digit < 0 || digit > 9) return null
  if (kind === 'add') return `add${digit}`
  if (kind === 'sus') return `sus${digit}`
  return `maj${digit}`
}

export function appendChordModeExtension(symbol: string, extension: string | null | undefined): string {
  if (!extension) return symbol
  const slashIndex = symbol.indexOf('/')
  if (slashIndex >= 0) {
    return `${symbol.slice(0, slashIndex)}${extension}${symbol.slice(slashIndex)}`
  }
  return `${symbol}${extension}`
}

const CHORD_MODE_EXTENSION_PATTERN = /(add|sus|maj)\d+$/i

function chordPartWithoutSlashBass(symbol: string): string {
  const slashIndex = symbol.indexOf('/')
  return slashIndex >= 0 ? symbol.slice(0, slashIndex) : symbol
}

/** Strip compose-mode extensions (add/sus/maj + digit) from a chord symbol. */
export function stripChordModeExtension(symbol: string): string {
  const trimmed = symbol.trim()
  if (!trimmed) return trimmed

  const slashIndex = trimmed.indexOf('/')
  if (slashIndex >= 0) {
    const chordPart = trimmed.slice(0, slashIndex)
    const bassPart = trimmed.slice(slashIndex)
    return chordPart.replace(CHORD_MODE_EXTENSION_PATTERN, '') + bassPart
  }
  return trimmed.replace(CHORD_MODE_EXTENSION_PATTERN, '')
}

export function hasChordModeExtension(symbol: string): boolean {
  return CHORD_MODE_EXTENSION_PATTERN.test(chordPartWithoutSlashBass(symbol.trim()))
}

function buildBaseNashvilleChordModeSymbol(options: {
  selectedIndex: number
  minor: boolean
  flat: boolean
  bassDegree?: number | null
}): string | null {
  const { selectedIndex, minor, flat, bassDegree = null } = options
  if (selectedIndex === CHORD_MODE_FLAT7_SELECTED_INDEX) {
    const chordNashville = minor ? 'b7m' : 'b7'
    return bassDegree != null && bassDegree >= 1 && bassDegree <= 7
      ? `${chordNashville}/${formatDiatonicSlashBass(bassDegree)}`
      : chordNashville
  }
  if (selectedIndex < 0 || selectedIndex > 5) return null
  const chordNashville = formatDiatonicNashvilleSymbol({
    degree: selectedIndex + 1,
    minor,
    flat,
  })
  return bassDegree != null && bassDegree >= 1 && bassDegree <= 7
    ? `${chordNashville}/${formatDiatonicSlashBass(bassDegree)}`
    : chordNashville
}

export function buildDiatonicChordModeSymbol(options: {
  selectedIndex: number
  minor: boolean
  flat: boolean
  bassDegree?: number | null
  extension?: string | null
  chordFormat: ChordFormatPreference
  songKey: string | null
}): string | null {
  const { extension = null, chordFormat, songKey, ...baseOptions } = options
  const base = buildBaseNashvilleChordModeSymbol(baseOptions)
  if (!base) return null
  if (chordFormat === 'nashville') {
    return appendChordModeExtension(base, extension)
  }
  return buildLetterChordModeSymbol(base, extension, songKey)
}

function buildLetterChordModeSymbol(
  baseNashville: string,
  extension: string | null,
  songKey: string | null,
): string {
  const slashIndex = baseNashville.indexOf('/')
  if (slashIndex >= 0) {
    const chordPart = baseNashville.slice(0, slashIndex)
    const bassPart = baseNashville.slice(slashIndex + 1)
    const key = resolvePoolKey(songKey)
    const chordLetter = composePoolSymbolToLetterChord(chordPart, songKey, 'nashville')
    const bassLetter = nashvilleSlashBassToLetter(bassPart, key)
    if (!bassLetter) return `${chordLetter}${extension ?? ''}`
    return `${chordLetter}${extension ?? ''}/${bassLetter}`
  }
  const letter = composePoolSymbolToLetterChord(baseNashville, songKey, 'nashville')
  return `${letter}${extension ?? ''}`
}

export function composeChordPool(
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): ComposePoolChord[] {
  if (chordFormat === 'nashville') {
    return DIATONIC_NASHVILLE.map((symbol, index) => ({
      id: `deg-${index + 1}`,
      symbol,
    }))
  }

  return letterPoolForKey(resolvePoolKey(songKey))
}

export function composeMixolydianChordPool(
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): ComposePoolChord[] {
  if (chordFormat === 'nashville') {
    return [
      { id: 'mix-b7', symbol: 'b7' },
      { id: 'mix-5m', symbol: '5m' },
    ]
  }

  const key = resolvePoolKey(songKey)
  const roots = MAJOR_DIATONIC_ROOTS[key]
  return [
    { id: 'mix-b7', symbol: MAJOR_B7_ROOTS[key] },
    { id: 'mix-5m', symbol: `${roots[4]!}m` },
  ]
}

export function composeOtherChordPool(
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): ComposePoolChord[] {
  if (chordFormat === 'nashville') {
    return OTHER_POOL_NASHVILLE.map((symbol, index) => ({
      id: `other-${index}`,
      symbol,
    }))
  }

  return otherLetterChordsForKey(resolvePoolKey(songKey))
}

function resolvePoolKey(songKey: string | null): (typeof MUSICAL_KEYS)[number] {
  const coerced = songKey ? coerceMusicalKeyString(songKey) : null
  if (coerced && (MUSICAL_KEYS as readonly string[]).includes(coerced)) {
    return coerced as (typeof MUSICAL_KEYS)[number]
  }
  return 'C'
}

/** Map a compose pool symbol to a letter chord the ChordPro parser accepts. */
export function composePoolSymbolToLetterChord(
  symbol: string,
  songKey: string | null,
  chordFormat: ChordFormatPreference,
): string {
  const trimmed = symbol.trim()
  if (!trimmed || chordFormat !== 'nashville') return trimmed

  const key = resolvePoolKey(songKey)
  const roots = MAJOR_DIATONIC_ROOTS[key]
  const normalized = trimmed.toUpperCase()

  const diatonic = parseDiatonicNashvilleSymbol(trimmed)
  if (diatonic) {
    const letter = diatonicNashvilleToLetter(key, diatonic)
    if (letter) return letter
  }

  for (let index = 0; index < DIATONIC_NASHVILLE.length; index += 1) {
    if (DIATONIC_NASHVILLE[index]!.toUpperCase() === normalized) {
      return roots[index]! + DIATONIC_QUALITIES[index]!
    }
  }

  if (normalized === 'B7') return MAJOR_B7_ROOTS[key]
  if (normalized === 'B7M') return `${MAJOR_B7_ROOTS[key]}m`
  if (normalized === '5M') return `${roots[4]!}m`

  const otherLetter = otherPoolLetterSymbol(trimmed, key)
  if (otherLetter) return otherLetter

  const slashLetter = nashvilleSlashSymbolToLetter(trimmed, songKey)
  if (slashLetter) return slashLetter

  return trimmed
}

function nashvilleSlashBassToLetter(
  bassPart: string,
  key: (typeof MUSICAL_KEYS)[number],
): string | null {
  const normalized = bassPart.trim()
  if (normalized === '7' || normalized.toLowerCase() === 'b7') return MAJOR_B7_ROOTS[key]
  const degree = Number.parseInt(normalized, 10)
  if (degree >= 1 && degree <= 6) return MAJOR_DIATONIC_ROOTS[key][degree - 1] ?? null
  return null
}

function nashvilleSlashSymbolToLetter(symbol: string, songKey: string | null): string | null {
  const slashIndex = symbol.indexOf('/')
  if (slashIndex <= 0) return null
  const chordPart = symbol.slice(0, slashIndex)
  const bassPart = symbol.slice(slashIndex + 1)
  if (!chordPart || !bassPart) return null
  const key = resolvePoolKey(songKey)
  const chordLetter = composePoolSymbolToLetterChord(chordPart, songKey, 'nashville')
  const bassLetter = nashvilleSlashBassToLetter(bassPart, key)
  if (!bassLetter) return null
  return `${chordLetter}/${bassLetter}`
}

function lowerRootBySemitone(root: string): string {
  const level = chordSymbolToPitchLevel(root)
  if (level == null) return root
  return pitchClassLevelToKeySymbol((level - 1 + 12) % 12) ?? root
}

function diatonicNashvilleToLetter(
  key: (typeof MUSICAL_KEYS)[number],
  diatonic: { degree: number; minor: boolean; flat: boolean },
): string | null {
  const roots = MAJOR_DIATONIC_ROOTS[key]
  const root = roots[diatonic.degree - 1]
  if (!root) return null

  if (diatonic.flat) {
    if (!diatonic.minor && diatonic.degree === 3) return MAJOR_B3_ROOTS[key]
    if (!diatonic.minor && diatonic.degree === 6) return MAJOR_B6_ROOTS[key]
    const lowered = lowerRootBySemitone(root)
    return diatonic.minor ? `${lowered}m` : lowered
  }

  return diatonic.minor ? `${root}m` : root
}

function otherLetterChordsForKey(keySymbol: (typeof MUSICAL_KEYS)[number]): ComposePoolChord[] {
  const roots = MAJOR_DIATONIC_ROOTS[keySymbol]
  const symbols = [
    `${roots[3]!}m`,
    `${roots[2]!}aug`,
    `${roots[0]!}/${roots[2]!}`,
    `${roots[4]!}7`,
    MAJOR_B6_ROOTS[keySymbol],
    MAJOR_B3_ROOTS[keySymbol],
  ]
  return symbols.map((symbol, index) => ({
    id: `other-${index}`,
    symbol,
  }))
}

function otherPoolLetterSymbol(
  symbol: string,
  key: (typeof MUSICAL_KEYS)[number],
): string | null {
  const index = OTHER_POOL_NASHVILLE.findIndex(
    (entry) => entry.toUpperCase() === symbol.trim().toUpperCase(),
  )
  if (index < 0) return null
  return otherLetterChordsForKey(key)[index]?.symbol ?? null
}

function letterPoolForKey(keySymbol: (typeof MUSICAL_KEYS)[number]): ComposePoolChord[] {
  const roots = MAJOR_DIATONIC_ROOTS[keySymbol]
  return roots.map((root, index) => ({
    id: `deg-${index + 1}`,
    symbol: root + DIATONIC_QUALITIES[index]!,
  }))
}
