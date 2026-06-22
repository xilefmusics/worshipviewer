import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createWasmChordEngine } from '@/adapters/chord-engine-wasm'
import {
  composeSectionsFromSongData,
  mergeSongDataWithComposeSections,
  symbolToWireChord,
} from '@/lib/song-editor-compose'

const pkgDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/chordlib-wasm/pkg',
)

describe('composeSectionsFromSongData wasm round-trip', () => {
  it.skipIf(import.meta.env.VITEST_WASM !== '1')(
    'preserves primary and translation chord positions through format and parse',
    async () => {
      const wasmMod = await import('@worshipviewer/chordlib-wasm')
      wasmMod.initSync(readFileSync(join(pkgDir, 'chordlib_wasm_bg.wasm')))
      const engine = await createWasmChordEngine()

      const composeSections = [
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

      const merged = mergeSongDataWithComposeSections(
        { titles: ['Test'], sections: [] },
        composeSections,
        engine,
        'C',
        '4/4',
        2,
      )
      const formatted = engine.formatChordPro(merged, { worshipPro: true })
      const reparsed = engine.parseChordPro(formatted)
      const imported = composeSectionsFromSongData(reparsed, engine, 'C', 'letters')
      const line = imported[0]?.lines[0]

      expect(line?.chords[0]?.position).toBe(6)
      expect(line?.translationChords?.[0]?.[0]?.position).toBe(5)
    },
  )

  it.skipIf(import.meta.env.VITEST_WASM !== '1')(
    'preserves independent translation chord symbols through wire round-trip',
    async () => {
      const wasmMod = await import('@worshipviewer/chordlib-wasm')
      wasmMod.initSync(readFileSync(join(pkgDir, 'chordlib_wasm_bg.wasm')))
      const engine = await createWasmChordEngine()

      const composeSections = [
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
              translationChords: [[{ id: 'c2', position: 5, symbol: 'C', durationMillis: null }]],
            },
          ],
        },
      ]

      const merged = mergeSongDataWithComposeSections(
        { titles: ['Test'], sections: [] },
        composeSections,
        engine,
        'C',
        '4/4',
        2,
      )
      const imported = composeSectionsFromSongData(merged, engine, 'C', 'letters')
      const line = imported[0]?.lines[0]

      expect(line?.chords[0]?.position).toBe(6)
      expect(line?.chords[0]?.symbol).toBe('G')
      expect(line?.translationChords?.[0]?.[0]?.position).toBe(5)
      expect(line?.translationChords?.[0]?.[0]?.symbol).toBe('C')
    },
  )

  it.skipIf(import.meta.env.VITEST_WASM !== '1')(
    'preserves nashville degree chords on lyric lines without a song key',
    async () => {
      const wasmMod = await import('@worshipviewer/chordlib-wasm')
      wasmMod.initSync(readFileSync(join(pkgDir, 'chordlib_wasm_bg.wasm')))
      const engine = await createWasmChordEngine()

      expect(symbolToWireChord(engine, '1', null, null, 'nashville')).toBeTruthy()

      const merged = mergeSongDataWithComposeSections(
        { titles: ['Test'], sections: [] },
        [
          {
            id: 'sec-1',
            title: 'Chorus',
            repeatCount: 1,
            lines: [
              {
                id: 'line-1',
                text: 'Zeile 1',
                chords: [{ id: 'c1', position: 0, symbol: '1', durationMillis: null }],
              },
            ],
          },
        ],
        engine,
        null,
        '4/4',
        1,
        'nashville',
      )

      const wireSections = merged.sections as
        | Array<{ lines?: Array<{ parts?: unknown }> }>
        | undefined
      expect(JSON.stringify(wireSections?.[0]?.lines?.[0]?.parts ?? [])).toContain('"main"')

      const imported = composeSectionsFromSongData(merged, engine, null, 'nashville')
      expect(imported[0]?.lines[0]?.chords[0]?.symbol).toBe('1')
      expect(imported[0]?.lines[0]?.chords[0]?.position).toBe(0)
    },
  )

  it.skipIf(import.meta.env.VITEST_WASM !== '1')(
    'does not fabricate translation chords when translation line is chord-free',
    async () => {
      const wasmMod = await import('@worshipviewer/chordlib-wasm')
      wasmMod.initSync(readFileSync(join(pkgDir, 'chordlib_wasm_bg.wasm')))
      const engine = await createWasmChordEngine()

      const merged = mergeSongDataWithComposeSections(
        { titles: ['Test'], languages: ['en', 'de'], sections: [] },
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
      )
      const imported = composeSectionsFromSongData(merged, engine, 'C', 'letters')
      const line = imported[0]?.lines[0]

      expect(line?.chords[0]?.position).toBe(6)
      expect(line?.translationChords).toBeUndefined()
    },
  )
})
