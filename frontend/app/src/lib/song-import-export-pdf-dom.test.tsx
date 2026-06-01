import { afterEach, describe, expect, it } from 'vitest'

import { mountPdfExportDocumentForTest } from '@/lib/song-import-export'

function styleText(doc: Document): string {
  return doc.querySelector('style')?.textContent ?? ''
}

describe('mountPdfExportDocumentForTest', () => {
  const mounted: HTMLIFrameElement[] = []

  afterEach(() => {
    for (const frame of mounted) {
      frame.remove()
    }
    mounted.length = 0
  })

  it('injects @page and @media print rules into the iframe stylesheet', () => {
    const { frame, contentWindow } = mountPdfExportDocumentForTest(
      [{ html: '<p>One</p>', css: '.page { width: 794px; }' }],
      'Test Song',
    )
    mounted.push(frame)

    const doc = contentWindow.document
    const css = styleText(doc)
    expect(css).toContain('@page')
    expect(css).toContain('size: A4 portrait')
    expect(css).toContain('@media print')
    expect(css).toContain('.pdf-export-root:nth-of-type(1) .page')
    expect(css).toContain('height: auto')
    expect(doc.querySelectorAll('.pdf-export-root')).toHaveLength(1)
  })

  it('scopes chordlib CSS per page host and adds setlist page breaks', () => {
    const { frame, contentWindow } = mountPdfExportDocumentForTest(
      [
        { html: '<p>First</p>', css: 'body { font-size: 12px; }' },
        { html: '<p>Second</p>', css: '.page { height: 1000px; }' },
      ],
      'Setlist',
    )
    mounted.push(frame)

    const doc = contentWindow.document
    const css = styleText(doc)
    expect(css).toContain('.pdf-export-root:nth-of-type(1)')
    expect(css).toContain('.pdf-export-root:nth-of-type(2) .page')
    expect(css).toContain('page-break-before: always')
    expect(doc.querySelectorAll('.pdf-export-root')).toHaveLength(2)
  })

  it('passes @media blocks from chordlib CSS through scopeChordlibPageCss unscoped', () => {
    const chordlibCss = '@media screen { .page { height: 900px; } }'
    const { frame, contentWindow } = mountPdfExportDocumentForTest(
      [{ html: '<div class="page"></div>', css: chordlibCss }],
      'At-rule',
    )
    mounted.push(frame)

    const css = styleText(contentWindow.document)
    expect(css).toContain('@media screen')
    expect(css).toContain('height: 900px')
  })
})
