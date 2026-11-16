import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useEscapeKey } from '@/hooks/useEscapeKey'

describe('useEscapeKey', () => {
  it('calls the callback and prevents the default for an unhandled Escape key', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(true, onEscape))

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    act(() => window.dispatchEvent(event))

    expect(onEscape).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not handle Escape when disabled or already handled', () => {
    const onEscape = vi.fn()
    const { rerender } = renderHook(({ enabled }) => useEscapeKey(enabled, onEscape), {
      initialProps: { enabled: false },
    })

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onEscape).not.toHaveBeenCalled()

    rerender({ enabled: true })
    const handledEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    })
    handledEvent.preventDefault()
    act(() => window.dispatchEvent(handledEvent))

    expect(onEscape).not.toHaveBeenCalled()
  })
})
