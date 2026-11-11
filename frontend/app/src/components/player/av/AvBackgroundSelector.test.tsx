import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchMediaPage } from '@/api/media'
import { AvBackgroundSelector } from '@/components/player/av/AvBackgroundSelector'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/api/media', () => ({
  fetchMediaPage: vi.fn(),
  mediaListKey: (...parts: unknown[]) => ['media', 'list', ...parts],
}))

vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: ({ backgroundLayer, geometryOverlay }: {
    backgroundLayer: { preset: number }
    geometryOverlay?: string
  }) => (
    <div data-testid={`background-preview-${backgroundLayer.preset}`} data-overlay={geometryOverlay} />
  ),
}))

const backgrounds = [
  {
    id: 'media:custom',
    owner: 'team:1',
    title: 'Sunset',
    is_background: true,
    content: { type: 'image', blob_id: 'asset:custom' },
  },
  {
    id: 'media:ordinary',
    owner: 'team:1',
    title: 'Ordinary image',
    is_background: false,
    content: { type: 'image', blob_id: 'asset:ordinary' },
  },
  {
    id: 'media:unsupported',
    owner: 'team:1',
    title: 'Flagged video',
    is_background: true,
    content: { type: 'video', blob_id: 'asset:video', duration_ms: 1, width: 1, height: 1 },
  },
]

function renderSelector(props: Partial<React.ComponentProps<typeof AvBackgroundSelector>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AvBackgroundSelector
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        previewText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        onSelectPreset={vi.fn()}
        onSelectBackgroundImage={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('AvBackgroundSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchMediaPage).mockResolvedValue({ items: backgrounds as never[], total: 3 })
  })

  it('shows the Default preset and only flagged image backgrounds', async () => {
    const user = userEvent.setup()
    const onSelectPreset = vi.fn()
    const onSelectBackgroundImage = vi.fn()
    renderSelector({ onSelectPreset, onSelectBackgroundImage })

    await user.click(screen.getByRole('button', { name: 'player.av.backgroundExpand' }))

    const defaultBackground = screen.getByRole('radio', {
      name: 'settings.playerRoles.background.default',
    })
    const customImage = await screen.findByRole('radio', { name: 'Sunset' })

    expect(defaultBackground).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /zeltlager/i })).not.toBeInTheDocument()
    expect(within(defaultBackground).getByTestId('background-preview-2')).toBeInTheDocument()
    expect(screen.queryByTestId('background-preview-3')).not.toBeInTheDocument()
    expect(screen.queryByTestId('background-preview-4')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Ordinary image' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Flagged video' })).not.toBeInTheDocument()
    expect(fetchMediaPage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      q: '',
      isBackground: true,
    }))

    await user.click(defaultBackground)
    expect(onSelectPreset).toHaveBeenCalledWith(2)
    await user.click(customImage)
    expect(onSelectBackgroundImage).toHaveBeenCalledWith({ mediaId: 'media:custom', assetId: 'asset:custom' })
  })

  it('offers an explicit player-background inheritance option for song overrides', async () => {
    const user = userEvent.setup()
    const onSelectInherited = vi.fn()
    renderSelector({
      initiallyExpanded: true,
      selectedInherited: true,
      onSelectInherited,
    })

    const inherited = await screen.findByRole('radio', { name: 'player.av.usePlayerBackground' })
    const defaultBackground = screen.getByRole('radio', {
      name: 'settings.playerRoles.background.default',
    })
    expect(inherited).toHaveAttribute('aria-checked', 'true')
    expect(defaultBackground).toHaveAttribute('aria-checked', 'false')

    await user.click(inherited)
    expect(onSelectInherited).toHaveBeenCalledOnce()
  })

  it('shows all geometry choices in AV selectors and lets overlays be changed or cleared', async () => {
    const user = userEvent.setup()
    const onSelectGeometryOverlay = vi.fn()
    renderSelector({
      initiallyExpanded: true,
      geometryOverlay: 'cross',
      onSelectGeometryOverlay,
    })

    const none = await screen.findByRole('radio', { name: 'player.av.geometryOverlayNone' })
    const cross = screen.getByRole('radio', { name: 'player.av.geometryOverlayCross' })
    expect(none).toHaveAttribute('aria-checked', 'false')
    expect(cross).toHaveAttribute('aria-checked', 'true')
    for (const label of ['InvertedCross', 'SlicedSquare', 'SlicedRectangle', 'Circle', 'Square', 'Rectangle', 'Triangle', 'InvertedTriangle', 'Diamond', 'Heart']) {
      expect(screen.getByRole('radio', { name: `player.av.geometryOverlay${label}` })).toHaveAttribute('aria-checked', 'false')
    }
    expect(screen.getAllByRole('radio', { name: /player\.av\.geometryOverlay/ })).toHaveLength(12)
    expect(screen.getByTestId('background-preview-2')).toHaveAttribute('data-overlay', 'cross')

    await user.click(none)
    expect(onSelectGeometryOverlay).toHaveBeenCalledWith('none')
    await user.click(cross)
    expect(onSelectGeometryOverlay).toHaveBeenCalledWith('cross')
    await user.click(screen.getByRole('radio', { name: 'player.av.geometryOverlayInvertedCross' }))
    expect(onSelectGeometryOverlay).toHaveBeenCalledWith('inverted_cross')
    await user.click(screen.getByRole('radio', { name: 'player.av.geometryOverlaySlicedSquare' }))
    expect(onSelectGeometryOverlay).toHaveBeenCalledWith('sliced_square')
    await user.click(screen.getByRole('radio', { name: 'player.av.geometryOverlaySlicedRectangle' }))
    expect(onSelectGeometryOverlay).toHaveBeenCalledWith('sliced_rectangle')
    await user.click(screen.getByRole('radio', { name: 'player.av.geometryOverlayDiamond' }))
    expect(onSelectGeometryOverlay).toHaveBeenCalledWith('diamond')
    await user.click(screen.getByRole('radio', { name: 'player.av.geometryOverlayInvertedTriangle' }))
    expect(onSelectGeometryOverlay).toHaveBeenCalledWith('inverted_triangle')
    await user.click(screen.getByRole('radio', { name: 'player.av.geometryOverlayHeart' }))
    expect(onSelectGeometryOverlay).toHaveBeenCalledWith('heart')
  })

  it('omits geometry controls from background override callers', async () => {
    renderSelector({ initiallyExpanded: true })
    expect(await screen.findByRole('radio', { name: 'settings.playerRoles.background.default' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'player.av.geometryOverlayAria' })).not.toBeInTheDocument()
  })
})
