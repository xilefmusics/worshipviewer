import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MediaListView } from '@/components/media/MediaListView'

const refetch = vi.fn()
const setQInput = vi.fn()
const navigate = vi.hoisted(() => vi.fn())
let queryResult: Record<string, unknown>

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: () => queryResult,
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      key === 'media.row.openAria' && options
        ? `${options.title} ${options.kind}`
        : key,
  }),
}))
vi.mock('@/hooks/useHubSearch', () => ({ useHubSearch: () => ({ debouncedQ: '', selectedTeamId: null, setQInput }) }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ data: { id: 'user:guest' } }) }))
vi.mock('@/hooks/useTeamDetail', () => ({ useTeamDetail: () => ({ data: { id: 'team:1', name: 'Team', members: [{ user: { id: 'user:guest' }, role: 'guest' }] } }) }))
vi.mock('@/hooks/useWritableTeams', () => ({ useWritableTeams: () => ({ teams: [], user: { id: 'user:guest' } }) }))

beforeEach(() => {
  refetch.mockReset()
  navigate.mockReset()
  queryResult = { data: { pages: [{ items: [], total: 0 }] }, isPending: false, isError: false, isRefetching: false, refetch, hasNextPage: false }
})

describe('MediaListView', () => {
  it('renders content-driven and unknown-safe rows accessibly without read-only actions', () => {
    queryResult.data = { pages: [{ total: 4, items: [
      { id: '1', owner: 'team:1', title: 'YouTube', content: { type: 'youtube', video_id: 'abcdefghijk', canonical_url: 'https://www.youtube.com/watch?v=abcdefghijk' } },
      { id: '2', owner: 'team:1', title: 'Video', content: { type: 'video', blob_id: 'b1', duration_ms: 1, width: 2, height: 3 } },
      { id: '3', owner: 'team:1', title: 'Deck', content: { type: 'slide_deck', pages: [{ blob_id: 'b2' }] } },
      { id: '4', owner: 'team:1', title: 'Future', content: { type: 'future' } },
    ] }] }
    render(<MediaListView />)
    expect(screen.getByRole('button', { name: /YouTube.*media.kinds.youtube/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Video.*media.kinds.video/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deck.*media.kinds.slide_deck/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Future.*media.kinds.unknown/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
  })

  it('renders empty and error/retry states', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MediaListView />)
    expect(screen.getByText('media.list.empty')).toBeInTheDocument()
    queryResult = { ...queryResult, isError: true }
    rerender(<MediaListView />)
    expect(screen.getByText('media.list.error')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'hub.error.retry' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('offers an in-library backgrounds filter', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MediaListView />)
    const allTab = screen.getByRole('tab', { name: 'media.list.allItems' })
    const backgroundsTab = screen.getByRole('tab', { name: 'media.list.backgroundItems' })
    expect(allTab).toHaveAttribute('aria-selected', 'true')
    expect(backgroundsTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'media-library-tab-all')

    await user.click(backgroundsTab)
    expect(navigate).toHaveBeenCalledWith({ to: '/media', search: { is_background: 'true' } })
    rerender(<MediaListView backgroundOnly />)
    expect(backgroundsTab).toHaveAttribute('aria-selected', 'true')
    expect(allTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'media-library-tab-backgrounds',
    )

    await user.click(allTab)
    expect(navigate).toHaveBeenLastCalledWith({ to: '/media', search: { is_background: undefined } })
  })
})
