import { describe, expect, it } from 'vitest'

import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

import {
  addComposeChordAtIndex,
  clampChordPosition,
  composeBarBoundaryPercent,
  composeBarSegmentLayout,
  composeBarWeightsFromChords,
  composeChordBarMeasureCount,
  composeChordBarDisplayMeasureCount,
  composeBarInsertMarkerPercent,
  composeBarInsertPreviewSegmentLayout,
  composeBarAppendDurationMillis,
  COMPOSE_BAR_HOLD_SYMBOL,
  composeChordBarRowWidthPercent,
  composeChordBarWeight,
  composeChordDisplayLabel,
  composeChordOnlyLineMeasureMismatch,
  composeTranslationTrackChordsMismatch,
  composeLineChordsForTrack,
  composeDefaultBarDurationMillis,
  composeSectionsFromSongData,
  composeSectionsToSongSections,
  composeChordDurationForWire,
  convertComposeLineToChordBar,
  createComposeLine,
  createComposeChordOnlyLine,
  buildComposeLinesFromPaste,
  splitPasteIntoLineSegments,
  duplicateComposeChordBetweenLines,
  duplicateComposeChordInLine,
  duplicateComposeChordToLineAfter,
  insertComposeLineAfter,
  isComposeChordBarRow,
  isComposeChordOnlyLine,
  mergeSongDataWithComposeSections,
  moveComposeChordBetweenLines,
  moveComposeChordToIndex,
  moveComposeChordToLineAfter,
  normalizeChordOnlyLine,
  normalizeComposeLineForLanguageTracks,
  updateComposeLineChordsForTrack,
  composeLineEffectiveLanguageTrackCount,
  composeLineHasTranslationContent,
  parseComposeChordDurationBeats,
  parseFormattedChordToken,
  positionFromBarPointer,
  positionFromPointer,
  positionFromMonospacePointer,
  resizeAdjacentComposeBarDurations,
  resizeComposeBarDuration,
  snapComposeBarDurationMillis,
} from '@/lib/song-editor-compose'

function mockEngine(): ChordEngine {
  const sample: ChordSongData = {
    titles: ['Test'],
    key: { level: 3 },
    sections: [
      {
        title: 'Verse 1',
        repeat_count: 1,
        lines: [
          {
            parts: [
              { chord: null, languages: ['Hello '], comment: false },
              {
                chord: {
                  main: { level: 0 },
                  base: null,
                  kind: 'Major',
                  var: '',
                  duration: null,
                  optional: false,
                  root_spelling_hint: 'default',
                },
                languages: ['world'],
                comment: false,
              },
            ],
          },
        ],
      },
    ],
  }

  return {
    parseChordPro(source: string) {
      if (source.includes('[G:4]')) {
        return {
          ...sample,
          sections: [
            {
              title: '_',
              repeat_count: 1,
              lines: [
                {
                  parts: [
                    {
                      chord: {
                        main: { level: 7 },
                        base: null,
                        kind: 'Major',
                        var: '',
                        duration: 4000,
                        optional: false,
                        root_spelling_hint: 'default',
                      },
                      languages: ['x'],
                      comment: false,
                    },
                  ],
                },
              ],
            },
          ],
        }
      }
      if (source.includes('[D:2]')) {
        return {
          ...sample,
          sections: [
            {
              title: '_',
              repeat_count: 1,
              lines: [
                {
                  parts: [
                    {
                      chord: {
                        main: { level: 2 },
                        base: null,
                        kind: 'Major',
                        var: '',
                        duration: 2000,
                        optional: false,
                        root_spelling_hint: 'default',
                      },
                      languages: ['x'],
                      comment: false,
                    },
                  ],
                },
              ],
            },
          ],
        }
      }
      if (source.includes('[G:2]')) {
        return {
          ...sample,
          sections: [
            {
              title: '_',
              repeat_count: 1,
              lines: [
                {
                  parts: [
                    {
                      chord: {
                        main: { level: 7 },
                        base: null,
                        kind: 'Major',
                        var: '',
                        duration: 2000,
                        optional: false,
                        root_spelling_hint: 'default',
                      },
                      languages: ['x'],
                      comment: false,
                    },
                  ],
                },
              ],
            },
          ],
        }
      }
      if (source.includes('[G]')) {
        return {
          ...sample,
          sections: [
            {
              title: '_',
              repeat_count: 1,
              lines: [
                {
                  parts: [
                    {
                      chord: {
                        main: { level: 7 },
                        base: null,
                        kind: 'Major',
                        var: '',
                        duration: null,
                        optional: false,
                        root_spelling_hint: 'default',
                      },
                      languages: ['x'],
                      comment: false,
                    },
                  ],
                },
              ],
            },
          ],
        }
      }
      if (source.includes('[C]')) {
        return sample
      }
      return sample
    },
    parseUltimateGuitarHtml() {
      return sample
    },
    parseSongBeamer() {
      return sample
    },
    parseProPresenter() {
      return sample
    },
    formatChordPro(song: ChordSongData) {
      const sections = song.sections as
        | Array<{
            lines?: Array<{
              parts?: Array<{ chord?: { main?: { level?: number }; duration?: number | null } }>
            }>
          }>
        | undefined
      const chord = sections?.[0]?.lines?.[0]?.parts?.[0]?.chord
      const level = chord?.main?.level
      const duration = chord?.duration
      if (level === 7) {
        if (duration === 4000) return '{title: _}\n{key: C}\n{section: _}\n[G:4]x'
        if (duration === 2000) return '{title: _}\n{key: C}\n{section: _}\n[G:2]x'
        return '{title: _}\n{key: C}\n{section: _}\n[G]x'
      }
      if (level === 0) {
        if (duration === 2000) return '{title: _}\n{key: C}\n{section: _}\n[C:2]x'
        return '{title: _}\n{key: C}\n{section: _}\n[C]x'
      }
      return '{title: _}\n{section: _}\nx'
    },
    formatSongBeamer() {
      return new Uint8Array()
    },
    formatProPresenter() {
      return new Uint8Array()
    },
    renderA4Html() {
      return { html: '<div/>', css: '' }
    },
    renderA4SectionHtmls() {
      return { sections: ['<p/>'], css: '' }
    },
    transpose(song: ChordSongData) {
      return song
    },
    fillSectionReferences(song: ChordSongData) {
      return song
    },
    flowItems() {
      return []
    },
    customFlow() {
      return []
    },
    applyFlow(song: ChordSongData) {
      return song
    },
  }
}

