import { describe, expect, it } from 'vitest'

import { stripChordsFromChordlibHtml } from '@/lib/strip-chords-from-html'

describe('stripChordsFromChordlibHtml', () => {
  it('removes inline chord spans and keeps lyrics', () => {
    const html =
      '<p><span class="keyword">Verse</span><br>' +
      '<span class="part part-has-chord"><span class="chord">C</span><span class="text">Hello </span></span>' +
      '<span class="part"><span class="text">world</span></span><br></p>'

    const result = stripChordsFromChordlibHtml(html)

    expect(result).not.toContain('class="chord"')
    expect(result).not.toContain('part-has-chord')
    expect(result).toContain('Hello')
    expect(result).toContain('world')
    expect(result).toContain('Verse')
  })

  it('removes chord bar lines', () => {
    const html =
      '<p><span class="keyword">Intro</span><br>' +
      '<span class="bars"><span class="bar">|</span><span class="chord">C</span>' +
      '<span class="bar">|</span><span class="chord">G</span><span class="bar">|</span></span><br></p>'

    const result = stripChordsFromChordlibHtml(html)

    expect(result).not.toContain('class="bars"')
    expect(result).not.toContain('>C<')
    expect(result).toContain('Intro')
  })

  it('removes whitespace-only text spans used for chord alignment', () => {
    const html =
      '<span class="part part-has-chord"><span class="chord">Am</span><span class="text">Line</span></span>' +
      '<span class="text">     </span>'

    const result = stripChordsFromChordlibHtml(html)

    expect(result).toContain('Line')
    expect(result).not.toMatch(/<span class="text">\s+<\/span>/)
  })
})
