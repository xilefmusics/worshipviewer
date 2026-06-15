import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchCollectionDetail = vi.fn()
const runOrderedSongsPdfExport = vi.fn()
const runOrderedSongsZipExport = vi.fn()

vi.mock('@/api/collections-detail', () => ({
  fetchCollectionDetail: (...args: unknown[]) => fetchCollectionDetail(...args),
}))

vi.mock('@/lib/hydrate-hub-song-links', () => ({
  runOrderedSongsPdfExport: (...args: unknown[]) => runOrderedSongsPdfExport(...args),
  runOrderedSongsZipExport: (...args: unknown[]) => runOrderedSongsZipExport(...args),
}))

import { runCollectionExport } from '@/lib/run-collection-export'

describe('runCollectionExport', () => {
  const queryClient = new QueryClient()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchCollectionDetail.mockResolvedValue({
      title: 'Hymns',
      songs: [{ id: 'song-1', nr: '1', key: null, tempo: null }],
    })
  })

  it('runs PDF export for pdf kind', async () => {
    await runCollectionExport(queryClient, 'coll-1', 'pdf', 'letters')
    expect(fetchCollectionDetail).toHaveBeenCalledWith(queryClient, { id: 'coll-1' })
    expect(runOrderedSongsPdfExport).toHaveBeenCalledWith(
      queryClient,
      'Hymns',
      expect.any(Array),
      'letters',
      undefined,
    )
  })

  it('runs zip export for worshippro kind', async () => {
    await runCollectionExport(queryClient, 'coll-1', 'worshippro', 'nashville')
    expect(runOrderedSongsZipExport).toHaveBeenCalledWith(
      queryClient,
      'Hymns',
      expect.any(Array),
      'worshippro',
      'nashville',
      undefined,
    )
  })

  it('forwards hide chords preference', async () => {
    await runCollectionExport(queryClient, 'coll-1', 'pdf', 'letters', true)
    expect(runOrderedSongsPdfExport).toHaveBeenCalledWith(
      queryClient,
      'Hymns',
      expect.any(Array),
      'letters',
      true,
    )
  })
})
