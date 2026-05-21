/** DIN-A4 page height (px) used by chordlib HTML scaling — matches legacy player. */
export const A4_REFERENCE_HEIGHT_PX = 1123

export function viewportScaleForA4(viewportHeightPx: number): number | undefined {
  if (viewportHeightPx <= 0) return undefined
  return viewportHeightPx / A4_REFERENCE_HEIGHT_PX
}
