import { describe, expect, it } from 'vitest'

import {
  arePackedColumnsEqual,
  isPackedColumnsValid,
  packSectionsForScroll,
  packSectionsIntoFixedColumns,
  packSectionsIntoColumns,
  packSectionsIntoColumnsWithOverflow,
  scrollModeNeedsVerticalScroll,
  shiftOverflowSection,
  tallestPackedColumnHeight,
} from './chords-three-column-pack'

describe('packSectionsIntoFixedColumns', () => {
  it('fills the first column before starting the next', () => {
    expect(packSectionsIntoFixedColumns([100, 100, 100, 100], 250, 3)).toEqual([
      [0, 1],
      [2, 3],
    ])
  })

  it('keeps overflow on the last column when sections exceed the column budget', () => {
    expect(packSectionsIntoFixedColumns([100, 200, 50, 150, 80], 250, 3)).toEqual([
      [0],
      [1, 2],
      [3, 4],
    ])
  })

  it('uses a single column when columnCount is 1', () => {
    expect(packSectionsIntoFixedColumns([100, 200, 50], 250, 1)).toEqual([[0, 1, 2]])
  })

  it('returns an empty array for no sections', () => {
    expect(packSectionsIntoFixedColumns([], 250, 3)).toEqual([])
  })
})

describe('packSectionsForScroll', () => {
  it('places every section across the configured column count', () => {
    expect(packSectionsForScroll([100, 200, 50, 150, 80], 3)).toEqual([
      [0, 4],
      [1],
      [2, 3],
    ])
  })

  it('uses a single column when columnCount is 1', () => {
    expect(packSectionsForScroll([100, 200, 50], 1)).toEqual([[0, 1, 2]])
  })

  it('returns an empty array for no sections', () => {
    expect(packSectionsForScroll([], 3)).toEqual([])
  })
})

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

describe('packSectionsIntoColumnsWithOverflow', () => {
  it('shifts overflow sections in one pass instead of one shift at a time', () => {
    expect(packSectionsIntoColumnsWithOverflow([120, 120, 120, 120, 120], 250)).toEqual([
      [0, 1],
      [2, 3],
      [4],
    ])
  })
})

describe('arePackedColumnsEqual', () => {
  it('compares packed columns by section indices', () => {
    expect(
      arePackedColumnsEqual(
        [
          [0, 1],
          [2],
        ],
        [
          [0, 1],
          [2],
        ],
      ),
    ).toBe(true)
    expect(
      arePackedColumnsEqual(
        [
          [0, 1],
          [2],
        ],
        [
          [0],
          [1, 2],
        ],
      ),
    ).toBe(false)
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

describe('tallestPackedColumnHeight', () => {
  it('returns the tallest column total height', () => {
    const heights = [100, 200, 50, 150, 80]
    const columns = packSectionsIntoFixedColumns(heights, 250, 3)
    expect(tallestPackedColumnHeight(heights, columns)).toBe(250)
  })
})

describe('scrollModeNeedsVerticalScroll', () => {
  it('is false when every packed column fits the viewport height', () => {
    const heights = [100, 120, 80]
    const columns = packSectionsIntoFixedColumns(heights, 250, 3)
    expect(scrollModeNeedsVerticalScroll(heights, columns, 250)).toBe(false)
  })

  it('is true when a packed column exceeds the viewport height', () => {
    const heights = [100, 400, 80]
    const columns = packSectionsIntoFixedColumns(heights, 250, 3)
    expect(scrollModeNeedsVerticalScroll(heights, columns, 250)).toBe(true)
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
