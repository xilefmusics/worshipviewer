/** DIN-A4 page height (px) used by chordlib HTML scaling — matches legacy player. */
export const A4_REFERENCE_HEIGHT_PX = 1123

/** DIN-A4 page width (px) at scale 1 — matches `max-w-[794px]` player/editor surface. */
export const A4_REFERENCE_WIDTH_PX = 794

/** Chordlib `.columns` block inside an A4 page at scale 1 (`format_html.css`). */
export const A4_COLUMNS_CONTENT_WIDTH_PX = 674
export const A4_COLUMNS_GAP_PX = 30
export const A4_COLUMNS_COUNT = 2
export const A4_COLUMN_FONT_SIZE_PX = 13
export const A4_COLUMN_LINE_HEIGHT_PX = 17

/** One column width in chordlib's 2-column A4 layout at scale 1. */
export const A4_REFERENCE_COLUMN_WIDTH_PX =
  (A4_COLUMNS_CONTENT_WIDTH_PX - A4_COLUMNS_GAP_PX * (A4_COLUMNS_COUNT - 1)) /
  A4_COLUMNS_COUNT

/** Width of one column in a multi-column container (px). */
export function columnWidthInMultiColumnLayout(
  containerWidthPx: number,
  columnCount: number,
  columnGapPx: number,
  horizontalPaddingPx: number,
): number {
  if (containerWidthPx <= 0 || columnCount <= 0) return 0
  const contentWidth = Math.max(0, containerWidthPx - horizontalPaddingPx)
  const totalGap = columnGapPx * Math.max(0, columnCount - 1)
  return Math.max(0, (contentWidth - totalGap) / columnCount)
}

/** Scale factor for chord typography relative to the A4 HTML column width. */
export function fontScaleForColumnWidth(columnWidthPx: number): number | undefined {
  if (columnWidthPx <= 0 || A4_REFERENCE_COLUMN_WIDTH_PX <= 0) return undefined
  return columnWidthPx / A4_REFERENCE_COLUMN_WIDTH_PX
}

/** Column typography scale capped like A4 pages (min of width- and height-derived scale). */
export function cappedColumnFontScale(
  columnWidthPx: number,
  viewportHeightPx: number,
  viewportWidthPx: number,
): number | undefined {
  const widthScale = fontScaleForColumnWidth(columnWidthPx)
  if (widthScale == null) return undefined
  if (viewportHeightPx <= 0) return widthScale
  const a4Cap = viewportScaleForA4(viewportHeightPx, viewportWidthPx)
  if (a4Cap == null) return widthScale
  return Math.min(widthScale, a4Cap)
}

export function scaledColumnTypography(scale: number): {
  fontSizePx: number
  lineHeightPx: number
} {
  return {
    fontSizePx: A4_COLUMN_FONT_SIZE_PX * scale,
    lineHeightPx: A4_COLUMN_LINE_HEIGHT_PX * scale,
  }
}

/** Scale chordlib A4 HTML to fit a viewport; uses the tighter of height and width when both are known. */
export function viewportScaleForA4(viewportHeightPx: number, viewportWidthPx?: number): number | undefined {
  if (viewportHeightPx <= 0) return undefined
  const heightScale = viewportHeightPx / A4_REFERENCE_HEIGHT_PX
  if (viewportWidthPx == null || viewportWidthPx <= 0) return heightScale
  const widthScale = viewportWidthPx / A4_REFERENCE_WIDTH_PX
  return Math.min(heightScale, widthScale)
}

/** CSS `transform: scale()` factor to fit unscaled content to a viewport width. */
export function cssScaleToViewportWidth(viewportWidth: number, contentWidth: number): number | undefined {
  if (viewportWidth <= 0 || contentWidth <= 0) return undefined
  return viewportWidth / contentWidth
}

/** CSS `transform: scale()` factor to fit unscaled content inside a viewport. */
export function cssScaleToFitViewport(
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
): number | undefined {
  if (viewportWidth <= 0 || viewportHeight <= 0 || contentWidth <= 0 || contentHeight <= 0) {
    return undefined
  }
  return Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight)
}

export type BookSpreadLayout = {
  width: number
  height: number
  pageWidth: number
}

/** Size a book spread to fit the viewport — mirrors legacy `get_content_dimensions`. */
export function bookSpreadLayout(
  viewportWidth: number,
  viewportHeight: number,
  hasTwoPages: boolean,
): BookSpreadLayout {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return { width: 0, height: 0, pageWidth: 0 }
  }

  const sqrt2 = Math.SQRT2
  let width: number
  let height: number

  if (!hasTwoPages) {
    width = Math.min(viewportWidth, viewportHeight / sqrt2)
    height = Math.min(viewportHeight, viewportWidth * sqrt2)
  } else {
    width = Math.min(viewportWidth, viewportHeight * sqrt2)
    height = Math.min(viewportHeight, viewportWidth / sqrt2)
  }

  return {
    width,
    height,
    pageWidth: hasTwoPages ? width / 2 : width,
  }
}
