import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AvSlidesPanel } from '@/components/player/av/AvSlidesPanel'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/browser-apis', () => ({ observeElementResize: () => () => {} }))
vi.mock('@/components/player/av/AvBackgroundSelector', () => ({ AvBackgroundSelector: () => null }))
vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: (props: Record<string, unknown>) => (
    <div data-testid={props.markdown !== undefined ? 'markdown-preview' : 'lyric-preview'}
      data-compact={String(props.compact)}
      data-preview={String(props.preview)}
      data-overlay={props.geometryOverlay as string | undefined}
      data-overlay-size={props.geometryOverlaySize as number | undefined}
      data-background={String(props.showBackground)}
      data-class={props.className as string | undefined}
    />
  ),
}))

describe('AvSlidesPanel', () => {
  it('uses a scaled projection-style preview with the geometry overlay for Markdown', () => {
    const noop = () => {}
    render(
      <AvSlidesPanel
        entries={[
          { slideIndex: 0, label: 'Markdown', text: '# Heading', markdown: '# Heading', isSubSlide: false, hasText: true },
          { slideIndex: 1, label: 'Lyrics', text: 'Lyrics', isSubSlide: false, hasText: true },
        ]}
        currentSlideIndex={null}
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        backgroundPreviewText=""
        geometryOverlay="cross"
        geometryOverlayOpacity={50}
        geometryOverlayColor={60}
        geometryOverlaySize={70}
        geometryOverlayThickness={80}
        geometryOverlayRotatedBackground={false}
        transition={DEFAULT_AV_PREFERENCES.transition}
        onSelectSlide={noop}
        onSelectBackgroundPreset={noop}
        onSelectBackgroundAsset={noop}
        onSelectGeometryOverlay={noop}
        onSelectGeometryOverlayOpacity={noop}
        onSelectGeometryOverlayColor={noop}
        onSelectGeometryOverlaySize={noop}
        onSelectGeometryOverlayThickness={noop}
        onSelectGeometryOverlayRotatedBackground={noop}
      />,
    )

    expect(screen.getByTestId('markdown-preview')).toHaveAttribute('data-compact', 'false')
    expect(screen.getByTestId('markdown-preview')).toHaveAttribute('data-preview', 'true')
    expect(screen.getByTestId('markdown-preview')).toHaveAttribute('data-overlay', 'cross')
    expect(screen.getByTestId('markdown-preview')).toHaveAttribute('data-overlay-size', '70')
    expect(screen.getByTestId('markdown-preview')).toHaveAttribute('data-background', 'true')
    expect(screen.getByTestId('markdown-preview')).not.toHaveAttribute('data-class', 'av-slide-view--compact')
    expect(screen.getByTestId('lyric-preview')).toHaveAttribute('data-compact', 'true')
  })
})
