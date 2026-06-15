const DIRECTIVE_LINE = /^\{[^}]+\}\s*$/

/** Remove chord markers from ChordPro / Worship Pro export text. */
export function stripChordsFromChordpro(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []

  for (const line of lines) {
    if (DIRECTIVE_LINE.test(line.trim())) {
      out.push(line)
      continue
    }

    const stripped = line.replace(/\[[^\]]*\]/g, '')
    if (!stripped.trim()) continue
    out.push(stripped)
  }

  return out.join('\n')
}