describe('composeSectionsFromSongData', () => {
  it('maps wire parts into line text and chord positions', () => {
    const engine = mockEngine()
    const sections = composeSectionsFromSongData(
      {
        sections: [
          {
            title: 'Verse 1',
            repeat_count: 1,
            lines: [
              {
                parts: [
                  { chord: null, languages: ['Hello '], comment: false },
                  {
                    chord: {
                      main: { level: 0 },
                      base: null,
                      kind: 'Major',
                      var: '',
                      duration: null,
                      optional: false,
                      root_spelling_hint: 'default',
                    },
                    languages: ['world'],
                    comment: false,
                  },
                ],
              },
            ],
          },
        ],
      },
      engine,
      'C',
      'letters',
    )

    expect(sections).toHaveLength(1)
    expect(sections[0]?.title).toBe('Verse 1')
    expect(sections[0]?.lines[0]?.text).toBe('Hello world')
    expect(sections[0]?.lines[0]?.chords[0]?.position).toBe(6)
    expect(sections[0]?.lines[0]?.chords[0]?.symbol).toBe('C')
    expect(sections[0]?.lines[0]?.chords[0]?.durationMillis).toBeNull()
  })

  it('skips empty wire lines when importing compose sections', () => {
    const engine = mockEngine()
    const sections = composeSectionsFromSongData(
      {
        sections: [
          {
            title: 'Verse',
            repeat_count: 1,
            lines: [
              {
                parts: [{ chord: null, languages: ['Hello world'], comment: false }],
              },
              {
                parts: [{ chord: null, languages: [''], comment: false }],
              },
            ],
          },
        ],
      },
      engine,
      'C',
      'letters',
    )

    expect(sections[0]?.lines).toHaveLength(1)
    expect(sections[0]?.lines[0]?.text).toBe('Hello world')
  })

  it('imports parallel translation tracks from wire parts', () => {
    const engine = mockEngine()
    const sections = composeSectionsFromSongData(
      {
        languages: ['en', 'de'],
        sections: [
          {
            title: 'Verse 1',
            repeat_count: 1,
            lines: [
              {
                parts: [
                  { chord: null, languages: ['Hello ', 'Hallo '], comment: false },
                  {
                    chord: {
                      main: { level: 0 },
                      base: null,
                      kind: 'Major',
                      var: '',
                      duration: null,
                      optional: false,
                      root_spelling_hint: 'default',
                    },
                    languages: ['world', 'Welt'],
                    comment: false,
                  },
                ],
              },
            ],
          },
        ],
      },
      engine,
      'C',
      'letters',
    )

    expect(sections[0]?.lines[0]?.text).toBe('Hello world')
    expect(sections[0]?.lines[0]?.translations).toEqual(['Hallo Welt'])
  })
})

