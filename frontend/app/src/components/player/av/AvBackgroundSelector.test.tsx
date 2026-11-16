import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

  it('switches between background and foreground panels and updates foreground controls', async () => {
    const user = userEvent.setup()
    const onContentLayerChange = vi.fn()
    const onBilingualChange = vi.fn()
    renderSelector({
      foregroundSettings: {
        contentLayer: {
          ...DEFAULT_AV_PREFERENCES.contentLayer,
          maxLinesPerSlide: 3,
          balanceSlideLines: false,
          fontSize: 72,
          textAlign: 'left',
        },
        bilingualEnabled: true,
        onContentLayerChange,
        onBilingualChange,
      },
    })

    const backgroundToggle = screen.getByRole('button', { name: 'player.av.backgroundExpand' })
    const foregroundToggle = screen.getByRole('button', { name: 'player.av.foregroundExpand' })
    expect(backgroundToggle).toHaveAttribute('aria-expanded', 'false')
    expect(foregroundToggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(foregroundToggle)
    expect(foregroundToggle).toHaveAttribute('aria-expanded', 'true')
    expect(backgroundToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: 'player.av.foregroundTitle' })).toHaveClass(
      'av-background-selector-panel__body',
      'av-background-selector-panel__body--expanded',
    )
    expect(screen.queryByRole('radio', { name: 'settings.playerRoles.background.default' })).not.toBeInTheDocument()
    const fontSize = screen.getByRole('slider', { name: 'settings.playerRoles.content.fontSize' })
    expect(fontSize).toHaveAttribute('min', '20')
    expect(fontSize).toHaveAttribute('max', '120')
    expect(fontSize).toHaveAttribute('step', '1')
    expect(fontSize).toHaveValue('72')
    const linesPerSlide = screen.getByRole('slider', { name: 'settings.playerRoles.content.maxLines' })
    expect(linesPerSlide).toHaveAttribute('min', '1')
    expect(linesPerSlide).toHaveAttribute('max', '10')
    expect(linesPerSlide).toHaveAttribute('step', '1')
    expect(linesPerSlide).toHaveValue('3')
    const textAlign = screen.getByRole('slider', {
      name: 'settings.playerRoles.content.textAlignTitle',
    })
    expect(textAlign).toHaveValue('0')
    expect(textAlign).toHaveAttribute('aria-valuetext', 'settings.playerRoles.content.alignLeft')
    expect(screen.getByRole('checkbox', { name: 'player.av.foregroundShowTranslation' })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: /settings\.playerRoles\.content\.balanceSlideLines/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /settings\.lyricWhitespace\.collapse/ })).not.toBeInTheDocument()
    expect(screen.queryByText('settings.playerRoles.content.balanceSlideLinesDescription')).not.toBeInTheDocument()
    expect(screen.queryByText('settings.playerRoles.content.primaryTextColorDescription')).not.toBeInTheDocument()

    fireEvent.change(linesPerSlide, { target: { value: '5' } })
    expect(onContentLayerChange).toHaveBeenCalledWith({ maxLinesPerSlide: 5 })
    fireEvent.change(fontSize, { target: { value: '80' } })
    expect(onContentLayerChange).toHaveBeenCalledWith({ fontSize: 80 })
    fireEvent.change(textAlign, { target: { value: '1' } })
    expect(onContentLayerChange).toHaveBeenCalledWith({ textAlign: 'center' })
    await user.click(screen.getByRole('checkbox', { name: 'player.av.foregroundShowTranslation' }))
    expect(onBilingualChange).toHaveBeenCalledWith(false)

    await user.click(backgroundToggle)
    expect(backgroundToggle).toHaveAttribute('aria-expanded', 'true')
    expect(foregroundToggle).toHaveAttribute('aria-expanded', 'false')
    expect(await screen.findByRole('radio', { name: 'settings.playerRoles.background.default' })).toBeInTheDocument()

    await user.click(backgroundToggle)
    expect(backgroundToggle).toHaveAttribute('aria-expanded', 'false')
    expect(foregroundToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: 'player.av.backgroundTitle' })).not.toHaveClass(
      'av-background-selector-panel__body--expanded',
    )
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
    expect(none.querySelector('.av-geometry-selector__preview')?.textContent).toBe('')
    expect(within(none).getByText('player.av.geometryOverlayNone')).toBeInTheDocument()
    expect(cross).toHaveAttribute('aria-checked', 'true')
    const defaultBackground = screen.getByRole('radio', {
      name: 'settings.playerRoles.background.default',
    })
    const customBackground = await screen.findByRole('radio', { name: 'Sunset' })
    for (const label of ['InvertedCross', 'SlicedSquare', 'SlicedRectangle', 'SlicedRectangleThree', 'Circle', 'Square', 'Rectangle', 'Triangle', 'InvertedTriangle', 'Diamond', 'Heart', 'Gospel']) {
      expect(screen.getByRole('radio', { name: `player.av.geometryOverlay${label}` })).toHaveAttribute('aria-checked', 'false')
    }
    expect(screen.getAllByRole('radio', { name: /player\.av\.geometryOverlay/ })).toHaveLength(14)
    expect(within(defaultBackground).getByTestId('background-preview-2')).toHaveAttribute('data-overlay', 'none')
    expect(within(customBackground).getByTestId('background-preview-2')).toHaveAttribute('data-overlay', 'none')

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

  it('omits None from the collapsed background summary', () => {
    renderSelector({
      geometryOverlay: 'none',
      onSelectGeometryOverlay: vi.fn(),
    })

    const toggle = screen.getByRole('button', { name: 'player.av.backgroundExpand' })
    expect(toggle).toHaveTextContent('settings.playerRoles.background.default')
    expect(toggle).not.toHaveTextContent('player.av.geometryOverlayNone')
  })

  it('omits geometry controls from background override callers', async () => {
    renderSelector({ initiallyExpanded: true })
    expect(await screen.findByRole('radio', { name: 'settings.playerRoles.background.default' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'player.av.geometryOverlayAria' })).not.toBeInTheDocument()
  })
})
