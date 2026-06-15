import { describe, expect, it } from 'vitest'

import { stripChordsFromChordpro } from '@/lib/strip-chords-from-chordpro'

describe('stripChordsFromChordpro', () => {
  it('removes inline chord brackets and keeps lyrics', () => {
    const input = '[C]Hello [G]world'
    expect(stripChordsFromChordpro(input)).toBe('Hello world')
  })

  it('drops chord-only lines', () => {
    const input = '[C] [G]\n[C]Line one\n[Am] [F]'
    expect(stripChordsFromChordpro(input)).toBe('Line one')
  })

  it('preserves directive lines', () => {
    const input = '{title: My Song}\n{key: C}\n[C]Verse line'
    expect(stripChordsFromChordpro(input)).toBe('{title: My Song}\n{key: C}\nVerse line')
  })
})
