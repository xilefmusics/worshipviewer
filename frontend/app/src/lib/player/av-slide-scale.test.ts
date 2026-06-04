import { describe, expect, it } from 'vitest'

import {
  AV_SLIDE_DESIGN_HEIGHT_PX,
  AV_SLIDE_DESIGN_WIDTH_PX,
  AV_SLIDE_EDGE_PADDING_PX,
  avSlideInnerPaddingPx,
  avSlideLineHeightPx,
  avSlideScaleToFitViewport,
} from '@/lib/player/av-slide-scale'

describe('av-slide-scale', () => {
  it('uses a 1920×1080 design canvas with legacy edge padding', () => {
    expect(AV_SLIDE_DESIGN_WIDTH_PX).toBe(1920)
    expect(AV_SLIDE_DESIGN_HEIGHT_PX).toBe(1080)
    expect(AV_SLIDE_EDGE_PADDING_PX).toBeCloseTo(76.8)
  })

  it('maps font size to fixed inner padding and line height', () => {
    expect(avSlideInnerPaddingPx(60)).toBe(120)
    expect(avSlideLineHeightPx(60)).toBe(75)
  })

  it('letterboxes the design slide into the viewport', () => {
    expect(avSlideScaleToFitViewport(960, 540)).toBe(0.5)
    expect(avSlideScaleToFitViewport(1920, 540)).toBe(0.5)
    expect(avSlideScaleToFitViewport(1920, 1080)).toBe(1)
  })
})
