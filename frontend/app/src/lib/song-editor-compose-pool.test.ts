import { describe, expect, it } from 'vitest'

import {
  appendChordModeExtension,
  buildDiatonicChordModeSymbol,
  CHORD_MODE_FLAT7_SELECTED_INDEX,
  composeChordPool,
  composeMixolydianChordPool,
  composeOtherChordPool,
  composePoolSymbolToLetterChord,
  formatChordModeExtension,
  formatDiatonicNashvilleSymbol,
  hasChordModeExtension,
  isDiatonicPoolSymbolFlat,
  isDiatonicPoolSymbolMinor,
  withDiatonicPoolFlat,
  withDiatonicPoolMinor,
  stripChordModeExtension,
} from '@/lib/song-editor-compose-pool'

describe('composeChordPool', () => {
  it('returns Nashville scale degrees when nashville format is selected', () => {
    expect(composeChordPool('G', 'nashville').map((chord) => chord.symbol)).toEqual([
      '1',
      '2m',
      '3m',
      '4',
      '5',
      '6m',
    ])
  })

  it('returns letter names in the selected major key', () => {
    expect(composeChordPool('C', 'letters').map((chord) => chord.symbol)).toEqual([
      'C',
      'Dm',
      'Em',
      'F',
      'G',
      'Am',
    ])
  })

  it('transposes letter pool with the song key', () => {
    expect(composeChordPool('G', 'letters').map((chord) => chord.symbol)).toEqual([
      'G',
      'Am',
      'Bm',
      'C',
      'D',
      'Em',
    ])
  })

  it('uses sharps in sharp keys and flats in flat keys', () => {
    expect(composeChordPool('D', 'letters').map((chord) => chord.symbol)).toEqual([
      'D',
      'Em',
      'F#m',
      'G',
      'A',
      'Bm',
    ])
    expect(composeChordPool('F', 'letters').map((chord) => chord.symbol)).toEqual([
      'F',
      'Gm',
      'Am',
      'Bb',
      'C',
      'Dm',
    ])
  })

  it('defaults to C major when key is unset', () => {
    expect(composeChordPool(null, 'letters').map((chord) => chord.symbol)).toEqual([
      'C',
      'Dm',
      'Em',
      'F',
      'G',
      'Am',
    ])
  })
})

describe('composeMixolydianChordPool', () => {
  it('returns Nashville b7 and 5m when nashville format is selected', () => {
    expect(composeMixolydianChordPool('A', 'nashville').map((chord) => chord.symbol)).toEqual([
      'b7',
      '5m',
    ])
  })

  it('returns letter names for b7 and minor v in the selected key', () => {
    expect(composeMixolydianChordPool('A', 'letters').map((chord) => chord.symbol)).toEqual([
      'G',
      'Em',
    ])
  })

  it('defaults to C major when key is unset', () => {
    expect(composeMixolydianChordPool(null, 'letters').map((chord) => chord.symbol)).toEqual([
      'Bb',
      'Gm',
    ])
  })
})

describe('composeOtherChordPool', () => {
  it('returns Nashville borrowed chords when nashville format is selected', () => {
    expect(composeOtherChordPool('G', 'nashville').map((chord) => chord.symbol)).toEqual([
      '4m',
      '3/#5',
      '1/3',
      '5/7',
      'b6',
      'b3',
    ])
  })

  it('returns letter names in the selected major key', () => {
    expect(composeOtherChordPool('C', 'letters').map((chord) => chord.symbol)).toEqual([
      'Fm',
      'Eaug',
      'C/E',
      'G7',
      'Ab',
      'Eb',
    ])
  })

  it('transposes letter pool with the song key', () => {
    expect(composeOtherChordPool('G', 'letters').map((chord) => chord.symbol)).toEqual([
      'Cm',
      'Baug',
      'G/B',
      'D7',
      'Eb',
      'Bb',
    ])
  })
})

describe('composePoolSymbolToLetterChord', () => {
  it('maps Nashville pool symbols to letter chords for wire encoding', () => {
    expect(composePoolSymbolToLetterChord('1', null, 'nashville')).toBe('C')
    expect(composePoolSymbolToLetterChord('6m', 'G', 'nashville')).toBe('Em')
    expect(composePoolSymbolToLetterChord('b7', null, 'nashville')).toBe('Bb')
    expect(composePoolSymbolToLetterChord('4m', 'C', 'nashville')).toBe('Fm')
    expect(composePoolSymbolToLetterChord('1/3', 'G', 'nashville')).toBe('G/B')
    expect(composePoolSymbolToLetterChord('5/7', 'G', 'nashville')).toBe('D7')
    expect(composePoolSymbolToLetterChord('b3', 'G', 'nashville')).toBe('Bb')
    expect(composePoolSymbolToLetterChord('G', null, 'letters')).toBe('G')
  })

  it('maps toggled diatonic Nashville symbols to letter chords', () => {
    expect(composePoolSymbolToLetterChord('1m', 'C', 'nashville')).toBe('Cm')
    expect(composePoolSymbolToLetterChord('2', 'C', 'nashville')).toBe('D')
    expect(composePoolSymbolToLetterChord('5m', 'G', 'nashville')).toBe('Dm')
    expect(composePoolSymbolToLetterChord('6', 'G', 'nashville')).toBe('E')
    expect(composePoolSymbolToLetterChord('b3', 'C', 'nashville')).toBe('Eb')
    expect(composePoolSymbolToLetterChord('b6', 'C', 'nashville')).toBe('Ab')
    expect(composePoolSymbolToLetterChord('b3m', 'C', 'nashville')).toBe('Ebm')
  })
})

