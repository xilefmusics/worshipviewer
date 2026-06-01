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

import { useCollectionAutosave } from '@/hooks/useCollectionAutosave'

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const baseline = {
  title: 'Collection',
  songs: [] as { id: string; nr: string; key: string | null; tempo: number | null }[],
  cover: 'mysongs',
  owner: 'team-1',
}

describe('useCollectionAutosave', () => {
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
      data: { id: 'coll-1', title: 'Renamed', songs: [], cover: 'mysongs', owner: 'team-1' },
      error: undefined,
    })

    const { result, unmount } = renderHook(
      () =>
        useCollectionAutosave({
          collectionId: 'coll-1',
          baseline,
          draftTitle: 'Renamed',
          draftSongs: [],
          draftCover: 'mysongs',
          draftOwner: 'team-1',
          canAutosavePatch: true,
        }),
      { wrapper: createWrapper() },
    )

    act(() => {
      result.current.notifyDraftEdited()
    })
    expect(result.current.saveIcon).toBe('pending')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })

    expect(patchMock).toHaveBeenCalledOnce()
    expect(result.current.saveIcon).toBe('idle')
    unmount()
  })

  it('surfaces save failure', async () => {
    patchMock.mockResolvedValue({
      response: { ok: false, status: 500, clone: () => ({}) },
      data: undefined,
      error: { title: 'Save failed' },
    })

    const { result, unmount } = renderHook(
      () =>
        useCollectionAutosave({
          collectionId: 'coll-1',
          baseline,
          draftTitle: 'Broken',
          draftSongs: [],
          draftCover: 'mysongs',
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
    expect(result.current.saveFailure?.message).toBe('Save failed')
    unmount()
  })
})
