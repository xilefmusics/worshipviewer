import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminUsersView } from '@/components/admin/AdminUsersView'
import { renderWithProviders } from '@/test/renderWithProviders'

const mocks = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  fetchImpersonationStatus: vi.fn(),
  startImpersonation: vi.fn(),
  clearAllLocalData: vi.fn(),
  q: '',
  setQInput: vi.fn(),
}))

vi.mock('@/api/admin-users', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/admin-users')>()
  return { ...original, fetchAdminUsersPage: mocks.fetchPage }
})
vi.mock('@/api/impersonation', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/impersonation')>()
  return {
    ...original,
    fetchImpersonationStatus: mocks.fetchImpersonationStatus,
    startImpersonation: mocks.startImpersonation,
  }
})
vi.mock('@/lib/clear-local', () => ({ clearAllLocalData: mocks.clearAllLocalData }))
vi.mock('@/hooks/useHubSearch', () => ({
  useHubSearch: () => ({ debouncedQ: mocks.q, setQInput: mocks.setQInput }),
}))

const admin = {
  id: 'user:admin',
  email: 'admin@example.com',
  role: 'admin' as const,
  created_at: '2026-08-28T10:00:00Z',
}

beforeEach(() => {
  mocks.q = ''
  mocks.setQInput.mockReset()
  mocks.fetchPage.mockReset().mockResolvedValue({ items: [admin], total: 51 })
  mocks.fetchImpersonationStatus.mockReset().mockResolvedValue({ enabled: true, active: false })
  mocks.startImpersonation.mockReset().mockResolvedValue({ enabled: true, active: true })
  mocks.clearAllLocalData.mockReset().mockResolvedValue(undefined)
})

describe('AdminUsersView', () => {
  it('renders user fields and moves between server pages', async () => {
    const user = userEvent.setup()
    const view = renderWithProviders(<AdminUsersView />)

    expect(await screen.findAllByText('admin@example.com')).toHaveLength(2)
    expect(screen.getAllByText('user:admin')).toHaveLength(2)
    expect(screen.getAllByText('Admin')).toHaveLength(2)
    expect(screen.getByText('Showing 1–1 of 51 users')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(mocks.fetchPage).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ page: 1, q: '' }),
      ),
    )

    mocks.q = 'singer'
    view.rerender(<AdminUsersView />)
    await waitFor(() =>
      expect(mocks.fetchPage).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ page: 0, q: 'singer' }),
      ),
    )
  })

  it('shows search-specific empty state and clears the shared search', async () => {
    const user = userEvent.setup()
    mocks.q = 'missing'
    mocks.fetchPage.mockResolvedValue({ items: [], total: 0 })
    renderWithProviders(<AdminUsersView />)

    expect(await screen.findByText('No matching users')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(mocks.setQInput).toHaveBeenCalledWith('')
  })

  it('offers retry after a failed request', async () => {
    const user = userEvent.setup()
    mocks.fetchPage.mockRejectedValueOnce(new Error('Directory unavailable.'))
    renderWithProviders(<AdminUsersView />)

    expect(await screen.findByText('Directory unavailable.')).toBeInTheDocument()
    mocks.fetchPage.mockResolvedValue({ items: [admin], total: 1 })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByText('admin@example.com')).toHaveLength(2)
  })

  it('requires confirmation before starting impersonation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminUsersView />)

    const menus = await screen.findAllByRole('button', { name: 'Actions for admin@example.com' })
    await user.click(menus[0])
    await user.click(await screen.findByRole('menuitem', { name: 'Impersonate' }))
    expect(await screen.findByText('Impersonate this user?')).toBeInTheDocument()
    expect(screen.getAllByText(/admin@example.com/).length).toBeGreaterThanOrEqual(3)
    expect(mocks.startImpersonation).not.toHaveBeenCalled()
  })
})
