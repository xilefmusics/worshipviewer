import { describe, expect, it } from 'vitest'

import {
  A4_COLUMN_FONT_SIZE_PX,
  A4_COLUMN_LINE_HEIGHT_PX,
  A4_REFERENCE_COLUMN_WIDTH_PX,
  A4_REFERENCE_HEIGHT_PX,
  A4_REFERENCE_WIDTH_PX,
  bookSpreadLayout,
  columnWidthInMultiColumnLayout,
  cssScaleToFitViewport,
  cssScaleToViewportWidth,
  cappedColumnFontScale,
  fontScaleForColumnWidth,
  scaledColumnTypography,
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

describe('bookSpreadLayout', () => {
  it('returns zero dimensions for invalid viewport', () => {
    expect(bookSpreadLayout(0, 800, true)).toEqual({ width: 0, height: 0, pageWidth: 0 })
  })

  it('sizes a single page spread from viewport height', () => {
    const layout = bookSpreadLayout(390, 844, false)
    expect(layout.width).toBe(390)
    expect(layout.pageWidth).toBe(390)
    expect(layout.height).toBeCloseTo(390 * Math.SQRT2, 0)
  })

  it('sizes a two-page spread and splits page width evenly', () => {
    const layout = bookSpreadLayout(844, 390, true)
    expect(layout.width).toBeCloseTo(390 * Math.SQRT2, 0)
    expect(layout.height).toBe(390)
    expect(layout.pageWidth).toBeCloseTo((390 * Math.SQRT2) / 2, 0)
  })
})

describe('column typography scaling', () => {
  it('matches chordlib A4 column width at scale 1', () => {
    expect(A4_REFERENCE_COLUMN_WIDTH_PX).toBe(322)
    expect(fontScaleForColumnWidth(A4_REFERENCE_COLUMN_WIDTH_PX)).toBe(1)
    expect(scaledColumnTypography(1)).toEqual({
      fontSizePx: A4_COLUMN_FONT_SIZE_PX,
      lineHeightPx: A4_COLUMN_LINE_HEIGHT_PX,
    })
  })

  it('derives column width from container layout', () => {
    expect(columnWidthInMultiColumnLayout(1000, 3, 24, 32)).toBeCloseTo((1000 - 32 - 48) / 3, 5)
  })

  it('scales typography with column width', () => {
    const scale = fontScaleForColumnWidth(A4_REFERENCE_COLUMN_WIDTH_PX / 2)
    expect(scale).toBe(0.5)
    expect(scaledColumnTypography(scale!)).toEqual({ fontSizePx: 6.5, lineHeightPx: 8.5 })
  })

  it('caps column font scale to A4 viewport scale', () => {
    const wideColumnScale = fontScaleForColumnWidth(A4_REFERENCE_COLUMN_WIDTH_PX * 1.5)!
    const a4Cap = viewportScaleForA4(A4_REFERENCE_HEIGHT_PX, A4_REFERENCE_WIDTH_PX)!
    expect(wideColumnScale).toBeGreaterThan(a4Cap)
    expect(
      cappedColumnFontScale(
        A4_REFERENCE_COLUMN_WIDTH_PX * 1.5,
        A4_REFERENCE_HEIGHT_PX,
        A4_REFERENCE_WIDTH_PX,
      ),
    ).toBe(a4Cap)
  })
})
