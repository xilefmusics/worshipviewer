import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import {
  fetchImpersonationStatus,
  startImpersonation,
  stopImpersonation,
} from '@/api/impersonation'

const mocks = vi.hoisted(() => ({ clearAllLocalData: vi.fn() }))

vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/clear-local', () => ({ clearAllLocalData: mocks.clearAllLocalData }))

const response = (status = 200) => new Response(null, { status })

beforeEach(() => vi.clearAllMocks())

describe('Impersonation API', () => {
  it('loads capability and subject metadata without credentials', async () => {
    const status = { enabled: true, active: true, subject: { id: 'user:1' } }
    vi.mocked(api.GET).mockResolvedValue({ data: status, response: response() } as never)

    await expect(fetchImpersonationStatus()).resolves.toEqual(status)
    expect(api.GET).toHaveBeenCalledWith('/auth/impersonation/current', {})
  })

  it('starts for the selected user and stops by clearing local identity state', async () => {
    const status = { enabled: true, active: true }
    vi.mocked(api.POST)
      .mockResolvedValueOnce({ data: status, response: response(201) } as never)
      .mockResolvedValueOnce({ response: response(204) } as never)

    await expect(startImpersonation('user:target')).resolves.toEqual(status)
    expect(api.POST).toHaveBeenNthCalledWith(1, '/api/v1/users/{user_id}/impersonation', {
      params: { path: { user_id: 'user:target' } },
    })

    const queryClient = { clear: vi.fn() } as never
    await expect(stopImpersonation(queryClient)).resolves.toBeUndefined()
    expect(mocks.clearAllLocalData).toHaveBeenCalledWith(queryClient)
  })
})
