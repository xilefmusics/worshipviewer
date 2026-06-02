/** Measure how much vertical space each section consumes when stacked in a column. */
export function measureStackedSectionHeights(measureRoot: HTMLElement): number[] {
  const sectionEls = measureRoot.querySelectorAll('[data-section-index]')
  if (sectionEls.length === 0) return []

  const rootTop = measureRoot.getBoundingClientRect().top
  const heights: number[] = []

  for (let index = 0; index < sectionEls.length; index++) {
    const el = sectionEls[index] as HTMLElement
    const rect = el.getBoundingClientRect()
    const previousBottom =
      index === 0 ? rootTop : (sectionEls[index - 1] as HTMLElement).getBoundingClientRect().bottom
    heights.push(Math.ceil(rect.bottom - previousBottom))
  }

  return heights
}

/**
 * Pack every section into exactly `columnCount` columns (scroll overflow).
 * Assigns each section to the shortest column so columns stay roughly balanced.
 */
export function packSectionsForScroll(
  sectionHeights: number[],
  columnCount: number,
): number[][] {
  if (sectionHeights.length === 0) return []

  const count = Math.max(1, Math.min(columnCount, sectionHeights.length))
  const columns: number[][] = Array.from({ length: count }, () => [])
  const usedHeights = Array.from({ length: count }, () => 0)

  for (let index = 0; index < sectionHeights.length; index++) {
    let target = 0
    for (let columnIndex = 1; columnIndex < count; columnIndex++) {
      if (usedHeights[columnIndex] < usedHeights[target]) target = columnIndex
    }
    columns[target].push(index)
    usedHeights[target] += sectionHeights[index]
  }

  return columns
}

/** Pack section indices into columns, filling each column top-to-bottom before starting the next. */
export function packSectionsIntoColumns(
  sectionHeights: number[],
  maxColumnHeight: number,
): number[][] {
  if (sectionHeights.length === 0) return []

  const columns: number[][] = [[]]
  let usedHeight = 0

  for (let index = 0; index < sectionHeights.length; index++) {
    const sectionHeight = sectionHeights[index]
    const currentColumnHasContent = columns[columns.length - 1].length > 0
    if (currentColumnHasContent && usedHeight + sectionHeight > maxColumnHeight) {
      columns.push([])
      usedHeight = 0
    }
    columns[columns.length - 1].push(index)
    usedHeight += sectionHeight
  }

  return columns
}

/** Move one trailing section from a column into the next column. */
export function shiftOverflowSection(columns: number[][], columnIndex: number): number[][] | null {
  if (columns[columnIndex]?.length === 0) return null

  const nextColumns = columns.map((column) => [...column])
  const moved = nextColumns[columnIndex].pop()
  if (moved == null) return null

  if (!nextColumns[columnIndex + 1]) nextColumns.push([])
  nextColumns[columnIndex + 1].unshift(moved)
  return nextColumns
}

/** Whether two packed column layouts reference the same section indices. */
export function arePackedColumnsEqual(left: number[][], right: number[][]): boolean {
  if (left.length !== right.length) return false
  for (let columnIndex = 0; columnIndex < left.length; columnIndex++) {
    const leftColumn = left[columnIndex]
    const rightColumn = right[columnIndex]
    if (leftColumn.length !== rightColumn.length) return false
    for (let sectionIndex = 0; sectionIndex < leftColumn.length; sectionIndex++) {
      if (leftColumn[sectionIndex] !== rightColumn[sectionIndex]) return false
    }
  }
  return true
}

/** Pack sections, then shift overflow using measured section heights in one pass. */
export function packSectionsIntoColumnsWithOverflow(
  sectionHeights: number[],
  maxColumnHeight: number,
): number[][] {
  let columns = packSectionsIntoColumns(sectionHeights, maxColumnHeight)
  if (columns.length === 0) return columns

  const maxIterations = sectionHeights.length * Math.max(columns.length, 1)
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let shifted = false
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const columnHeight = columns[columnIndex].reduce(
        (sum, sectionIndex) => sum + sectionHeights[sectionIndex],
        0,
      )
      if (columnHeight <= maxColumnHeight) continue
      if (columns[columnIndex].length <= 1) continue

      const nextColumns = shiftOverflowSection(columns, columnIndex)
      if (!nextColumns) continue
      columns = nextColumns
      shifted = true
      break
    }
    if (!shifted) break
  }

  return columns
}

/** Whether packed column indices still match the current section list. */
export function isPackedColumnsValid(
  packedColumns: number[][],
  sectionCount: number,
): boolean {
  if (sectionCount === 0) return packedColumns.length === 0

  let packedCount = 0
  for (const column of packedColumns) {
    for (const index of column) {
      if (!Number.isInteger(index) || index < 0 || index >= sectionCount) return false
      packedCount++
    }
  }

  return packedCount === sectionCount
}
