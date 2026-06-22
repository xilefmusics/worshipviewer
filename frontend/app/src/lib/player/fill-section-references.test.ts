import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { ChordSongData } from '@/ports/chord-engine'

const pkgDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/chordlib-wasm/pkg',
)

type WireSection = { title: string; lines: unknown[] }

function sectionLines(data: ChordSongData, index: number): unknown[] {
  const sections = data.sections as WireSection[] | undefined
  return sections?.[index]?.lines ?? []
}

describe('fillSectionReferences (chordlib WASM)', () => {
  it.skipIf(import.meta.env.VITEST_WASM !== '1')(
    'copies lyrics into a later duplicate section with empty lines',
    async () => {
      const wasm = await import('@worshipviewer/chordlib-wasm')
      const bytes = readFileSync(join(pkgDir, 'chordlib_wasm_bg.wasm'))
      wasm.initSync(bytes)

      const source = [
        '{title: Test}',
        '{key: C}',
        '{section: Chorus}',
        'Holy holy',
        '{section: Verse 1}',
        'Verse',
        '{section: Chorus}',
      ].join('\n')
      const json = wasm.parseChordPro(source)
      const filledJson = wasm.fillSectionReferences(json)
      const filled = JSON.parse(filledJson) as ChordSongData

      expect(sectionLines(filled, 0).length).toBeGreaterThan(0)
      expect(sectionLines(filled, 2)).toEqual(sectionLines(filled, 0))
    },
  )

  it.skipIf(import.meta.env.VITEST_WASM !== '1')(
    'leaves sections unchanged when no earlier donor has content',
    async () => {
      const wasm = await import('@worshipviewer/chordlib-wasm')
      const bytes = readFileSync(join(pkgDir, 'chordlib_wasm_bg.wasm'))
      wasm.initSync(bytes)

      const source = ['{title: Test}', '{key: C}', '{section: Chorus}', '{section: Chorus}'].join('\n')
      const json = wasm.parseChordPro(source)
      const filledJson = wasm.fillSectionReferences(json)
      const filled = JSON.parse(filledJson) as ChordSongData

      expect(sectionLines(filled, 0)).toEqual([])
      expect(sectionLines(filled, 1)).toEqual([])
    },
  )

  it.skipIf(import.meta.env.VITEST_WASM !== '1')(
    'does not overwrite sections that already have content',
    async () => {
      const wasm = await import('@worshipviewer/chordlib-wasm')
      const bytes = readFileSync(join(pkgDir, 'chordlib_wasm_bg.wasm'))
      wasm.initSync(bytes)

      const source = [
        '{title: Test}',
        '{key: C}',
        '{section: Verse}',
        'Original',
        '{section: Verse}',
        'Different',
      ].join('\n')
      const json = wasm.parseChordPro(source)
      const filledJson = wasm.fillSectionReferences(json)
      const filled = JSON.parse(filledJson) as ChordSongData

      expect(sectionLines(filled, 0)).toEqual(sectionLines(JSON.parse(json) as ChordSongData, 0))
      expect(sectionLines(filled, 1)).toEqual(sectionLines(JSON.parse(json) as ChordSongData, 1))
    },
  )
})
