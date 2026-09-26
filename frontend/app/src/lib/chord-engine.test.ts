import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ChordEngineError } from '@/ports/chord-engine'

const pkgDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/chordlib-wasm/pkg',
)

function searchableCcliPdf(): Uint8Array {
  const text = (size: number, x: number, y: number, value: string) => {
    const escaped = value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
    return `BT /F1 ${size} Tf ${x} ${y} Td (${escaped}) Tj ET\n`
  }
  const content = [
    text(18, 72, 750, 'Sample Song'),
    text(10, 72, 732, 'One Artist | Another Artist'),
    text(10, 72, 716, 'Key - G | Tempo - 120 (1/8) | Time - 6/8'),
    text(12, 72, 690, 'VERSE'),
    text(14, 72, 676, 'G'),
    text(14, 72, 664, 'Amazing grace'),
    text(7, 40, 90, 'Copyright 2024 Example Publishing | Another Publisher'),
    text(7, 40, 80, 'CCLI Song Number 123456'),
    text(7, 40, 70, 'CCLI License Number 987654'),
  ].join('')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
  ]
  let output = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(output).length)
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = new TextEncoder().encode(output).length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) {
    output += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return new TextEncoder().encode(output)
}

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

      const json = wasm.parseChordPro(
        '{title: WASM test}\n{key: C}\n{section: Verse}\n\n[C]Line',
      )
      const data = JSON.parse(json) as { titles: string[] }
      expect(data.titles).toEqual(['WASM test'])

      const importedPdf = JSON.parse(wasm.parsePdf(searchableCcliPdf())) as {
        titles: string[]
        artists: string[]
        tags: Record<string, string>
        key: unknown
        tempo: number | null
        time: number[] | null
        copyright: string | null
        sections: Array<{
          title: string
          lines: Array<{ parts: Array<{ chord: unknown; languages: string[] }> }>
        }>
      }
      expect(importedPdf.titles).toEqual(['Sample Song'])
      expect(importedPdf.artists).toEqual(['One Artist', 'Another Artist'])
      expect(importedPdf.key).toBeTruthy()
      expect(importedPdf.tempo).toBe(120)
      expect(importedPdf.time).toEqual([6, 8])
      expect(importedPdf.copyright).toContain('Copyright 2024')
      expect(importedPdf.tags).toMatchObject({
        'pdf.ccli_song_number': '123456',
        'pdf.ccli_license_number': '987654',
      })
      expect(importedPdf.sections[0]?.title).toBe('VERSE')
      expect(importedPdf.sections[0]?.lines[0]?.parts[0]?.chord).not.toBeNull()
      expect(importedPdf.sections[0]?.lines[0]?.parts[0]?.languages).toEqual(['Amazing grace'])
      expect(() => wasm.parsePdf(new Uint8Array([1, 2, 3]))).toThrow()

      const formatted = wasm.formatChordPro(json, false, undefined, undefined, undefined)
      expect(formatted).toContain('WASM test')

      const markdown = wasm.formatMarkdown(json)
      const markdownData = JSON.parse(wasm.parseMarkdown(markdown)) as { titles: string[] }
      expect(markdownData.titles).toEqual(['WASM test'])

      const page = wasm.renderA4Html(json, undefined, undefined, undefined, 1)
      expect(page.html.length).toBeGreaterThan(0)
      expect(page.css.length).toBeGreaterThan(0)

      const sectionsPage = wasm.renderA4SectionHtmls(json, undefined, undefined, undefined, 1)
      expect(sectionsPage.sections.length).toBeGreaterThan(0)
      expect(sectionsPage.css.length).toBeGreaterThan(0)

      const filled = wasm.fillSectionReferences(json)
      expect(JSON.parse(filled)).toBeTruthy()

      const flowItems = JSON.parse(wasm.songFlowItems(json)) as unknown[]
      expect(Array.isArray(flowItems)).toBe(true)

      const customFlow = JSON.parse(wasm.songCustomFlow(json)) as unknown[]
      expect(Array.isArray(customFlow)).toBe(true)
    },
  )
})
