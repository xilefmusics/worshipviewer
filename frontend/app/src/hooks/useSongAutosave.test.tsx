import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PatchSongData } from '@/lib/song-editor-state'

const patchMock = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    PATCH: (...args: unknown[]) => patchMock(...args),
  },
}))

import { useSongAutosave } from '@/hooks/useSongAutosave'

const songData = {
  titles: ['Hello'],
  tags: {},
} as PatchSongData

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useSongAutosave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks draft dirty without PATCH until flushNow', async () => {
    patchMock.mockResolvedValue({
      response: { ok: true, status: 200 },
      data: { id: 'song-1', data: { ...songData, titles: ['Updated'] } },
      error: undefined,
    })

    const draft = { ...songData, titles: ['Updated'] }
    const { result, unmount } = renderHook(
      () =>
        useSongAutosave({
          songId: 'song-1',
          baseline: songData,
          draft,
          canAutosavePatch: true,
        }),
      { wrapper: createWrapper() },
    )

    act(() => {
      result.current.markDraftDirty()
    })
    expect(result.current.saveIcon).toBe('pending')
    expect(patchMock).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.flushNow()
    })

    expect(patchMock).toHaveBeenCalledOnce()
    expect(result.current.saveIcon).toBe('idle')
    unmount()
  })

  it('sets error state when PATCH fails', async () => {
    patchMock.mockResolvedValue({
      response: { ok: false, status: 500, clone: () => ({}) },
      data: undefined,
      error: { title: 'Server error' },
    })

    const { result, rerender, unmount } = renderHook(
      ({ draft }: { draft: PatchSongData }) =>
        useSongAutosave({
          songId: 'song-1',
          baseline: songData,
          draft,
          canAutosavePatch: true,
        }),
      {
        wrapper: createWrapper(),
        initialProps: { draft: songData },
      },
    )

    rerender({ draft: { ...songData, titles: ['Fail'] } })

    await act(async () => {
      await result.current.flushNow()
    })

    expect(result.current.saveIcon).toBe('error')
    expect(result.current.saveFailure?.message).toBe('Server error')
    unmount()
  })

  it('records retry-after on 429', async () => {
    patchMock.mockResolvedValue({
      response: {
        ok: false,
        status: 429,
        clone: () => ({}),
        headers: new Headers({ 'retry-after': '5' }),
      },
      data: undefined,
      error: { title: 'Too many requests' },
    })

    const draft = { ...songData, titles: ['Rate'] }
    const { result, unmount } = renderHook(
      () =>
        useSongAutosave({
          songId: 'song-1',
          baseline: songData,
          draft,
          canAutosavePatch: true,
        }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.flushNow()
    })

    expect(result.current.saveFailure?.retryAfterUntil).not.toBeNull()
    unmount()
  })
})
