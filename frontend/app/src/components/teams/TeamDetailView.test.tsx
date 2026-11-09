import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/client'
import { TeamDetailView } from '@/components/teams/TeamDetailView'

const { mockTeam } = vi.hoisted(() => ({
  mockTeam: {
    id: 'team:1',
    name: 'Worship Team',
    cover: '',
    members: [{ user: { id: 'user:1', email: 'admin@example.com' }, role: 'admin' }],
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/api/client', () => ({
  api: { PATCH: vi.fn(), DELETE: vi.fn() },
}))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ data: { id: 'user:1' } }),
}))
vi.mock('@/hooks/useTeamDetail', () => ({
  useTeamDetail: () => ({ data: mockTeam }),
  useTeamInvitationsList: () => ({
    data: { pages: [{ items: [] }] },
    error: null,
    isPending: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}))
vi.mock('@/hooks/useCoverImageSrc', () => ({
  useCoverImageSrc: () => ({ src: null, onImageError: vi.fn() }),
}))
vi.mock('@/hooks/use-online', () => ({ useOnline: () => true }))
vi.mock('@/context/HubScrollContainerContext', () => ({
  useHubScrollContainerRef: () => ({ current: null }),
}))

function renderTeamDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamDetailView teamId="team:1" />
    </QueryClientProvider>,
  )
}

describe('TeamDetailView team name editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.PATCH).mockResolvedValue({ response: { ok: true } } as never)
  })

  it('saves the team name from the separate settings field on blur', async () => {
    const user = userEvent.setup()
    renderTeamDetail()

    const nameInput = screen.getByRole('textbox', { name: 'teams.nameLabel' })
    await user.clear(nameInput)
    await user.type(nameInput, 'Sunday Worship')
    fireEvent.blur(nameInput)

    await waitFor(() => {
      expect(api.PATCH).toHaveBeenCalledWith('/api/v1/teams/{id}', {
        params: { path: { id: 'team:1' } },
        body: { name: 'Sunday Worship' },
      })
    })
  })
})