describe('composeSectionsToSongSections', () => {
  it('rebuilds wire parts from editable lines', () => {
    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Chorus',
          repeatCount: 1,
          lines: [
            {
              id: 'line-1',
              text: 'Hello world',
              chords: [{ id: 'c1', position: 6, symbol: 'G', durationMillis: null }],
            },
          ],
        },
      ],
      engine,
      'C',
    ) as Array<{ title?: string; lines?: Array<{ parts?: unknown[] }> }>

    expect(wire[0]?.title).toBe('Chorus')
    expect(wire[0]?.lines?.[0]?.parts).toEqual([
      { chord: null, languages: ['Hello '], comment: false },
      expect.objectContaining({ languages: ['world'] }),
    ])
  })

  it('exports parallel translation tracks into wire parts', () => {
    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Verse 1',
          repeatCount: 1,
          lines: [
            {
              id: 'line-1',
              text: 'Hello world',
              translations: ['Hallo Welt'],
              chords: [{ id: 'c1', position: 6, symbol: 'G', durationMillis: null }],
            },
          ],
        },
      ],
      engine,
      'C',
      '4/4',
      2,
    ) as Array<{ lines?: Array<{ parts?: Array<{ languages?: string[] }> }> }>

    expect(wire[0]?.lines?.[0]?.parts).toEqual([
      { chord: null, languages: ['Hello ', 'Hallo '], comment: false },
      expect.objectContaining({ languages: ['world', 'Welt'] }),
    ])
  })

  it('exports translation chord positions independently per language track', () => {
    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Verse 1',
          repeatCount: 1,
          lines: [
            {
              id: 'line-1',
              text: 'Hello world',
              translations: ['Hallo Welt'],
              chords: [{ id: 'c1', position: 6, symbol: 'G', durationMillis: null }],
              translationChords: [[{ id: 'c2', position: 5, symbol: 'G', durationMillis: null }]],
            },
          ],
        },
      ],
      engine,
      'C',
      '4/4',
      2,
    ) as Array<{ lines?: Array<{ parts?: Array<{ languages?: string[] }> }> }>

    expect(wire[0]?.lines?.[0]?.parts).toEqual([
      { chord: null, languages: ['Hello ', 'Hallo'], comment: false },
      expect.objectContaining({ languages: ['world', ' Welt'] }),
    ])
  })

  it('exports incompatible translation chords on a separate wire line', () => {
    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Verse 1',
          repeatCount: 1,
          lines: [
            {
              id: 'line-1',
              text: 'Hello world',
              translations: ['Hallo Welt'],
              chords: [{ id: 'c1', position: 0, symbol: 'G', durationMillis: null }],
              translationChords: [[{ id: 'c2', position: 0, symbol: 'C', durationMillis: null }]],
            },
          ],
        },
      ],
      engine,
      'C',
      '4/4',
      2,
    ) as Array<{ lines?: Array<{ parts?: Array<{ languages?: string[] }> }> }>

    expect(wire[0]?.lines).toHaveLength(2)
    expect(wire[0]?.lines?.[0]?.parts?.[0]?.languages).toEqual(['Hello world', ''])
    expect(wire[0]?.lines?.[1]?.parts?.[0]?.languages).toEqual(['', 'Hallo Welt'])
  })

  it('detects translation chord mismatches for compose warnings', () => {
    const line = {
      text: "I've been washed from the inside out",
      chords: [{ id: 'c1', position: 10, symbol: '1', durationMillis: null }],
      translations: ['Ich bin von innen heraus gewaschen'],
      translationChords: [
        [
          { id: 'c2', position: 12, symbol: '5', durationMillis: null },
          { id: 'c3', position: 24, symbol: '1', durationMillis: null },
        ],
      ],
    }

    expect(composeTranslationTrackChordsMismatch(line, 1, '4/4')).toBe(true)
  })

  it('warns when translation has no chords but primary does', () => {
    const line = {
      text: 'Hello world',
      chords: [{ id: 'c1', position: 0, symbol: 'G', durationMillis: null }],
      translations: ['Hallo Welt'],
      translationChords: [[]],
    }

    expect(composeTranslationTrackChordsMismatch(line, 1, '4/4')).toBe(true)
  })

  it('inherits primary chords on translation tracks when wire omits matching markers', () => {
    const line = {
      id: 'line-1',
      text: 'Hello world',
      chords: [{ id: 'c1', position: 6, symbol: 'G', durationMillis: null }],
      translations: ['Hallo Welt'],
    }

    expect(composeLineChordsForTrack(line, 1)).toEqual(line.chords)
    expect(composeTranslationTrackChordsMismatch(line, 1, '4/4')).toBe(false)
  })

  it('ignores translation chord mismatch when neither line has chords', () => {
    const line = {
      text: 'Hello world',
      chords: [],
      translations: ['Hallo Welt'],
    }

    expect(composeTranslationTrackChordsMismatch(line, 1, '4/4')).toBe(false)
  })

  it('ignores translation chord mismatch when chords match', () => {
    const line = {
      text: 'Hello world',
      chords: [{ id: 'c1', position: 0, symbol: 'G', durationMillis: null }],
      translations: ['Hallo Welt'],
      translationChords: [[{ id: 'c2', position: 5, symbol: 'G', durationMillis: null }]],
    }

    expect(composeTranslationTrackChordsMismatch(line, 1, '4/4')).toBe(false)
  })

  it('round-trips independent translation chord positions through wire lines', () => {
    const engine = mockEngine()
    const original = [
      {
        id: 'sec-1',
        title: 'Verse 1',
        repeatCount: 1,
        lines: [
          {
            id: 'line-1',
            text: 'Hello world',
            translations: ['Hallo Welt'],
            chords: [{ id: 'c1', position: 6, symbol: 'G', durationMillis: null }],
            translationChords: [[{ id: 'c2', position: 5, symbol: 'G', durationMillis: null }]],
          },
        ],
      },
    ]

    const wire = composeSectionsToSongSections(original, engine, 'C', '4/4', 2)
    const imported = composeSectionsFromSongData({ sections: wire }, engine, 'C', 'letters')
    const line = imported[0]?.lines[0]

    expect(line?.chords[0]?.position).toBe(6)
    expect(line?.translationChords?.[0]?.[0]?.position).toBe(5)
  })

  it('does not fabricate translation chords when wire shares primary chord markers', () => {
    const engine = mockEngine()
    const imported = composeSectionsFromSongData(
      {
        languages: ['en', 'de'],
        sections: [
          {
            title: 'Verse 1',
            repeat_count: 1,
            lines: [
              {
                parts: [
                  { chord: null, languages: ['Hello ', 'Hallo '], comment: false },
                  {
                    chord: {
                      main: { level: 0 },
                      base: null,
                      kind: 'Major',
                      var: '',
                      duration: null,
                      optional: false,
                      root_spelling_hint: 'default',
                    },
                    languages: ['world', 'Welt'],
                    comment: false,
                  },
                ],
              },
            ],
          },
        ],
      },
      engine,
      'C',
      'letters',
    )
    const line = imported[0]?.lines[0]

    expect(line?.chords[0]?.position).toBe(6)
    expect(line?.translationChords).toBeUndefined()
    expect(composeLineChordsForTrack(line!, 1)).toEqual(line?.chords)
    expect(composeTranslationTrackChordsMismatch(line!, 1, '4/4')).toBe(false)
  })

  it('round-trips independent translation chords through wire lines', () => {
    const engine = mockEngine()
    const original = [
      {
        id: 'sec-1',
        title: 'Verse 1',
        repeatCount: 1,
        lines: [
          {
            id: 'line-1',
            text: 'Hello world',
            translations: ['Hallo Welt'],
            chords: [{ id: 'c1', position: 0, symbol: 'G', durationMillis: null }],
            translationChords: [[{ id: 'c2', position: 0, symbol: 'C', durationMillis: null }]],
          },
        ],
      },
    ]

    const wire = composeSectionsToSongSections(original, engine, 'C', '4/4', 2)
    const imported = composeSectionsFromSongData({ sections: wire }, engine, 'C', 'letters')
    const line = imported[0]?.lines[0]

    expect(line?.text).toBe('Hello world')
    expect(line?.translations).toEqual(['Hallo Welt'])
    expect(line?.chords[0]?.symbol).toBe('G')
    expect(line?.translationChords?.[0]?.[0]?.symbol).toBe('C')
  })

  it('normalizes translation slots to match language track count', () => {
    const line = createComposeLine('Primary', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0)
    expect(normalizeComposeLineForLanguageTracks(line, 3)).toEqual({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      text: 'Primary',
      translations: ['', ''],
      chords: [],
      translationChords: [[], []],
    })
  })

  it('creates translation chord slots even when translations were not initialized', () => {
    const line = createComposeLine('Primary')
    const next = updateComposeLineChordsForTrack(line, 1, [
      { id: 'c1', position: 4, symbol: 'G', durationMillis: null },
    ])
    expect(next.translations).toEqual([''])
    expect(next.translationChords).toEqual([
      [{ id: 'c1', position: 4, symbol: 'G', durationMillis: null }],
    ])
  })

  it('detects multi-line paste segments', () => {
    expect(splitPasteIntoLineSegments('one line')).toBeNull()
    expect(splitPasteIntoLineSegments('one\ntwo')).toEqual(['one', 'two'])
    expect(splitPasteIntoLineSegments('one\r\ntwo')).toEqual(['one', 'two'])
  })

  it('builds multiple compose lines from primary paste', () => {
    const line = createComposeLine('Hello world', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1)
    line.translations = ['Hola mundo']

    const result = buildComposeLinesFromPaste(line, 0, 6, 6, 'foo\nbar')
    expect(result).not.toBeNull()
    expect(result!.lines).toHaveLength(2)
    expect(result!.lines[0]!.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(result!.lines[0]!.text).toBe('Hello foo')
    expect(result!.lines[0]!.translations?.[0]).toBe('Hola m')
    expect(result!.lines[1]!.text).toBe('barworld')
    expect(result!.lines[1]!.translations?.[0]).toBe('undo')
    expect(result!.focusLineId).toBe(result!.lines[1]!.id)
  })

  it('builds multiple compose lines from translation paste', () => {
    const line = createComposeLine('Hello world', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1)
    line.translations = ['Hola mundo']

    const result = buildComposeLinesFromPaste(line, 1, 5, 5, 'foo\nbar')
    expect(result).not.toBeNull()
    expect(result!.lines[0]!.text).toBe('Hello')
    expect(result!.lines[0]!.translations?.[0]).toBe('Hola foo')
    expect(result!.lines[1]!.text).toBe(' world')
    expect(result!.lines[1]!.translations?.[0]).toBe('barmundo')
  })

  it('replaces selected text when pasting multiple lines', () => {
    const line = createComposeLine('Hello world', 'cccccccc-cccc-cccc-cccc-cccccccccccc')

    const result = buildComposeLinesFromPaste(line, 0, 5, 6, 'a\nb')
    expect(result!.lines[0]!.text).toBe('Helloa')
    expect(result!.lines[1]!.text).toBe('bworld')
  })

  it('returns null for single-line paste text', () => {
    const line = createComposeLine('Hello')
    expect(buildComposeLinesFromPaste(line, 0, 5, 5, 'foo')).toBeNull()
  })

  it('omits blank translation tracks from wire parts', () => {
    expect(composeLineHasTranslationContent({ translations: ['', '  '] })).toBe(false)
    expect(composeLineHasTranslationContent({ translations: ['Hallo'] })).toBe(true)
    expect(composeLineEffectiveLanguageTrackCount({ translations: [''] }, 2)).toBe(1)
    expect(composeLineEffectiveLanguageTrackCount({ translations: ['Hallo'] }, 2)).toBe(2)

    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Verse 1',
          repeatCount: 1,
          lines: [
            {
              id: 'line-1',
              text: "It's getting harder to recognize",
              translations: [''],
              chords: [{ id: 'c1', position: 0, symbol: '5', durationMillis: null }],
            },
          ],
        },
      ],
      engine,
      'C',
      '4/4',
      2,
    ) as Array<{ lines?: Array<{ parts?: Array<{ languages?: string[] }> }> }>

    expect(wire[0]?.lines?.[0]?.parts?.every((part) => part.languages?.length === 1)).toBe(true)
    expect(wire[0]?.lines?.[0]?.parts?.[0]?.languages).toEqual([
      "It's getting harder to recognize",
    ])
  })

  it('omits empty placeholder lines from wire export', () => {
    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Verse',
          repeatCount: 1,
          lines: [
            createComposeLine('Hello world'),
            createComposeLine(),
          ],
        },
      ],
      engine,
      'C',
    ) as Array<{ lines?: unknown[] }>

    expect(wire[0]?.lines).toHaveLength(1)
  })

  it('keeps chord-only lines when filtering empty placeholder rows', () => {
    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Intro',
          repeatCount: 1,
          lines: [
            createComposeLine(),
            createComposeChordOnlyLine('G'),
          ],
        },
      ],
      engine,
      'C',
    ) as Array<{ lines?: Array<{ parts?: Array<{ chord?: unknown }> }> }>

    expect(wire[0]?.lines).toHaveLength(1)
    expect(wire[0]?.lines?.[0]?.parts?.some((part) => part.chord != null)).toBe(true)
  })
})

