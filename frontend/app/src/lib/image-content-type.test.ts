import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { imageContentTypeFromBytes } from '@/lib/image-content-type'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('imageContentTypeFromBytes', () => {
  it('detects PNG from magic bytes', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(imageContentTypeFromBytes(png)).toBe('image/png')
  })

  it('detects JPEG from magic bytes', () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])
    expect(imageContentTypeFromBytes(jpeg)).toBe('image/jpeg')
  })

  it('ignores browser-reported mime and uses bytes for appicon.png', () => {
    const bytes = readFileSync(join(repoRoot, 'resources/appicon.png'))
    expect(imageContentTypeFromBytes(bytes)).toBe('image/png')
  })

  it('rejects unsupported formats', () => {
    expect(imageContentTypeFromBytes(Uint8Array.from([0, 1, 2]))).toBeNull()
  })
})
