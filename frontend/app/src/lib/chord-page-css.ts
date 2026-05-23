/**
 * Scope chordlib A4 page CSS to a host element inside the app shell.
 * WASM emits `body { … }` and unqualified rules meant for an isolated HTML document.
 */
export function scopeChordlibPageCss(css: string, hostSelector = '.player-chords-page'): string {
  const rules: string[] = []
  let index = 0

  while (index < css.length) {
    const openBrace = css.indexOf('{', index)
    if (openBrace === -1) break

    const selectors = css.slice(index, openBrace).trim()
    const closeBrace = css.indexOf('}', openBrace)
    if (closeBrace === -1) break

    const declarations = css.slice(openBrace + 1, closeBrace).trim()
    if (selectors && !selectors.startsWith('@')) {
      const scopedSelectors = selectors
        .split(',')
        .map((selector) => {
          const trimmed = selector.trim()
          if (!trimmed) return trimmed
          if (trimmed === 'body') return hostSelector
          return `${hostSelector} ${trimmed}`
        })
        .join(', ')
      rules.push(`${scopedSelectors} { ${declarations} }`)
    } else {
      rules.push(`${selectors} { ${declarations} }`)
    }

    index = closeBrace + 1
  }

  return rules.join('\n\n')
}
