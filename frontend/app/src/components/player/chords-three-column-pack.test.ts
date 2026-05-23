import { describe, expect, it } from 'vitest'

import {
  isPackedColumnsValid,
  packSectionsIntoColumns,
  shiftOverflowSection,
} from './chords-three-column-pack'

describe('packSectionsIntoColumns', () => {
  it('fills the first column before starting the next', () => {
    expect(packSectionsIntoColumns([100, 100, 100, 100], 250)).toEqual([
      [0, 1],
      [2, 3],
    ])
  })

  it('allows a tall section to occupy a column on its own', () => {
    expect(packSectionsIntoColumns([400, 50], 300)).toEqual([[0], [1]])
  })

  it('returns an empty array for no sections', () => {
    expect(packSectionsIntoColumns([], 300)).toEqual([])
  })
})

describe('shiftOverflowSection', () => {
  it('moves the last section from the given column into the next column', () => {
    expect(
      shiftOverflowSection(
        [
          [0, 1, 2],
          [3],
        ],
        0,
      ),
    ).toEqual([
      [0, 1],
      [2, 3],
    ])
  })

  it('creates a new column when shifting from the last column', () => {
    expect(shiftOverflowSection([[0, 1]], 0)).toEqual([[0], [1]])
  })
})

describe('isPackedColumnsValid', () => {
  it('accepts packing that covers every section index once', () => {
    expect(isPackedColumnsValid([[0, 1], [2]], 3)).toBe(true)
  })

  it('rejects out-of-range section indices from stale packing', () => {
    expect(isPackedColumnsValid([[0, 1, 2, 3]], 3)).toBe(false)
  })

  it('rejects packing that omits sections', () => {
    expect(isPackedColumnsValid([[0, 1]], 3)).toBe(false)
  })
})
