import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AvSlideView } from '@/components/player/av/AvSlideView'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('motion/react', () => ({
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: { children?: unknown }) => children,
  motion: {
    div: ({ children, className }: { children?: unknown; className?: string }) => (
      <div className={className}>{children as never}</div>
    ),
  },
}))

vi.mock('@/components/player/av/AvSlideScaledStage', () => ({
  AvSlideScaledStage: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}))

vi.mock('@/components/media/MediaDeckPageView', () => ({
  MediaDeckPageView: ({ mediaId, blobId }: { mediaId: string; blobId: string }) => (
    <img alt="deck-page" data-testid="deck-page" data-media={mediaId} data-asset={blobId} />
  ),
}))

describe('AvSlideView', () => {
  it('renders Markdown as a styled content layer', () => {
    render(<AvSlideView markdown="# Welcome" contentLayer={DEFAULT_AV_PREFERENCES.contentLayer} backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer} transition={DEFAULT_AV_PREFERENCES.transition} screenState="live" preview />)
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    expect(screen.queryByTestId('deck-page')).not.toBeInTheDocument()
  })

  it('adds opposite-contrast treatment only when the background is omitted', () => {
    const contentLayer = {
      ...DEFAULT_AV_PREFERENCES.contentLayer,
      primaryTextLightness: 0,
      secondaryTextLightness: 100,
      textShadow: 'none' as const,
    }
    const view = (showBackground: boolean) => (
      <AvSlideView
        contentLines={[{ primary: 'Black lyrics', secondary: 'White translation' }]}
        contentLayer={contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="live"
        compact
        showBackground={showBackground}
      />
    )
    const { container, rerender } = render(view(false))

    expect(container.firstElementChild).toHaveClass(
      'av-slide-view--transparent-preview',
    )
    expect(screen.getByText('Black lyrics')).toHaveClass(
      'av-slide-content__line--shadow-white',
    )
    expect(screen.getByText('White translation')).toHaveClass(
      'av-slide-content__line--shadow-black',
    )

    rerender(view(true))

    expect(container.firstElementChild).not.toHaveClass(
      'av-slide-view--transparent-preview',
    )
  })

  it('contains a live deck page and hides it for blank and blackout', () => {
    const view = (screenState: 'live' | 'blank' | 'blackout') => (
      <AvSlideView
        deckPage={{ mediaId: 'media-1', assetId: 'page-a' }}
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState={screenState}
      />
    )
    const { container, rerender } = render(view('live'))
    expect(screen.getByTestId('deck-page')).toHaveAttribute('data-asset', 'page-a')
    expect(container.firstElementChild).toHaveClass('av-slide-view--deck')
    expect(container.querySelector('.av-slide-view__background')).not.toBeInTheDocument()
    expect(container.querySelector('.av-slide-view__animated-layer')).not.toBeInTheDocument()

    rerender(view('blank'))
    expect(screen.getByTestId('deck-page')).toHaveAttribute('data-asset', 'page-a')
    expect(container.querySelector('.av-slide-view__blank-overlay')).toBeInTheDocument()
    expect(container.querySelector('.av-slide-view__blank-background')).toBeInTheDocument()
    expect(screen.getByText('player.av.blankOn')).toBeInTheDocument()

    rerender(view('blackout'))
    expect(screen.queryByTestId('deck-page')).not.toBeInTheDocument()
    expect(document.querySelector('.av-slide-view--blackout')).toBeTruthy()
  })

  it('renders the persistent cross above the background and below slide content', () => {
    const { container, rerender } = render(
      <AvSlideView
        contentText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        geometryOverlay="cross"
        geometryOverlayOpacity={70}
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="live"
        compact
      />,
    )
    const overlay = screen.getByTestId('av-geometry-overlay-cross')
    const background = container.querySelector('.av-slide-view__background')!
    const content = container.querySelector('.av-slide-view__content')!
    const cross = overlay.querySelector<HTMLElement>('.av-geometry-overlay__cross')!
    const shape = overlay.querySelector('.av-geometry-overlay__cross-shape')
    expect(overlay.style.getPropertyValue('--av-geometry-overlay-opacity')).toBe('0.7')
    expect(cross.style.inset).toBe('15%')
    expect(shape).toBeInTheDocument()
    expect(background.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(overlay.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    rerender(
      <AvSlideView
        contentText="Next lyric slide"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        geometryOverlay="cross"
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="live"
        compact
      />,
    )
    expect(screen.getByTestId('av-geometry-overlay-cross')).toBeInTheDocument()

    rerender(
      <AvSlideView
        contentText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        geometryOverlay="cross"
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="blank"
        compact
      />,
    )
    expect(screen.getByTestId('av-geometry-overlay-cross')).toBeInTheDocument()

    rerender(
      <AvSlideView
        contentText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        geometryOverlay="cross"
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="blackout"
        compact
      />,
    )
    expect(screen.queryByTestId('av-geometry-overlay-cross')).not.toBeInTheDocument()
  })

  it.each(['circle', 'square', 'triangle', 'inverted_triangle', 'diamond', 'heart'] as const)(
    'centers the %s with 15 percent top and bottom gaps at 70 percent opacity',
    (geometryOverlay) => {
      render(
        <AvSlideView
          contentText="Lyrics"
          contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
          backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
          geometryOverlay={geometryOverlay}
          geometryOverlayOpacity={70}
          transition={DEFAULT_AV_PREFERENCES.transition}
          screenState="live"
          compact
        />,
      )

      const overlay = screen.getByTestId(`av-geometry-overlay-${geometryOverlay}`)
      expect(overlay.style.getPropertyValue('--av-geometry-overlay-opacity')).toBe('0.7')
      expect(overlay.querySelector('.av-geometry-overlay__shape')).toHaveClass(
        `av-geometry-overlay__shape--${geometryOverlay}`,
      )
      const shape = overlay.querySelector<HTMLElement>('.av-geometry-overlay__shape')!
      expect(shape.style.width).toBe('70cqh')
      expect(shape.style.height).toBe('70%')
      expect(shape.style.top).toBe('15%')
      expect(shape.style.aspectRatio).toBe('1 / 1')
    },
  )

  it('renders an inverted cross as four panels around a cross-shaped cutout', () => {
    render(
      <AvSlideView
        contentText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        geometryOverlay="inverted_cross"
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="live"
        compact
      />,
    )

    const overlay = screen.getByTestId('av-geometry-overlay-inverted_cross')
    const panels = overlay.querySelectorAll('.av-geometry-overlay__inverted-cross-panel')
    expect(panels).toHaveLength(4)
    expect(overlay.querySelector('.av-geometry-overlay__shape')).not.toBeInTheDocument()
    expect(overlay.querySelector('.av-geometry-overlay__cross-shape')).not.toBeInTheDocument()
  })

  it('renders a sliced square as two vertical panels around one full-height slit', () => {
    render(
      <AvSlideView
        contentText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        geometryOverlay="sliced_square"
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="live"
        compact
      />,
    )

    const overlay = screen.getByTestId('av-geometry-overlay-sliced_square')
    const panels = overlay.querySelectorAll('.av-geometry-overlay__sliced-square-panel')
    expect(panels).toHaveLength(2)
    expect(overlay.querySelector('.av-geometry-overlay__shape')).not.toBeInTheDocument()
    expect(overlay.querySelector('.av-geometry-overlay__cross-vertical')).not.toBeInTheDocument()
    expect(overlay.querySelector('.av-geometry-overlay__cross-horizontal')).not.toBeInTheDocument()
  })

  it('renders four equal-width slices in a rectangle with three vertical slits', () => {
    render(
      <AvSlideView
        contentText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        geometryOverlay="sliced_rectangle"
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="live"
        compact
      />,
    )

    const overlay = screen.getByTestId('av-geometry-overlay-sliced_rectangle')
    const panels = overlay.querySelectorAll('.av-geometry-overlay__sliced-rectangle-panel')
    expect(panels).toHaveLength(4)
    expect(overlay.querySelector('.av-geometry-overlay__shape')).not.toBeInTheDocument()
  })

  it('scales the background-matched rectangle to 70 percent and centers it', () => {
    render(
      <AvSlideView
        contentText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        geometryOverlay="rectangle"
        geometryOverlayOpacity={70}
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="live"
        compact
      />,
    )

    const overlay = screen.getByTestId('av-geometry-overlay-rectangle')
    const shape = overlay.querySelector<HTMLElement>('.av-geometry-overlay__shape')!
    expect(overlay.style.getPropertyValue('--av-geometry-overlay-opacity')).toBe('0.7')
    expect(shape.style.width).toBe('70%')
    expect(shape.style.height).toBe('70%')
    expect(shape.style.top).toBe('15%')
    expect(shape.style.left).toBe('15%')
    expect(shape.style.aspectRatio).toBe('')
  })

  it('omits the overlay when the background is hidden', () => {
    render(
      <AvSlideView
        contentText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        geometryOverlay="cross"
        transition={DEFAULT_AV_PREFERENCES.transition}
        screenState="live"
        compact
        showBackground={false}
      />,
    )
    expect(screen.queryByTestId('av-geometry-overlay-cross')).not.toBeInTheDocument()
  })
})
