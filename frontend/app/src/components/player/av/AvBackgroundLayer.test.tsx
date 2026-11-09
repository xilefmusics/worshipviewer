import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AvBackgroundLayer } from '@/components/player/av/AvBackgroundLayer'

vi.mock('@/api/media-upload', () => ({
  mediaAssetDataUrl: (mediaId: string, assetId: string) => `/media/${mediaId}/${assetId}`,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AvBackgroundLayer custom image rendering', () => {
  it('loads the authenticated asset and overlays it on the saved preset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/png' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:background-image')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { container } = render(
      <AvBackgroundLayer
        layer={{ preset: 2, image: { mediaId: 'media:bg', assetId: 'asset:bg' } }}
      />,
    )
    expect(container.firstElementChild).toHaveClass('av-background-layer--preset-2')
    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute('src', 'blob:background-image'),
    )
    expect(fetchMock).toHaveBeenCalledWith('/media/media:bg/asset:bg', expect.objectContaining({
      credentials: 'include',
    }))
  })

  it('shows the Default preset when the custom asset is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const { container } = render(
      <AvBackgroundLayer
        layer={{ preset: 4, image: { mediaId: 'media:missing', assetId: 'asset:missing' } }}
      />,
    )

    await waitFor(() => expect(container.firstElementChild).toHaveClass('av-background-layer--preset-2'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('uses the player background when an overridden image cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('missing')) return { ok: false }
      return { ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }
    }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:current-background')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const { container } = render(
      <AvBackgroundLayer
        layer={{ preset: 2, image: { mediaId: 'media:missing', assetId: 'asset:missing' } }}
        fallbackLayer={{ preset: 2, image: { mediaId: 'media:current', assetId: 'asset:current' } }}
      />,
    )

    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute('src', 'blob:current-background'),
    )
  })

  it('uses the player background when an overridden video fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/png' }),
    }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:player-background')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const { container } = render(
      <AvBackgroundLayer
        layer={{ preset: 2, video: { mediaId: 'media:missing', assetId: 'asset:missing' } }}
        fallbackLayer={{ preset: 2, image: { mediaId: 'media:current', assetId: 'asset:current' } }}
      />,
    )
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    fireEvent.error(video!)

    await waitFor(() => expect(container.querySelector('video')).not.toBeInTheDocument())
    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute('src', 'blob:player-background'),
    )
  })
})
