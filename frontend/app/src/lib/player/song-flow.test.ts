import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { SongFlowItem } from '@/ports/chord-engine'

const pkgDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/chordlib-wasm/pkg',
)

describe('song flow (chordlib WASM)', () => {
  it.skipIf(import.meta.env.VITEST_WASM !== '1')(
    'flowItems, customFlow, and applySongFlow reorder sections',
    async () => {
      const wasm = await import('@worshipviewer/chordlib-wasm')
      const bytes = readFileSync(join(pkgDir, 'chordlib_wasm_bg.wasm'))
      wasm.initSync(bytes)

      const source = [
        '{title: Test}',
        '{key: C}',
        '{section: Verse}',
        'First',
        '{section: Chorus}',
        'Second',
      ].join('\n')
      const json = wasm.parseChordPro(source)

      const items = JSON.parse(wasm.songFlowItems(json)) as SongFlowItem[]
      expect(items.map((item) => item.title)).toEqual(['Verse', 'Chorus'])

      const customFlow = JSON.parse(wasm.songCustomFlow(json)) as SongFlowItem[]
      expect(customFlow.map((item) => item.title)).toEqual(['Verse', 'Chorus'])

      const flow: SongFlowItem[] = [
        { title: 'Chorus', occurrence_index: 0, repeats: 1 },
        { title: 'Verse', occurrence_index: 0, repeats: 2 },
      ]
      const appliedJson = wasm.applySongFlow(json, JSON.stringify(flow))
      const applied = JSON.parse(appliedJson) as {
        sections: Array<{ title: string; repeat_count?: number }>
      }

      expect(applied.sections.map((section) => section.title)).toEqual(['Chorus', 'Verse'])
      expect(applied.sections[1]?.repeat_count).toBe(2)
    },
  )
})
