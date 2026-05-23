import { describe, expect, it } from 'vitest'

import { remapSheetScanImageData, shouldRemapSheetImageMime } from '@/lib/sheet-image-remap'

function makeImageData(width: number, height: number, pixels: number[]): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(pixels),
    colorSpace: 'srgb',
  } as ImageData
}

describe('remapSheetScanImageData', () => {
  it('maps white to background and black to foreground', () => {
    const imageData = makeImageData(2, 1, [
      255, 255, 255, 255,
      0, 0, 0, 255,
    ])

    remapSheetScanImageData(imageData, [40, 44, 52], [240, 244, 248])

    expect(Array.from(imageData.data.slice(0, 4))).toEqual([40, 44, 52, 255])
    expect(Array.from(imageData.data.slice(4, 8))).toEqual([240, 244, 248, 255])
  })

  it('interpolates mid-gray between bg and fg', () => {
    const imageData = makeImageData(1, 1, [128, 128, 128, 255])

    remapSheetScanImageData(imageData, [0, 0, 0], [200, 200, 200])

    expect(imageData.data[0]).toBe(100)
    expect(imageData.data[1]).toBe(100)
    expect(imageData.data[2]).toBe(100)
  })

  it('leaves transparent pixels untouched', () => {
    const imageData = makeImageData(1, 1, [255, 255, 255, 0])

    remapSheetScanImageData(imageData, [10, 20, 30], [240, 250, 255])

    expect(Array.from(imageData.data)).toEqual([255, 255, 255, 0])
  })
})

describe('shouldRemapSheetImageMime', () => {
  it('remaps png and other raster images', () => {
    expect(shouldRemapSheetImageMime('image/png')).toBe(true)
    expect(shouldRemapSheetImageMime('image/webp')).toBe(true)
  })

  it('skips jpeg, pdf, and unknown types', () => {
    expect(shouldRemapSheetImageMime('image/jpeg')).toBe(false)
    expect(shouldRemapSheetImageMime('image/jpg')).toBe(false)
    expect(shouldRemapSheetImageMime('application/pdf')).toBe(false)
    expect(shouldRemapSheetImageMime(null)).toBe(false)
  })
})
