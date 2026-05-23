import { describe, expect, it } from 'vitest'

import { scopeChordlibPageCss } from '@/lib/chord-page-css'

describe('scopeChordlibPageCss', () => {
  it('maps body font rules onto the page host', () => {
    const css = 'body {\n  font-family: Verdana, sans-serif;\n}\n'
    const scoped = scopeChordlibPageCss(css)
    expect(scoped).toContain('.player-chords-page')
    expect(scoped).toContain('font-family: Verdana, sans-serif')
    expect(scoped).not.toContain('body {')
  })

  it('scopes class and element selectors under the host', () => {
    const css = '.page { width: 794px; }\np { margin: 0; }'
    const scoped = scopeChordlibPageCss(css)
    expect(scoped).toContain('.player-chords-page .page')
    expect(scoped).toContain('.player-chords-page p')
    expect(scoped).toContain('width: 794px')
  })

  it('scopes comma-separated selectors', () => {
    const css = '.keyword, .chord { font-weight: bold; }'
    const scoped = scopeChordlibPageCss(css)
    expect(scoped).toContain('.player-chords-page .keyword')
    expect(scoped).toContain('.player-chords-page .chord')
    expect(scoped).toContain('font-weight: bold')
  })
})
