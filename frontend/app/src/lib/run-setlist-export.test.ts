import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchSetlistDetail = vi.fn()
const runOrderedSongsPdfExport = vi.fn()
const runOrderedSongsZipExport = vi.fn()

vi.mock('@/api/setlists-detail', () => ({
  fetchSetlistDetail: (...args: unknown[]) => fetchSetlistDetail(...args),
}))

vi.mock('@/lib/hydrate-hub-song-links', () => ({
  runOrderedSongsPdfExport: (...args: unknown[]) => runOrderedSongsPdfExport(...args),
  runOrderedSongsZipExport: (...args: unknown[]) => runOrderedSongsZipExport(...args),
}))

import { runSetlistExport } from '@/lib/run-setlist-export'

describe('runSetlistExport', () => {
  const queryClient = new QueryClient()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchSetlistDetail.mockResolvedValue({
      title: 'Sunday',
      songs: [{ id: 'song-1', nr: '1', key: null, tempo: null, language: 'de' }],
    })
  })

  it('runs PDF export for pdf kind', async () => {
    await runSetlistExport(queryClient, 'sl-1', 'pdf', 'letters')
    expect(fetchSetlistDetail).toHaveBeenCalledWith(queryClient, { id: 'sl-1' })
    expect(runOrderedSongsPdfExport).toHaveBeenCalledWith(
      queryClient,
      'Sunday',
      expect.any(Array),
      'letters',
      undefined,
    )
    expect(runOrderedSongsZipExport).not.toHaveBeenCalled()
  })

  it('runs zip export for chordpro kind', async () => {
    await runSetlistExport(queryClient, 'sl-1', 'chordpro', 'nashville')
    expect(runOrderedSongsZipExport).toHaveBeenCalledWith(
      queryClient,
      'Sunday',
      expect.any(Array),
      'chordpro',
      'nashville',
      undefined,
    )
  })

  it('runs zip export for ProPresenter kind', async () => {
    await runSetlistExport(queryClient, 'sl-1', 'propresenter', 'letters')
    expect(runOrderedSongsZipExport).toHaveBeenCalledWith(
      queryClient,
      'Sunday',
      expect.any(Array),
      'propresenter',
      'letters',
      undefined,
    )
  })

  it('forwards setlist slot language to ordered export links', async () => {
    await runSetlistExport(queryClient, 'sl-1', 'chordpro', 'letters')
    expect(runOrderedSongsZipExport).toHaveBeenCalledWith(
      queryClient,
      'Sunday',
      [{ id: 'song-1', nr: '1', key: null, tempo: null, language: 'de', flow: null }],
      'chordpro',
      'letters',
      undefined,
    )
  })

  it('forwards hide chords preference', async () => {
    await runSetlistExport(queryClient, 'sl-1', 'pdf', 'letters', true)
    expect(runOrderedSongsPdfExport).toHaveBeenCalledWith(
      queryClient,
      'Sunday',
      expect.any(Array),
      'letters',
      true,
    )
  })
})
