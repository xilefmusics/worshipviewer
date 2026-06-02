import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { resolveBlobObjectUrl } from '@/lib/player/resolve-blob-url'

vi.mock('@/api/blob-data', () => ({
  fetchBlobBinaryWithMime: vi.fn(),
}))

import { fetchBlobBinaryWithMime } from '@/api/blob-data'

describe('resolveBlobObjectUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns offline-unavailable when network fetch is disabled', async () => {
    const result = await resolveBlobObjectUrl('b1', false)
    expect(result.status).toBe('offline-unavailable')
    expect(fetchBlobBinaryWithMime).not.toHaveBeenCalled()
  })

  it('fetches from network when allowed', async () => {
    vi.mocked(fetchBlobBinaryWithMime).mockResolvedValue({
      buffer: new ArrayBuffer(4),
      mime: 'application/pdf',
    })

    const result = await resolveBlobObjectUrl('b1', true)
    expect(result.status).toBe('ready')
    expect(fetchBlobBinaryWithMime).toHaveBeenCalled()
  })

  it('returns error when network fetch fails', async () => {
    vi.mocked(fetchBlobBinaryWithMime).mockResolvedValue(null)

    const result = await resolveBlobObjectUrl('b1', true)
    expect(result.status).toBe('error')
  })
})
