import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomThreePanelShell } from '@/components/room/RoomThreePanelShell'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('RoomThreePanelShell', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('snaps to the adjacent panel for horizontal wheel gestures', () => {
    render(
      <RoomThreePanelShell
        queue={<div>queue</div>}
        player={<div>player</div>}
        details={<div>details</div>}
      />,
    )

    const viewport = screen.getByRole('region', { name: 'rooms.panel.queue' }).parentElement
    expect(viewport).not.toBeNull()
    if (!viewport) return

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 100 })
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 300 })
    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, writable: true, value: 100 })
    const scrollTo = vi.fn()
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo })

    fireEvent.wheel(viewport, { deltaX: 40, deltaY: 0 })

    expect(scrollTo).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' })
  })

  it('waits for trackpad momentum to stop before accepting another panel', () => {
    vi.useFakeTimers()
    render(
      <RoomThreePanelShell
        queue={<div>queue</div>}
        player={<div>player</div>}
        details={<div>details</div>}
      />,
    )

    const viewport = screen.getByRole('region', { name: 'rooms.panel.queue' }).parentElement
    expect(viewport).not.toBeNull()
    if (!viewport) return

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 100 })
    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, writable: true, value: 100 })
    const scrollTo = vi.fn()
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo })

    fireEvent.wheel(viewport, { deltaX: 40, deltaY: 0 })
    vi.advanceTimersByTime(50)
    fireEvent.wheel(viewport, { deltaX: 40, deltaY: 0 })
    vi.advanceTimersByTime(50)
    fireEvent.wheel(viewport, { deltaX: 40, deltaY: 0 })

    expect(scrollTo).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)
    fireEvent.wheel(viewport, { deltaX: 40, deltaY: 0 })

    expect(scrollTo).toHaveBeenCalledTimes(2)
  })

  it('does not treat vertical wheel scrolling as panel navigation', () => {
    render(
      <RoomThreePanelShell
        queue={<div>queue</div>}
        player={<div>player</div>}
        details={<div>details</div>}
      />,
    )

    const viewport = screen.getByRole('region', { name: 'rooms.panel.queue' }).parentElement
    expect(viewport).not.toBeNull()
    if (!viewport) return

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 100 })
    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, writable: true, value: 100 })
    const scrollTo = vi.fn()
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo })

    fireEvent.wheel(viewport, { deltaX: 0, deltaY: 40 })

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('opens the participant panel for a right-edge swipe from the player', () => {
    render(
      <RoomThreePanelShell
        queue={<div>queue</div>}
        player={<div>player</div>}
        details={<div>participants</div>}
      />,
    )

    const viewport = screen.getByRole('region', { name: 'rooms.panel.queue' }).parentElement
    expect(viewport).not.toBeNull()
    if (!viewport) return

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 100 })
    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, writable: true, value: 100 })
    const scrollTo = vi.fn()
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo })
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.touchStart(viewport, { touches: [{ clientX: 100, clientY: 50 }] })
    fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 20, clientY: 50 }] })

    expect(scrollTo).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' })
  })

  it('opens the queue for a left-edge swipe from the player', () => {
    render(
      <RoomThreePanelShell
        queue={<div>queue</div>}
        player={<div>player</div>}
        details={<div>participants</div>}
      />,
    )

    const viewport = screen.getByRole('region', { name: 'rooms.panel.queue' }).parentElement
    expect(viewport).not.toBeNull()
    if (!viewport) return

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 100 })
    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, writable: true, value: 100 })
    const scrollTo = vi.fn()
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo })
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.touchStart(viewport, { touches: [{ clientX: 0, clientY: 50 }] })
    fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 80, clientY: 50 }] })

    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' })
  })
})