describe('buildDiatonicChordModeSymbol', () => {
  it('builds Nashville and letter symbols from placement-mode options', () => {
    expect(
      buildDiatonicChordModeSymbol({
        selectedIndex: 2,
        minor: true,
        flat: true,
        chordFormat: 'nashville',
        songKey: 'C',
      }),
    ).toBe('b3m')
    expect(
      buildDiatonicChordModeSymbol({
        selectedIndex: 2,
        minor: false,
        flat: true,
        chordFormat: 'letters',
        songKey: 'C',
      }),
    ).toBe('Eb')
    expect(
      buildDiatonicChordModeSymbol({
        selectedIndex: 0,
        minor: false,
        flat: false,
        bassDegree: 3,
        chordFormat: 'nashville',
        songKey: 'G',
      }),
    ).toBe('1/3')
    expect(
      buildDiatonicChordModeSymbol({
        selectedIndex: 0,
        minor: false,
        flat: false,
        bassDegree: 3,
        chordFormat: 'letters',
        songKey: 'G',
      }),
    ).toBe('G/B')
    expect(
      buildDiatonicChordModeSymbol({
        selectedIndex: CHORD_MODE_FLAT7_SELECTED_INDEX,
        minor: false,
        flat: false,
        chordFormat: 'nashville',
        songKey: 'C',
      }),
    ).toBe('b7')
    expect(
      buildDiatonicChordModeSymbol({
        selectedIndex: CHORD_MODE_FLAT7_SELECTED_INDEX,
        minor: false,
        flat: false,
        chordFormat: 'letters',
        songKey: 'C',
      }),
    ).toBe('Bb')
  })
})

describe('chord mode extensions', () => {
  it('formats add, sus, and major extensions', () => {
    expect(formatChordModeExtension('add', 2)).toBe('add2')
    expect(formatChordModeExtension('sus', 4)).toBe('sus4')
    expect(formatChordModeExtension('extend', 7)).toBe('maj7')
  })

  it('appends extensions before slash bass', () => {
    expect(appendChordModeExtension('1/3', 'sus4')).toBe('1sus4/3')
    expect(appendChordModeExtension('1', 'add2')).toBe('1add2')
  })

  it('builds Nashville and letter symbols with extensions', () => {
    expect(
      buildDiatonicChordModeSymbol({
        selectedIndex: 0,
        minor: false,
        flat: false,
        extension: 'add2',
        chordFormat: 'nashville',
        songKey: 'C',
      }),
    ).toBe('1add2')
    expect(
      buildDiatonicChordModeSymbol({
        selectedIndex: 0,
        minor: false,
        flat: false,
        extension: 'maj7',
        chordFormat: 'letters',
        songKey: 'C',
      }),
    ).toBe('Cmaj7')
    expect(
      buildDiatonicChordModeSymbol({
        selectedIndex: 0,
        minor: false,
        flat: false,
        bassDegree: 3,
        extension: 'sus4',
        chordFormat: 'letters',
        songKey: 'G',
      }),
    ).toBe('Gsus4/B')
  })

  it('strips compose-mode extensions from chord symbols', () => {
    expect(stripChordModeExtension('4add9')).toBe('4')
    expect(stripChordModeExtension('1sus4/3')).toBe('1/3')
    expect(stripChordModeExtension('Cmaj7')).toBe('C')
    expect(stripChordModeExtension('Gsus4/B')).toBe('G/B')
    expect(stripChordModeExtension('1')).toBe('1')
    expect(hasChordModeExtension('4add9')).toBe(true)
    expect(hasChordModeExtension('2m')).toBe(false)
  })
})

describe('diatonic slash bass', () => {
  it('maps custom slash Nashville symbols to letter chords', () => {
    expect(composePoolSymbolToLetterChord('2m/5', 'C', 'nashville')).toBe('Dm/G')
    expect(composePoolSymbolToLetterChord('1/7', 'G', 'nashville')).toBe('G/F')
  })
})

describe('diatonic pool minor toggle', () => {
  it('detects minor pool symbols', () => {
    expect(isDiatonicPoolSymbolMinor('2m')).toBe(true)
    expect(isDiatonicPoolSymbolMinor('C')).toBe(false)
    expect(isDiatonicPoolSymbolMinor('Am')).toBe(true)
  })

  it('toggles minor and major for Nashville and letter symbols', () => {
    expect(withDiatonicPoolMinor('1', true)).toBe('1m')
    expect(withDiatonicPoolMinor('2m', false)).toBe('2')
    expect(withDiatonicPoolMinor('C', true)).toBe('Cm')
    expect(withDiatonicPoolMinor('Dm', false)).toBe('D')
    expect(withDiatonicPoolMinor('F#m', false)).toBe('F#')
  })
})

describe('diatonic pool flat toggle', () => {
  it('detects flat Nashville pool symbols', () => {
    expect(isDiatonicPoolSymbolFlat('b3')).toBe(true)
    expect(isDiatonicPoolSymbolFlat('3m')).toBe(false)
  })

  it('toggles flat for Nashville symbols', () => {
    expect(withDiatonicPoolFlat('3m', true)).toBe('b3m')
    expect(withDiatonicPoolFlat('b3m', false)).toBe('3m')
    expect(formatDiatonicNashvilleSymbol({ degree: 5, minor: false, flat: true })).toBe('b5')
  })
})
