/** DIN-A4 page height (px) used by chordlib HTML scaling — matches legacy player. */
export const A4_REFERENCE_HEIGHT_PX = 1123

/** DIN-A4 page width (px) at scale 1 — matches `max-w-[794px]` player/editor surface. */
export const A4_REFERENCE_WIDTH_PX = 794

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
