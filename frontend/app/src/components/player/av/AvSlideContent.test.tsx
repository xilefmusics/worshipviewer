import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AvSlideContent } from '@/components/player/av/AvSlideContent'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'

describe('AvSlideContent', () => {
  it('applies slide alignment to Markdown while preserving its casing', () => {
    const { container } = render(
      <AvSlideContent
        markdown={'# Mixed Case\n\n| Name | Value |\n| :--- | ---: |\n| One | 2 |'}
        contentLayer={{ ...DEFAULT_AV_PREFERENCES.contentLayer, verticalAlign: 'geometry_center', horizontalAlign: 'right', textAlign: 'right', textTransform: 'uppercase' }}
        adaptiveWidth
      />,
    )

    const slide = container.querySelector('.av-slide-content')
    const markdown = container.querySelector('.markdown-slide')
    expect(slide).toHaveClass('av-slide-content--valign-geometry_center', 'av-slide-content--halign-right')
    expect(markdown).toHaveClass('av-slide-content__line--align-right')
    expect(markdown).not.toHaveClass('av-slide-content__line--transform-uppercase')
    expect(container.querySelector('.av-slide-content__inner')).toHaveClass('av-slide-content__inner--adaptive')
    expect(screen.getByRole('heading', { name: 'Mixed Case' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Value' })).toHaveStyle({ textAlign: 'right' })
  })

  it('renders primary and secondary rows with secondary styling', () => {
    const { container } = render(
      <AvSlideContent
        lines={[
          { primary: 'Hello', secondary: 'Hallo' },
          { primary: 'World' },
        ]}
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
      />,
    )

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hallo')).toBeInTheDocument()
    expect(screen.getByText('World')).toBeInTheDocument()
    expect(screen.queryByText('Welt')).not.toBeInTheDocument()
    expect(container.querySelector('.av-slide-content__line--secondary')).toBeTruthy()
    expect(container.querySelectorAll('.av-slide-content__line-group')).toHaveLength(2)
  })

  it('renders plain text lines when structured lines are not provided', () => {
    render(
      <AvSlideContent
        text={'Line one\nLine two'}
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
      />,
    )

    expect(screen.getByText('Line one')).toBeInTheDocument()
    expect(screen.getByText('Line two')).toBeInTheDocument()
  })

  it('uses adaptive width only for non-compact content when enabled', () => {
    const { container, unmount } = render(
      <AvSlideContent
        text="A longer lyric line"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        adaptiveWidth
      />,
    )

    expect(container.querySelector('.av-slide-content__inner')).toHaveClass(
      'av-slide-content__inner--adaptive',
    )
    unmount()

    const compact = render(
      <AvSlideContent
        text="A longer lyric line"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        compact
        adaptiveWidth
      />,
    )

    expect(compact.container.querySelector('.av-slide-content__inner')).not.toHaveClass(
      'av-slide-content__inner--adaptive',
    )
  })

  it('shows only the first structured line group in compact mode', () => {
    render(
      <AvSlideContent
        lines={[
          { primary: 'Hello', secondary: 'Hallo' },
          { primary: 'World', secondary: 'Welt' },
        ]}
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        compact
      />,
    )

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hallo')).toBeInTheDocument()
    expect(screen.queryByText('World')).not.toBeInTheDocument()
    expect(screen.queryByText('Welt')).not.toBeInTheDocument()
  })

  it('renders independent grayscale colors with contrasting shadows', () => {
    render(
      <AvSlideContent
        lines={[{ primary: 'Dark primary', secondary: 'Light translation' }]}
        contentLayer={{
          ...DEFAULT_AV_PREFERENCES.contentLayer,
          primaryTextLightness: 25,
          secondaryTextLightness: 75,
          textShadow: 'medium',
        }}
      />,
    )

    const primary = screen.getByText('Dark primary')
    const secondary = screen.getByText('Light translation')

    expect(primary.style.getPropertyValue('--av-text-lightness')).toBe('25%')
    expect(primary).toHaveClass('av-slide-content__line--shadow-white')
    expect(secondary.style.getPropertyValue('--av-text-lightness')).toBe('75%')
    expect(secondary).toHaveClass('av-slide-content__line--shadow-black')
  })

  it('falls back to default colors for legacy synchronized content layers', () => {
    const legacyContentLayer = {
      ...DEFAULT_AV_PREFERENCES.contentLayer,
    } as Partial<typeof DEFAULT_AV_PREFERENCES.contentLayer>
    delete legacyContentLayer.primaryTextLightness
    delete legacyContentLayer.secondaryTextLightness

    render(
      <AvSlideContent
        lines={[{ primary: 'Legacy primary', secondary: 'Legacy translation' }]}
        contentLayer={legacyContentLayer as typeof DEFAULT_AV_PREFERENCES.contentLayer}
      />,
    )

    expect(
      screen.getByText('Legacy primary').style.getPropertyValue('--av-text-lightness'),
    ).toBe('100%')
    expect(
      screen.getByText('Legacy translation').style.getPropertyValue('--av-text-lightness'),
    ).toBe('65%')
  })
})
