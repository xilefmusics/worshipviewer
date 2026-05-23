import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { resolveBlobObjectUrl } from '@/lib/player/resolve-blob-url'

vi.mock('@/lib/offline/setlist-player-cache', () => ({
  getCachedBlob: vi.fn(),
}))

vi.mock('@/api/blob-data', () => ({
  fetchBlobBinaryWithMime: vi.fn(),
}))

import { fetchBlobBinaryWithMime } from '@/api/blob-data'
import { getCachedBlob } from '@/lib/offline/setlist-player-cache'

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

  it('uses Dexie cache without network fetch', async () => {
    vi.mocked(getCachedBlob).mockResolvedValue({
      blobId: 'b1',
      bytes: new ArrayBuffer(8),
      mime: 'image/png',
      lastTouchedAt: Date.now(),
    })

    const result = await resolveBlobObjectUrl('b1', true)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.objectUrl).toBe('blob:mock')
    }
    expect(fetchBlobBinaryWithMime).not.toHaveBeenCalled()
  })

  it('returns offline-unavailable when offline and no cache', async () => {
    vi.mocked(getCachedBlob).mockResolvedValue(null)
    const result = await resolveBlobObjectUrl('b1', false)
    expect(result.status).toBe('offline-unavailable')
  })

  it('fetches from network when allowed and no cache', async () => {
    vi.mocked(getCachedBlob).mockResolvedValue(null)
    vi.mocked(fetchBlobBinaryWithMime).mockResolvedValue({
      buffer: new ArrayBuffer(4),
      mime: 'application/pdf',
    })

    const result = await resolveBlobObjectUrl('b1', true)
    expect(result.status).toBe('ready')
    expect(fetchBlobBinaryWithMime).toHaveBeenCalled()
  })

  it('returns error when network fetch fails', async () => {
    vi.mocked(getCachedBlob).mockResolvedValue(null)
    vi.mocked(fetchBlobBinaryWithMime).mockResolvedValue(null)

    const result = await resolveBlobObjectUrl('b1', true)
    expect(result.status).toBe('error')
  })
})
