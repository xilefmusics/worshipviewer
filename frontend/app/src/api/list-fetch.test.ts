import type { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    GET: (...args: unknown[]) => getMock(...args),
  },
}))

import { fetchCollectionsPage, fetchSetlistsPage, fetchSongsPage } from '@/api/list-fetch'

const queryClient = {} as QueryClient

function okListResponse(data: unknown[] = []) {
  return {
    data,
    error: undefined,
    response: new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'x-total-count': String(data.length) },
    }),
  }
}

describe('hub list fetchers', () => {
  beforeEach(() => {
    getMock.mockReset()
    getMock.mockResolvedValue(okListResponse())
  })

  it('omits team when fetching all collections', async () => {
    await fetchCollectionsPage(queryClient, { page: 0, q: '' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/collections', {
      params: {
        query: {
          page: 0,
          page_size: 50,
          q: undefined,
          team: undefined,
        },
      },
      signal: undefined,
    })
  })

  it('passes team when fetching filtered collections', async () => {
    await fetchCollectionsPage(queryClient, { page: 1, q: 'advent', teamId: 'team-1' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/collections', {
      params: {
        query: {
          page: 1,
          page_size: 50,
          q: 'advent',
          team: 'team-1',
        },
      },
      signal: undefined,
    })
  })

  it('passes team when fetching filtered setlists', async () => {
    await fetchSetlistsPage(queryClient, { page: 0, q: '', teamId: 'team-2' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/setlists', {
      params: {
        query: {
          page: 0,
          page_size: 50,
          q: undefined,
          team: 'team-2',
        },
      },
      signal: undefined,
    })
  })

  it('omits team when fetching all setlists', async () => {
    await fetchSetlistsPage(queryClient, { page: 0, q: 'sunday' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/setlists', {
      params: {
        query: {
          page: 0,
          page_size: 50,
          q: 'sunday',
          team: undefined,
        },
      },
      signal: undefined,
    })
  })

  it('keeps song relevance sorting while passing search and team', async () => {
    await fetchSongsPage(queryClient, { page: 0, q: 'grace', teamId: 'team-3' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/songs', {
      params: {
        query: {
          page: 0,
          page_size: 50,
          q: 'grace',
          team: 'team-3',
          sort: 'relevance',
        },
      },
      signal: undefined,
    })
  })

  it('omits team when fetching all songs', async () => {
    await fetchSongsPage(queryClient, { page: 0, q: '' })

    expect(getMock).toHaveBeenCalledWith('/api/v1/songs', {
      params: {
        query: {
          page: 0,
          page_size: 50,
          q: undefined,
          team: undefined,
          sort: undefined,
        },
      },
      signal: undefined,
    })
  })
})
