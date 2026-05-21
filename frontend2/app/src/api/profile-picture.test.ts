import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { imageContentTypeFromBytes } from '@/lib/image-content-type'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('putProfilePicture content type', () => {
  it('uses PNG magic bytes for appicon.png even when browser mime is wrong', async () => {
    const bytes = readFileSync(join(repoRoot, 'resources/appicon.png'))
    const file = new File([bytes], 'appicon.png', { type: 'image/jpeg' })
    const buf = await file.arrayBuffer()
    expect(imageContentTypeFromBytes(buf)).toBe('image/png')
  })
})