describe('mergeSongDataWithComposeSections', () => {
  it('replaces sections on parsed song data', () => {
    const engine = mockEngine()
    const merged = mergeSongDataWithComposeSections(
      { titles: ['Song'], sections: [] },
      [
        {
          id: 'sec',
          title: 'Verse',
          repeatCount: 1,
          lines: [createComposeLine('Plain line')],
        },
      ],
      engine,
      'C',
    )

    expect(merged.sections).toHaveLength(1)
    expect((merged.sections as Array<{ title?: string }>)?.[0]?.title).toBe('Verse')
  })
})

describe('compose duration helpers', () => {
  it('formats and parses beat durations', () => {
    expect(parseFormattedChordToken('G:4')).toEqual({ symbol: 'G', durationMillis: 4000 })
    expect(parseComposeChordDurationBeats('1.5')).toBe(1500)
    expect(
      composeChordDisplayLabel({ symbol: 'Am', durationMillis: 1500 }),
    ).toBe('Am:1.5')
  })

  it('maps chord-only worship pro lines to spaced positions', () => {
    const engine = mockEngine()
    const sections = composeSectionsFromSongData(
      {
        sections: [
          {
            title: 'Intro',
            repeat_count: 1,
            lines: [
              {
                parts: [
                  {
                    chord: {
                      main: { level: 7 },
                      base: null,
                      kind: 'Major',
                      var: '',
                      duration: 4000,
                      optional: false,
                      root_spelling_hint: 'default',
                    },
                    languages: [''],
                    comment: false,
                  },
                  {
                    chord: {
                      main: { level: 0 },
                      base: null,
                      kind: 'Major',
                      var: '',
                      duration: 2000,
                      optional: false,
                      root_spelling_hint: 'default',
                    },
                    languages: [''],
                    comment: false,
                  },
                ],
              },
            ],
          },
        ],
      },
      engine,
      'C',
      'letters',
    )

    const line = sections[0]?.lines[0]
    expect(line?.text).toBe('')
    expect(line?.chords).toEqual([
      expect.objectContaining({ symbol: 'G', position: 0, durationMillis: 4000 }),
      expect.objectContaining({ symbol: 'C', position: 1, durationMillis: 2000 }),
    ])
  })

  it('round-trips chord duration through wire parts', () => {
    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Intro',
          repeatCount: 1,
          lines: [
            {
              id: 'line-1',
              text: 'x',
              chords: [{ id: 'c1', position: 0, symbol: 'G', durationMillis: 4000 }],
            },
          ],
        },
      ],
      engine,
      'C',
      '4/4',
    ) as Array<{ lines?: Array<{ parts?: Array<{ chord?: { duration?: number | null } }> }> }>

    expect(wire[0]?.lines?.[0]?.parts?.[0]?.chord?.duration).toBeNull()
  })

  it('exports chord-only lines without spacer text between chords', () => {
    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Intro',
          repeatCount: 1,
          lines: [
            normalizeChordOnlyLine({
              id: 'line-1',
              text: '',
              chords: [
                { id: 'c1', position: 0, symbol: 'G', durationMillis: null },
                { id: 'c2', position: 1, symbol: 'D', durationMillis: 2000 },
                { id: 'c3', position: 2, symbol: 'C', durationMillis: null },
              ],
            }),
          ],
        },
      ],
      engine,
      'C',
      '4/4',
    ) as Array<{ lines?: Array<{ parts?: Array<{ languages?: string[] }> }> }>

    expect(wire[0]?.lines?.[0]?.parts).toEqual([
      expect.objectContaining({ languages: [''] }),
      expect.objectContaining({ languages: [''] }),
      expect.objectContaining({ languages: [''] }),
    ])
  })

  it('omits one-bar durations but keeps shorter lengths in wire parts', () => {
    const engine = mockEngine()
    const wire = composeSectionsToSongSections(
      [
        {
          id: 'sec-1',
          title: 'Intro',
          repeatCount: 1,
          lines: [
            {
              id: 'line-1',
              text: '  ',
              chords: [
                { id: 'c1', position: 0, symbol: 'G', durationMillis: 4000 },
                { id: 'c2', position: 1, symbol: 'D', durationMillis: 2000 },
              ],
            },
          ],
        },
      ],
      engine,
      'C',
      '4/4',
    ) as Array<{ lines?: Array<{ parts?: Array<{ chord?: { duration?: number | null } }> }> }>

    expect(wire[0]?.lines?.[0]?.parts?.[0]?.chord?.duration).toBeNull()
    expect(wire[0]?.lines?.[0]?.parts?.[1]?.chord?.duration).toBe(2000)
  })

  it('maps full-bar durations to null for ChordPro export', () => {
    expect(composeChordDurationForWire(null, '4/4')).toBeNull()
    expect(composeChordDurationForWire(4000, '4/4')).toBeNull()
    expect(composeChordDurationForWire(6000, '6/8')).toBeNull()
    expect(composeChordDurationForWire(2000, '4/4')).toBe(2000)
  })
})

