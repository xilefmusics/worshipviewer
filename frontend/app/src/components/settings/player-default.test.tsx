import { describe, expect, it } from 'vitest'

import { nextPlayerScrollType } from '@/lib/player/effective-scroll-type'
import {
  chordFormatToRepresentation,
  resolveChordFormatPreference,
} from '@/lib/chord-format'

// Flow: J2 — Player Default tab option surfaces
describe('J2: Player Default tab options', () => {
  it('J2: chord format options include Letters and Nashville', () => {
    expect(resolveChordFormatPreference('letters')).toBe('letters')
    expect(resolveChordFormatPreference('nashville')).toBe('nashville')
    expect(chordFormatToRepresentation('letters')).toBeTruthy()
    expect(chordFormatToRepresentation('nashville')).toBeTruthy()
  })

  it('J2: scroll modes cycle through six variants', () => {
    let mode = nextPlayerScrollType('one_page')
    const seen = new Set<string>(['one_page'])
    for (let i = 0; i < 6; i++) {
      seen.add(mode)
      mode = nextPlayerScrollType(mode)
    }
    expect(seen.size).toBeGreaterThanOrEqual(6)
  })
})
