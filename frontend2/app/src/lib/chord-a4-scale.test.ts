import { describe, expect, it } from 'vitest'

import {
  A4_REFERENCE_HEIGHT_PX,
  A4_REFERENCE_WIDTH_PX,
  cssScaleToFitViewport,
  cssScaleToViewportWidth,
  viewportScaleForA4,
} from '@/lib/chord-a4-scale'

describe('viewportScaleForA4', () => {
  it('returns undefined for non-positive height', () => {
    expect(viewportScaleForA4(0)).toBeUndefined()
    expect(viewportScaleForA4(-1)).toBeUndefined()
  })

  it('scales viewport height against A4 reference', () => {
    expect(viewportScaleForA4(A4_REFERENCE_HEIGHT_PX)).toBe(1)
    expect(viewportScaleForA4(A4_REFERENCE_HEIGHT_PX / 2)).toBe(0.5)
  })

  it('uses the tighter of height and width scales', () => {
    expect(viewportScaleForA4(A4_REFERENCE_HEIGHT_PX, A4_REFERENCE_WIDTH_PX)).toBe(1)
    expect(viewportScaleForA4(A4_REFERENCE_HEIGHT_PX, A4_REFERENCE_WIDTH_PX / 2)).toBe(0.5)
    expect(viewportScaleForA4(A4_REFERENCE_HEIGHT_PX / 2, A4_REFERENCE_WIDTH_PX)).toBe(0.5)
  })
})

describe('cssScaleToViewportWidth', () => {
  it('returns undefined for invalid dimensions', () => {
    expect(cssScaleToViewportWidth(0, 794)).toBeUndefined()
    expect(cssScaleToViewportWidth(400, 0)).toBeUndefined()
  })

  it('scales content width to the viewport width', () => {
    expect(cssScaleToViewportWidth(400, 794)).toBeCloseTo(400 / 794, 5)
    expect(cssScaleToViewportWidth(794, 794)).toBe(1)
  })
})

describe('cssScaleToFitViewport', () => {
  it('returns undefined for invalid dimensions', () => {
    expect(cssScaleToFitViewport(0, 100, 50, 50)).toBeUndefined()
    expect(cssScaleToFitViewport(100, 100, 0, 50)).toBeUndefined()
  })

  it('uses the tighter axis', () => {
    expect(cssScaleToFitViewport(400, 800, 794, 1123)).toBeCloseTo(400 / 794, 5)
    expect(cssScaleToFitViewport(794, 500, 794, 1123)).toBeCloseTo(500 / 1123, 5)
  })
})
