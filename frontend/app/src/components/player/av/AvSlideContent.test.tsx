import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AvSlideContent } from '@/components/player/av/AvSlideContent'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'

describe('AvSlideContent', () => {
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
})
