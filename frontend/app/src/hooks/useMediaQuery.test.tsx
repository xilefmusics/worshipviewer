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
})