describe('chord-only bar helpers', () => {
  it('detects chord-only lines', () => {
    expect(isComposeChordOnlyLine({ text: '  ', chords: [{ id: '1', position: 0, symbol: 'G', durationMillis: 4000 }] })).toBe(
      true,
    )
    expect(isComposeChordOnlyLine({ text: 'Hello', chords: [{ id: '1', position: 0, symbol: 'G', durationMillis: null }] })).toBe(
      false,
    )
  })

  it('detects empty chord bar rows and converts lyric lines', () => {
    const emptyLyricLine = createComposeLine()
    expect(isComposeChordBarRow(emptyLyricLine)).toBe(false)

    const chordBarLine = convertComposeLineToChordBar(emptyLyricLine)
    expect(isComposeChordBarRow(chordBarLine)).toBe(true)
    expect(chordBarLine.text).toBe('')
    expect(chordBarLine.chords).toEqual([])
    expect(chordBarLine.chordBar).toBe(true)
    expect(chordBarLine.translations).toBeUndefined()

    const lyricLine = createComposeLine('Hello')
    expect(isComposeChordBarRow(lyricLine)).toBe(false)
  })

  it('normalizes positions and spacer text', () => {
    const normalized = normalizeChordOnlyLine({
      id: 'line',
      text: '',
      chords: [
        { id: 'b', position: 2, symbol: 'C', durationMillis: 2000 },
        { id: 'a', position: 0, symbol: 'G', durationMillis: 4000 },
      ],
    })

    expect(normalized.text).toBe('')
    expect(normalized.chords.map((chord) => chord.position)).toEqual([0, 1])
    expect(normalized.chords.map((chord) => chord.symbol)).toEqual(['G', 'C'])
  })

  it('inserts and moves chords by bar index', () => {
    const base = normalizeChordOnlyLine({
      id: 'line',
      text: '  ',
      chords: [
        { id: 'a', position: 0, symbol: 'G', durationMillis: 4000 },
        { id: 'b', position: 1, symbol: 'C', durationMillis: 2000 },
      ],
    })

    const inserted = addComposeChordAtIndex(base, 'D', 1)
    expect(inserted.chords.map((chord) => chord.symbol)).toEqual(['G', 'D', 'C'])

    const moved = moveComposeChordToIndex(inserted, 'b', 0)
    expect(moved.chords.map((chord) => chord.symbol)).toEqual(['C', 'G', 'D'])
  })

  it('maps bar pointer to insert index using beat-snapped grid positions', () => {
    const weights = [4000, 1000, 7000]
    expect(positionFromBarPointer(5, 0, 100, 3, weights, '4/4')).toBe(0)
    expect(positionFromBarPointer(25, 0, 100, 3, weights, '4/4')).toBe(1)
    expect(positionFromBarPointer(95, 0, 100, 3, weights, '4/4')).toBe(3)
  })

  it('maps an empty chord bar pointer to a four-bar slot index', () => {
    expect(positionFromBarPointer(10, 0, 100, 0, [], '4/4')).toBe(0)
    expect(positionFromBarPointer(40, 0, 100, 0, [], '4/4')).toBe(1)
    expect(positionFromBarPointer(90, 0, 100, 0, [], '4/4')).toBe(3)
  })

  it('pads empty bar slots when inserting on a sparse grid', () => {
    const line = convertComposeLineToChordBar(createComposeLine())
    const next = addComposeChordAtIndex(line, 'G', 2, null, '4/4')
    expect(next.chords.map((chord) => chord.symbol)).toEqual([
      COMPOSE_BAR_HOLD_SYMBOL,
      COMPOSE_BAR_HOLD_SYMBOL,
      'G',
    ])
  })

  it('appends into the unfilled tail with a partial-bar duration', () => {
    const line = normalizeChordOnlyLine({
      id: 'line',
      text: '',
      chords: [
        { id: 'a', position: 0, symbol: '1', durationMillis: 2000 },
        { id: 'b', position: 1, symbol: '4', durationMillis: 2000 },
        { id: 'c', position: 2, symbol: '5', durationMillis: 2000 },
      ],
    })

    expect(composeBarAppendDurationMillis([2000, 2000, 2000], '4/4')).toBe(2000)

    const next = addComposeChordAtIndex(line, 'G', 3, null, '4/4')
    expect(next.chords).toHaveLength(4)
    expect(next.chords[3]?.symbol).toBe('G')
    expect(next.chords[3]?.durationMillis).toBe(2000)
  })

  it('shows append markers in the empty tail of the display grid', () => {
    const weights = [2000, 2000, 2000]
    expect(composeBarInsertMarkerPercent(3, 3, weights, '4/4', 7000)).toBeCloseTo(87.5)
  })

  it('lays out a one-bar preview slot between existing bar chords', () => {
    const weights = [4000, 4000]
    const preview = composeBarInsertPreviewSegmentLayout(weights, 1, '4/4')
    expect(preview?.previewIndex).toBe(1)
    expect(preview?.layouts[0]?.offsetPercent).toBeCloseTo(0)
    expect(preview?.layouts[0]?.widthPercent).toBeCloseTo(100 / 3)
    expect(preview?.layouts[1]?.offsetPercent).toBeCloseTo(100 / 3)
    expect(preview?.layouts[1]?.widthPercent).toBeCloseTo(100 / 3)
    expect(preview?.layouts[2]?.offsetPercent).toBeCloseTo(200 / 3)
    expect(preview?.layouts[2]?.widthPercent).toBeCloseTo(100 / 3)
  })

  it('lays out a one-bar preview slot at the start and end of a bar row', () => {
    const weights = [4000, 2000]
    const start = composeBarInsertPreviewSegmentLayout(weights, 0, '4/4')
    expect(start?.previewIndex).toBe(0)
    expect(start?.layouts[0]?.offsetPercent).toBeCloseTo(0)
    expect(start?.layouts[0]?.widthPercent).toBeCloseTo(100 / 3)
    expect(start?.layouts[1]?.offsetPercent).toBeCloseTo(100 / 3)
    expect(start?.layouts[2]?.offsetPercent).toBeCloseTo(200 / 3)

    const end = composeBarInsertPreviewSegmentLayout(weights, 2, '4/4')
    expect(end?.previewIndex).toBe(2)
    expect(end?.layouts[0]?.offsetPercent).toBeCloseTo(0)
    expect(end?.layouts[0]?.widthPercent).toBeCloseTo(50)
    expect(end?.layouts[1]?.offsetPercent).toBeCloseTo(50)
    expect(end?.layouts[1]?.widthPercent).toBeCloseTo(25)
    expect(end?.layouts[2]?.offsetPercent).toBeCloseTo(75)
    expect(end?.layouts[2]?.widthPercent).toBeCloseTo(25)
  })

  it('lays out a one-bar preview slot on an empty bar row', () => {
    const first = composeBarInsertPreviewSegmentLayout([], 0, '4/4')
    expect(first?.previewIndex).toBe(0)
    expect(first?.layouts[0]).toEqual({ offsetPercent: 0, widthPercent: 25 })

    const second = composeBarInsertPreviewSegmentLayout([], 1, '4/4')
    expect(second?.previewIndex).toBe(0)
    expect(second?.layouts[0]).toEqual({ offsetPercent: 25, widthPercent: 25 })
  })

  it('treats missing duration as one full bar for bar layout', () => {
    expect(composeChordBarWeight(null, '4/4')).toBe(4000)
    expect(composeChordBarWeight(null, '6/8')).toBe(6000)
    expect(composeChordBarWeight(2000, '4/4')).toBe(2000)
  })

  it('lays out segment and boundary percentages on a content-sized display grid', () => {
    const weights = [4000, 1000, 1000]
    const gridMillis = 8000
    const layout = composeBarSegmentLayout(weights, '4/4')
    expect(layout[0]).toEqual({ offsetPercent: 0, widthPercent: (4000 / gridMillis) * 100 })
    expect(layout[1]?.offsetPercent).toBeCloseTo((4000 / gridMillis) * 100)
    expect(layout[1]?.widthPercent).toBeCloseTo((1000 / gridMillis) * 100)
    expect(layout[2]?.offsetPercent).toBeCloseTo((5000 / gridMillis) * 100)
    expect(layout[2]?.widthPercent).toBeCloseTo((1000 / gridMillis) * 100)
    expect(composeBarBoundaryPercent(weights, 0, '4/4')).toBeCloseTo((4000 / gridMillis) * 100)
    expect(composeBarBoundaryPercent(weights, 1, '4/4')).toBeCloseTo((5000 / gridMillis) * 100)
  })

  it('keeps a fixed grid when layout override millis are provided during resize preview', () => {
    const frozenGridMillis = 16000
    const previewWeights = [4000]
    const layout = composeBarSegmentLayout(previewWeights, '4/4', frozenGridMillis)
    expect(layout[0]).toEqual({ offsetPercent: 0, widthPercent: 25 })
    expect(composeBarBoundaryPercent(previewWeights, 0, '4/4', frozenGridMillis)).toBeCloseTo(25)
  })

  it('places the trailing boundary at the end of chord content', () => {
    const weights = [2000, 2000, 2000]
    expect(composeBarBoundaryPercent(weights, 2, '4/4')).toBeCloseTo(75)
  })

  it('uses four measures only for empty chord bars', () => {
    expect(composeChordBarDisplayMeasureCount(0, '4/4')).toBe(4)
    expect(composeChordBarDisplayMeasureCount(4000, '4/4')).toBe(1)
    expect(composeChordBarDisplayMeasureCount(8000, '4/4')).toBe(2)
    expect(composeChordBarDisplayMeasureCount(16000, '4/4')).toBe(4)
    expect(composeChordBarDisplayMeasureCount(16001, '4/4')).toBe(5)
  })

  it('starts at one bar and grows by one bar when chords exceed the grid', () => {
    expect(composeChordBarMeasureCount(0, '4/4')).toBe(1)
    expect(composeChordBarMeasureCount(4000, '4/4')).toBe(1)
    expect(composeChordBarMeasureCount(4001, '4/4')).toBe(2)
    expect(composeChordBarMeasureCount(8000, '4/4')).toBe(2)
    expect(composeChordBarMeasureCount(8001, '4/4')).toBe(3)
  })

  it('adjusts only the left bar duration when resizing a boundary', () => {
    expect(resizeAdjacentComposeBarDurations(4000, 2000, 1000)).toEqual({
      leftDurationMillis: 5000,
      rightDurationMillis: 2000,
    })
    expect(resizeAdjacentComposeBarDurations(4000, 2000, -5000)).toEqual({
      leftDurationMillis: 1000,
      rightDurationMillis: 2000,
    })
    expect(resizeAdjacentComposeBarDurations(400, 400, 0)).toEqual({
      leftDurationMillis: 1000,
      rightDurationMillis: 400,
    })
  })

  it('snaps resized bar durations to whole beats', () => {
    expect(snapComposeBarDurationMillis(4240)).toBe(4000)
    expect(snapComposeBarDurationMillis(4500)).toBe(5000)
    expect(resizeComposeBarDuration(4000, 250)).toBe(4000)
    expect(resizeAdjacentComposeBarDurations(4000, 2000, 250)).toEqual({
      leftDurationMillis: 4000,
      rightDurationMillis: 2000,
    })
  })

  it('detects chord-only lines that do not fill complete measures', () => {
    const line = {
      id: 'line',
      text: '   ',
      chords: [
        { id: 'a', position: 0, symbol: 'G', durationMillis: 7000 },
        { id: 'b', position: 1, symbol: 'D', durationMillis: 1000 },
        { id: 'c', position: 2, symbol: 'C', durationMillis: 7000 },
        { id: 'd', position: 3, symbol: 'D', durationMillis: 1000 },
      ],
    }

    expect(composeChordOnlyLineMeasureMismatch(line, '4/4')).toBeNull()
    expect(composeChordOnlyLineMeasureMismatch(line, '6/8')).toEqual({
      totalBeats: '16',
      beatsPerMeasure: 6,
      timeSignature: '6/8',
    })
    expect(composeChordOnlyLineMeasureMismatch(line, '')).toBeNull()
  })

  it('creates a chord-only line from a pool symbol', () => {
    const line = createComposeChordOnlyLine('Am')
    expect(isComposeChordOnlyLine(line)).toBe(true)
    expect(line.chords).toHaveLength(1)
    expect(line.chords[0]?.symbol).toBe('Am')
    expect(line.chords[0]?.durationMillis).toBeNull()
    expect(composeChordBarWeight(line.chords[0]?.durationMillis, '4/4')).toBe(4000)
  })

  it('defaults new bar chords to one full measure from the time signature', () => {
    expect(composeDefaultBarDurationMillis('4/4')).toBe(4000)
    expect(composeDefaultBarDurationMillis('6/8')).toBe(6000)
    expect(composeDefaultBarDurationMillis('')).toBe(4000)

    const base = normalizeChordOnlyLine({
      id: 'line',
      text: ' ',
      chords: [{ id: 'a', position: 0, symbol: 'G', durationMillis: null }],
    })
    const inserted = addComposeChordAtIndex(base, 'D', 1, null)
    expect(inserted.chords[1]?.durationMillis).toBeNull()
    expect(composeBarWeightsFromChords(inserted.chords, '4/4')).toEqual([4000, 4000])
  })

  it('inserts a new line after an existing line', () => {
    const lineA = createComposeLine('hello', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    const lineB = createComposeChordOnlyLine('G', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    const sections = [{ id: 'section', title: 'Verse', lines: [lineA], repeatCount: 1 }]

    const next = insertComposeLineAfter(sections, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', lineB)
    expect(next[0]?.lines.map((line) => line.id)).toEqual([
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    ])
    expect(next[0]?.lines[1]?.chords[0]?.symbol).toBe('G')
  })

  it('moves a bar chord onto a new line below', () => {
    const barLine = normalizeChordOnlyLine({
      id: 'bar',
      text: '   ',
      chords: [
        { id: 'a', position: 0, symbol: 'G', durationMillis: 4000 },
        { id: 'b', position: 1, symbol: 'D', durationMillis: 2000 },
        { id: 'c', position: 2, symbol: 'C', durationMillis: 2000 },
      ],
    })
    const sections = [{ id: 'section', title: 'Intro', lines: [barLine], repeatCount: 1 }]

    const next = moveComposeChordToLineAfter(sections, 'bar', 'bar', 'b')
    expect(next[0]?.lines).toHaveLength(2)
    expect(next[0]?.lines[0]?.chords.map((chord) => chord.symbol)).toEqual(['G', 'C'])
    expect(next[0]?.lines[1]?.chords.map((chord) => chord.symbol)).toEqual(['D'])
  })

  it('duplicates a lyric chord at a new position while keeping the original', () => {
    const line = createComposeLine('hello world', 'line')
    line.chords = [{ id: 'a', position: 2, symbol: 'G', durationMillis: null }]

    const next = duplicateComposeChordInLine(line, 0, 'a', 0, 8)
    expect(next.chords).toHaveLength(2)
    expect(next.chords.filter((chord) => chord.symbol === 'G')).toHaveLength(2)
    expect(next.chords.map((chord) => chord.position).sort((a, b) => a - b)).toEqual([2, 8])
    expect(new Set(next.chords.map((chord) => chord.id)).size).toBe(2)
  })

  it('duplicates a bar chord at an insert index while keeping the original', () => {
    const line = normalizeChordOnlyLine({
      id: 'bar',
      text: '   ',
      chords: [
        { id: 'a', position: 0, symbol: 'G', durationMillis: 4000 },
        { id: 'b', position: 1, symbol: 'D', durationMillis: 4000 },
      ],
    })

    const next = duplicateComposeChordInLine(line, 0, 'a', 0, 1)
    expect(next.chords).toHaveLength(3)
    expect(next.chords.map((chord) => chord.symbol)).toEqual(['G', 'G', 'D'])
    expect(new Set(next.chords.map((chord) => chord.id)).size).toBe(3)
  })

  it('duplicates a bar chord onto a new line below without removing the original', () => {
    const barLine = normalizeChordOnlyLine({
      id: 'bar',
      text: '   ',
      chords: [
        { id: 'a', position: 0, symbol: 'G', durationMillis: 4000 },
        { id: 'b', position: 1, symbol: 'D', durationMillis: 2000 },
      ],
    })
    const sections = [{ id: 'section', title: 'Intro', lines: [barLine], repeatCount: 1 }]

    const next = duplicateComposeChordToLineAfter(sections, 'bar', 'bar', 'b')
    expect(next[0]?.lines).toHaveLength(2)
    expect(next[0]?.lines[0]?.chords.map((chord) => chord.symbol)).toEqual(['G', 'D'])
    expect(next[0]?.lines[1]?.chords.map((chord) => chord.symbol)).toEqual(['D'])
    expect(next[0]?.lines[0]?.chords[1]?.id).toBe('b')
    expect(next[0]?.lines[1]?.chords[0]?.id).not.toBe('b')
  })

  it('moves a lyric chord onto another lyric line', () => {
    const sourceLine = createComposeLine('first line', 'line-a')
    sourceLine.chords = [{ id: 'a', position: 1, symbol: 'G', durationMillis: null }]
    const targetLine = createComposeLine('second line', 'line-b')
    const sections = [
      { id: 'section', title: 'Verse', lines: [sourceLine, targetLine], repeatCount: 1 },
    ]

    const next = moveComposeChordBetweenLines(sections, 'line-a', 'line-b', 0, 'a', 4, 1)
    expect(next[0]?.lines[0]?.chords).toEqual([])
    expect(next[0]?.lines[1]?.chords).toEqual([
      { id: 'a', position: 4, symbol: 'G', durationMillis: null },
    ])
  })

  it('duplicates a lyric chord onto another lyric line', () => {
    const sourceLine = createComposeLine('first line', 'line-a')
    sourceLine.chords = [{ id: 'a', position: 1, symbol: 'G', durationMillis: null }]
    const targetLine = createComposeLine('second line', 'line-b')
    const sections = [
      { id: 'section', title: 'Verse', lines: [sourceLine, targetLine], repeatCount: 1 },
    ]

    const next = duplicateComposeChordBetweenLines(sections, 'line-a', 'line-b', 0, 'a', 4, 1)
    expect(next[0]?.lines[0]?.chords).toEqual([
      { id: 'a', position: 1, symbol: 'G', durationMillis: null },
    ])
    expect(next[0]?.lines[1]?.chords).toHaveLength(1)
    expect(next[0]?.lines[1]?.chords[0]?.symbol).toBe('G')
    expect(next[0]?.lines[1]?.chords[0]?.position).toBe(4)
    expect(next[0]?.lines[1]?.chords[0]?.id).not.toBe('a')
  })

  it('moves a bar chord onto another chord bar line', () => {
    const sourceLine = normalizeChordOnlyLine({
      id: 'bar-a',
      text: '   ',
      chords: [
        { id: 'a', position: 0, symbol: 'G', durationMillis: 4000 },
        { id: 'b', position: 1, symbol: 'D', durationMillis: 4000 },
      ],
    })
    const targetLine = normalizeChordOnlyLine({
      id: 'bar-b',
      text: ' ',
      chords: [{ id: 'c', position: 0, symbol: 'C', durationMillis: 4000 }],
    })
    const sections = [
      { id: 'section', title: 'Intro', lines: [sourceLine, targetLine], repeatCount: 1 },
    ]

    const next = moveComposeChordBetweenLines(sections, 'bar-a', 'bar-b', 0, 'b', 1, 1)
    expect(next[0]?.lines[0]?.chords.map((chord) => chord.symbol)).toEqual(['G'])
    expect(next[0]?.lines[1]?.chords.map((chord) => chord.symbol)).toEqual(['C', 'D'])
    expect(next[0]?.lines[1]?.chords[1]?.id).toBe('b')
  })

  it('uses the full four-measure grid width for every chord bar row', () => {
    const longLine = normalizeChordOnlyLine({
      id: 'long',
      text: '    ',
      chords: [
        { id: 'a', position: 0, symbol: 'G', durationMillis: 4000 },
        { id: 'b', position: 1, symbol: 'D', durationMillis: 4000 },
        { id: 'c', position: 2, symbol: 'C', durationMillis: 4000 },
        { id: 'd', position: 3, symbol: 'D', durationMillis: 4000 },
      ],
    })
    const shortLine = normalizeChordOnlyLine({
      id: 'short',
      text: ' ',
      chords: [{ id: 'e', position: 0, symbol: 'Am', durationMillis: 4000 }],
    })
    const sectionLines = [longLine, shortLine]

    expect(composeChordBarRowWidthPercent(longLine, sectionLines, '4/4')).toBe(100)
    expect(composeChordBarRowWidthPercent(shortLine, sectionLines, '4/4')).toBe(100)
    expect(composeChordBarRowWidthPercent(longLine, [longLine], '4/4')).toBe(100)
  })

  it('treats implicit one-bar chords as one full bar on the grid', () => {
    const implicitBar = normalizeChordOnlyLine({
      id: 'implicit',
      text: ' ',
      chords: [{ id: 'a', position: 0, symbol: '4', durationMillis: null }],
    })
    const explicitBars = normalizeChordOnlyLine({
      id: 'explicit',
      text: '    ',
      chords: [
        { id: 'b', position: 0, symbol: '1', durationMillis: null },
        { id: 'c', position: 1, symbol: '5', durationMillis: null },
        { id: 'd', position: 2, symbol: '4', durationMillis: null },
        { id: 'e', position: 3, symbol: '5', durationMillis: null },
      ],
    })

    expect(composeChordBarRowWidthPercent(implicitBar, [implicitBar, explicitBars], '4/4')).toBe(100)
    expect(composeBarWeightsFromChords(implicitBar.chords, '4/4')).toEqual([4000])
    expect(composeBarSegmentLayout([4000], '4/4')[0]?.widthPercent).toBe(100)
    expect(composeChordBarMeasureCount(4000, '4/4')).toBe(1)
    expect(composeChordBarDisplayMeasureCount(4000, '4/4')).toBe(1)
    expect(composeChordBarDisplayMeasureCount(0, '4/4')).toBe(4)
    expect(composeChordBarMeasureCount(16000, '4/4')).toBe(4)
  })
})

describe('position helpers', () => {
  it('clamps chord positions to text length', () => {
    expect(clampChordPosition(-2, 5)).toBe(0)
    expect(clampChordPosition(99, 5)).toBe(5)
  })

  it('maps pointer x to nearest character index', () => {
    expect(positionFromPointer(25, 0, 100, 10)).toBe(3)
    expect(positionFromPointer(0, 0, 0, 10)).toBe(0)
  })

  it('maps monospace pointer to the character cell under the cursor', () => {
    expect(positionFromMonospacePointer(20, 0, 12, 8, 10)).toBe(1)
    expect(positionFromMonospacePointer(12, 0, 12, 8, 10)).toBe(0)
    expect(positionFromMonospacePointer(11, 0, 12, 8, 10)).toBe(0)
  })
})
