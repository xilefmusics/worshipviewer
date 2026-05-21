import { describe, expect, it } from 'vitest'

import { A4_REFERENCE_HEIGHT_PX, viewportScaleForA4 } from '@/lib/chord-a4-scale'

describe('viewportScaleForA4', () => {
  it('returns undefined for non-positive height', () => {
    expect(viewportScaleForA4(0)).toBeUndefined()
    expect(viewportScaleForA4(-1)).toBeUndefined()
  })

  it('scales viewport height against A4 reference', () => {
    expect(viewportScaleForA4(A4_REFERENCE_HEIGHT_PX)).toBe(1)
    expect(viewportScaleForA4(A4_REFERENCE_HEIGHT_PX / 2)).toBe(0.5)
  })
})
