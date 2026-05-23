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
