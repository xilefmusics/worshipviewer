import { describe, expect, it } from 'vitest'

import { displayTocEntries } from '@/lib/player/toc-display'

const toc = [
  { idx: 0, nr: '1', title: 'Zebra', liked: false },
  { idx: 1, nr: '2', title: 'Alpha', liked: true },
  { idx: 2, nr: '3', title: 'Beta', liked: false },
]

describe('displayTocEntries', () => {
  it('keeps API order by default', () => {
    expect(displayTocEntries(toc, 'order').map((r) => r.title)).toEqual(['Zebra', 'Alpha', 'Beta'])
  })

  it('sorts alphabetically by title', () => {
    expect(displayTocEntries(toc, 'alphabetical').map((r) => r.title)).toEqual([
      'Alpha',
      'Beta',
      'Zebra',
    ])
  })

  it('filters to liked rows only', () => {
    expect(displayTocEntries(toc, 'liked')).toEqual([toc[1]])
  })
})
