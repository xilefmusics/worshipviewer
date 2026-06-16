import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const patchMock = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    PATCH: (...args: unknown[]) => patchMock(...args),
  },
}))

import { useSetlistAutosave } from '@/hooks/useSetlistAutosave'

function createWrapperWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

function createWrapper() {
  return createWrapperWithClient().wrapper
}

const baseline = {
  title: 'Setlist',
  songs: [] as {
    id: string
    nr?: string
    key: string | null
    tempo: number | null
    language?: string | null
  }[],
  owner: 'team-1',
}

describe('useSetlistAutosave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('debounces title PATCH on notifyDraftEdited', async () => {
    patchMock.mockResolvedValue({
      response: { ok: true, status: 200 },
      data: { id: 'sl-1', title: 'Renamed', songs: [], owner: 'team-1' },
      error: undefined,
    })

    const { result, unmount } = renderHook(
      () =>
        useSetlistAutosave({
          setlistId: 'sl-1',
          baseline,
          draftTitle: 'Renamed',
          draftSongs: [],
          draftOwner: 'team-1',
          canAutosavePatch: true,
        }),
      { wrapper: createWrapper() },
    )

    act(() => {
      result.current.notifyDraftEdited()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })

    expect(patchMock).toHaveBeenCalledOnce()
    expect(result.current.saveIcon).toBe('idle')
    unmount()
  })

  it('invalidates the setlist player cache after a slot tempo PATCH', async () => {
    patchMock.mockResolvedValue({
      response: { ok: true, status: 200 },
      data: {
        id: 'sl-1',
        title: 'Setlist',
        songs: [{ id: 'song-1', key: null, tempo: 88, language: null }],
        owner: 'team-1',
      },
      error: undefined,
    })
    const { queryClient, wrapper } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result, unmount } = renderHook(
      () =>
        useSetlistAutosave({
          setlistId: 'sl-1',
          baseline: {
            ...baseline,
            songs: [{ id: 'song-1', key: null, tempo: null, language: null }],
          },
          draftTitle: 'Setlist',
          draftSongs: [{ id: 'song-1', key: null, tempo: 88, language: null }],
          draftOwner: 'team-1',
          canAutosavePatch: true,
        }),
      { wrapper },
    )

    act(() => {
      result.current.notifyDraftEdited()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })

    expect(patchMock).toHaveBeenCalledWith('/api/v1/setlists/{id}', {
      params: { path: { id: 'sl-1' } },
      body: { songs: [{ id: 'song-1', key: null, tempo: 88, language: null }] },
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['player', 'setlist', 'sl-1'] })
    unmount()
  })

  it('sets error state when PATCH fails', async () => {
    patchMock.mockResolvedValue({
      response: { ok: false, status: 500, clone: () => ({}) },
      data: undefined,
      error: { title: 'Cannot save setlist' },
    })

    const { result, unmount } = renderHook(
      () =>
        useSetlistAutosave({
          setlistId: 'sl-1',
          baseline,
          draftTitle: 'Fail',
          draftSongs: [],
          draftOwner: 'team-1',
          canAutosavePatch: true,
        }),
      { wrapper: createWrapper() },
    )

    act(() => {
      result.current.notifyDraftEdited()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })

    expect(result.current.saveIcon).toBe('error')
    unmount()
  })
})
