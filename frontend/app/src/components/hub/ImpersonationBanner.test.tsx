import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ImpersonationBanner } from '@/components/hub/ImpersonationBanner'
import { renderWithProviders } from '@/test/renderWithProviders'

const mocks = vi.hoisted(() => ({
  IMPERSONATION_QUERY_KEY: ['impersonation', 'current'],
  fetchImpersonationStatus: vi.fn(),
  stopImpersonation: vi.fn(),
}))

vi.mock('@/api/impersonation', () => mocks)

beforeEach(() => {
  mocks.fetchImpersonationStatus.mockReset()
  mocks.stopImpersonation.mockReset().mockResolvedValue(undefined)
})

describe('ImpersonationBanner', () => {
  it('renders the target and invokes the stop action', async () => {
    const user = userEvent.setup()
    mocks.fetchImpersonationStatus.mockResolvedValue({
      enabled: true,
      active: true,
      subject: { email: 'target@example.com' },
    })
    renderWithProviders(<ImpersonationBanner />)

    expect(await screen.findByText('You are impersonating target@example.com.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop impersonating' }))
    await waitFor(() => expect(mocks.stopImpersonation).toHaveBeenCalled())
  })

  it('stays hidden when the capability is inactive', async () => {
    mocks.fetchImpersonationStatus.mockResolvedValue({ enabled: false, active: false })
    renderWithProviders(<ImpersonationBanner />)
    await waitFor(() => expect(mocks.fetchImpersonationStatus).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
