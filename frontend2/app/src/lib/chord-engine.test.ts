import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ChordEngineError } from '@/ports/chord-engine'

const pkgDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/chordlib-wasm/pkg',
)

describe('ChordEngineError', () => {
  it('sets name and message', () => {
    const err = new ChordEngineError('parse failed')
    expect(err.name).toBe('ChordEngineError')
    expect(err.message).toBe('parse failed')
  })
})

describe('@worshipviewer/chordlib-wasm pkg', () => {
  it.skipIf(import.meta.env.VITEST_WASM !== '1')(
    'parse, format, and render via initSync (Node)',
    async () => {
      const wasm = await import('@worshipviewer/chordlib-wasm')
      const bytes = readFileSync(join(pkgDir, 'chordlib_wasm_bg.wasm'))
      wasm.initSync(bytes)

      const json = wasm.parseChordPro('{title: WASM test}\n{key: C}\n\n[C]Line')
      const data = JSON.parse(json) as { titles: string[] }
      expect(data.titles).toEqual(['WASM test'])

      const formatted = wasm.formatChordPro(json, false, undefined, undefined, undefined)
      expect(formatted).toContain('WASM test')

      const page = wasm.renderA4Html(json, undefined, undefined, undefined, 1)
      expect(page.html.length).toBeGreaterThan(0)
      expect(page.css.length).toBeGreaterThan(0)
    },
  )
})
