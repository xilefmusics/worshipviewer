import { cssScaleToFitViewport } from '@/lib/chord-a4-scale'

/** 16:9 presenter slide design size (matches legacy `fontSize / 19.2` cqw mapping at 1920px). */
export const AV_SLIDE_DESIGN_WIDTH_PX = 1920
export const AV_SLIDE_DESIGN_HEIGHT_PX = 1080

/** Outer content padding on the design slide (`4cqw` at 1920px width). */
export const AV_SLIDE_EDGE_PADDING_PX = AV_SLIDE_DESIGN_WIDTH_PX * 0.04

export const AV_SLIDE_LINE_HEIGHT_RATIO = 1.25

export function avSlideInnerPaddingPx(fontSize: number): number {
  return fontSize * 2
}

export function avSlideLineHeightPx(fontSize: number): number {
  return fontSize * AV_SLIDE_LINE_HEIGHT_RATIO
}

export function avSlideScaleToFitViewport(
  viewportWidth: number,
  viewportHeight: number,
): number | undefined {
  return cssScaleToFitViewport(
    viewportWidth,
    viewportHeight,
    AV_SLIDE_DESIGN_WIDTH_PX,
    AV_SLIDE_DESIGN_HEIGHT_PX,
  )
}
