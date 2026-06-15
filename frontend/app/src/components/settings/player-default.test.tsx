import { describe, expect, it } from 'vitest'

import {
  layoutPreferenceToScrollType,
  nextPlayerScrollType,
  scrollTypeToLayoutPreference,
} from '@/lib/player/effective-scroll-type'
import {
  chordFormatToRepresentation,
  resolveChordFormatPreference,
} from '@/lib/chord-format'
import { readHideChordsPreference } from '@/lib/hide-chords-preference'

// Flow: J2 — Player Default tab option surfaces
describe('J2: Player Default tab options', () => {
  it('J2: chord format options include Letters and Nashville', () => {
    expect(resolveChordFormatPreference('letters')).toBe('letters')
    expect(resolveChordFormatPreference('nashville')).toBe('nashville')
    expect(chordFormatToRepresentation('letters')).toBeTruthy()
    expect(chordFormatToRepresentation('nashville')).toBeTruthy()
  })

  it('J2: hide chords preference defaults to off', () => {
    expect(readHideChordsPreference({ getItem: () => null })).toBe(false)
    expect(readHideChordsPreference({ getItem: () => 'true' })).toBe(true)
  })

  it('J2: scroll modes cycle through eight variants', () => {
    let mode = nextPlayerScrollType('one_page')
    const seen = new Set<string>(['one_page'])
    for (let i = 0; i < 8; i++) {
      seen.add(mode)
      mode = nextPlayerScrollType(mode)
    }
    expect(seen.size).toBeGreaterThanOrEqual(8)
  })

  it('J2: layout preferences map to scroll types', () => {
    expect(
      layoutPreferenceToScrollType({
        mode: 'free',
        pageCount: 1,
        columnCount: 1,
        nextSongPreview: true,
        overflowStyle: 'scroll',
        expandSections: false,
      }),
    ).toBe('one_column_next')
    expect(layoutPreferenceToScrollType(scrollTypeToLayoutPreference('book'))).toBe('book')
  })
})
