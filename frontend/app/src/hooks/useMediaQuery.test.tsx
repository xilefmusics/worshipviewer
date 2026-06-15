import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useIsPhoneWidth, useMediaQuery } from '@/hooks/useMediaQuery'

describe('useMediaQuery viewport reflow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('updates matches when media query changes (rotation / resize)', () => {
    let listener: (() => void) | null = null
    const mq = {
      matches: false,
      media: '(min-width: 768px)',
      addEventListener: (_: string, fn: () => void) => {
        listener = fn
      },
      removeEventListener: vi.fn(),
    }

    vi.stubGlobal('matchMedia', () => mq)

    const { result } = renderHook(() => useIsPhoneWidth())
    expect(result.current).toBe(true)

    mq.matches = true
    act(() => {
      listener?.()
    })
    expect(result.current).toBe(false)
  })

  it('useMediaQuery reflects custom query match state', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(orientation: landscape)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const { result } = renderHook(() => useMediaQuery('(orientation: landscape)'))
    expect(result.current).toBe(true)
  })

  it('falls back to Safari-style addListener and removeListener', () => {
    let listener: (() => void) | null = null
    const mq = {
      matches: false,
      media: '(min-width: 768px)',
      addListener: vi.fn((fn: () => void) => {
        listener = fn
      }),
      removeListener: vi.fn(),
    }

    vi.stubGlobal('matchMedia', () => mq)

    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
    expect(mq.addListener).toHaveBeenCalled()

    mq.matches = true
    act(() => {
      listener?.()
    })
    expect(result.current).toBe(true)

    unmount()
    expect(mq.removeListener).toHaveBeenCalled()
  })
})
