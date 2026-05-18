import { afterEach, describe, expect, it, vi } from 'vitest'

import { blobDataUrl } from '@/api/blob-data'

describe('blobDataUrl', () => {
  const env = import.meta.env

  afterEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', env.VITE_API_BASE_URL)
  })

  it('returns a relative path when VITE_API_BASE_URL is unset', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(blobDataUrl('abc-123')).toBe('/api/v1/blobs/abc-123/data')
  })

  it('encodes the blob id', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(blobDataUrl('a/b')).toBe('/api/v1/blobs/a%2Fb/data')
  })

  it('prefixes base URL without trailing slash', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    expect(blobDataUrl('id1')).toBe('https://api.example.com/api/v1/blobs/id1/data')
  })
})
