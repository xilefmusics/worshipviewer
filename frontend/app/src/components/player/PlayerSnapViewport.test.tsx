import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PlayerSnapViewport, type PlayerSnapHandle } from './PlayerSnapViewport'

function setup(options: { index?: number; disabled?: boolean; reduceMotion?: boolean; indices?: number[] } = {}) {
  const ref = createRef<PlayerSnapHandle>()
  const onNavigate = vi.fn()
  const onScrollGesture = vi.fn()
  const props = {
    ref,
    pages: (options.indices ?? Array.from({ length: 100 }, (_, index) => index)).map((index) => ({ index, pageOffset: 0 })),
    nav: { index: options.index ?? 0, pageOffset: 0 },
    disabled: options.disabled ?? false,
    reduceMotion: options.reduceMotion ?? false,
    onNavigate,
    onScrollGesture,
    renderPage: ({ index }: { index: number }) => <div data-testid={`song-${index}`}>Song {index}</div>,
  }
  const result = render(<PlayerSnapViewport {...props} />)
  const viewport = screen.getByTestId('player-snap-viewport')
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 100 })
  const scrollTo = vi.fn(({ left }: ScrollToOptions) => { viewport.scrollLeft = left ?? 0 })
  Object.defineProperty(viewport, 'scrollTo', { value: scrollTo })
  return { ...result, props, ref, viewport, onNavigate, onScrollGesture, scrollTo }
}

function scroll(viewport: HTMLElement, left: number) {
  viewport.scrollLeft = left
  fireEvent.scroll(viewport)
}

function end(viewport: HTMLElement) {
  fireEvent(viewport, new Event('scrollend'))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PlayerSnapViewport', () => {
  it('keeps all slots but only renders nearby content for a large collection', () => {
    const { viewport } = setup({ index: 50 })
    expect(viewport.children).toHaveLength(100)
    expect(screen.getByTestId('song-49')).toBeInTheDocument()
    expect(screen.getByTestId('song-50')).toBeInTheDocument()
    expect(screen.getByTestId('song-51')).toBeInTheDocument()
    expect(screen.queryByTestId('song-0')).not.toBeInTheDocument()
    expect(screen.getByTestId('song-49').parentElement).toHaveAttribute('inert')
    expect(screen.getByTestId('song-50').parentElement).not.toHaveAttribute('inert')
  })

  it('commits only the settled song after crossing several slots', () => {
    const { viewport, onNavigate } = setup()
    scroll(viewport, 100)
    scroll(viewport, 280)
    expect(onNavigate).not.toHaveBeenCalled()
    end(viewport)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ index: 3, pageOffset: 0 })
  })

  it('uses the idle fallback without committing while a finger is held down', () => {
    vi.useFakeTimers()
    const { viewport, onNavigate } = setup()
    fireEvent.touchStart(viewport)
    scroll(viewport, 200)
    act(() => vi.advanceTimersByTime(200))
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.touchEnd(viewport)
    act(() => vi.advanceTimersByTime(160))
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ index: 2, pageOffset: 0 })
  })

  it('clamps both ends without wrapping', () => {
    const { viewport, onNavigate } = setup({ index: 1, indices: [0, 1, 2] })
    scroll(viewport, -80)
    end(viewport)
    expect(onNavigate).toHaveBeenLastCalledWith({ index: 0, pageOffset: 0 })
    scroll(viewport, 400)
    end(viewport)
    expect(onNavigate).toHaveBeenLastCalledWith({ index: 2, pageOffset: 0 })
  })

  it('maps book-spread slots to their source indices', () => {
    const { viewport, onNavigate } = setup({ indices: [0, 1, 3, 5] })
    scroll(viewport, 200)
    end(viewport)
    expect(onNavigate).toHaveBeenCalledWith({ index: 3, pageOffset: 0 })
  })

  it('uses smooth native scrolling for next/previous and settles before committing', () => {
    const { viewport, ref, onNavigate, scrollTo } = setup()
    act(() => ref.current?.navigate({ index: 1, pageOffset: 0 }, true))
    expect(scrollTo).toHaveBeenCalledWith({ left: 100, behavior: 'smooth' })
    expect(onNavigate).not.toHaveBeenCalled()
    end(viewport)
    expect(onNavigate).toHaveBeenCalledWith({ index: 1, pageOffset: 0 })
  })

  it('jumps directly from an open TOC and honors reduced motion', () => {
    const { ref, onNavigate, scrollTo } = setup({ disabled: true, reduceMotion: true })
    act(() => ref.current?.navigate({ index: 80, pageOffset: 0 }, true))
    expect(scrollTo).toHaveBeenCalledWith({ left: 8000, behavior: 'instant' })
    expect(onNavigate).toHaveBeenCalledWith({ index: 80, pageOffset: 0 })
  })

  it('realigns external navigation and prevents follower swipes', () => {
    const { props, rerender, viewport, onNavigate } = setup({ disabled: true })
    rerender(<PlayerSnapViewport {...props} nav={{ index: 30, pageOffset: 0 }} />)
    expect(viewport.scrollLeft).toBe(3000)
    scroll(viewport, 3200)
    end(viewport)
    expect(viewport.scrollLeft).toBe(3000)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('preserves selection when the viewport resizes', () => {
    let resize = () => {}
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect() {}
    })
    const { viewport } = setup({ index: 5 })
    act(() => resize())
    expect(viewport.scrollLeft).toBe(500)
    Object.defineProperty(viewport, 'clientWidth', { value: 200 })
    act(() => resize())
    expect(viewport.scrollLeft).toBe(1000)
  })

  it('ignores vertical scroll events from song content', () => {
    const { onNavigate, onScrollGesture } = setup()
    fireEvent.scroll(screen.getByTestId('song-0'))
    expect(onNavigate).not.toHaveBeenCalled()
    expect(onScrollGesture).not.toHaveBeenCalled()
  })
})
