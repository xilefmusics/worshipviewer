import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { components } from '@/api/schema'
import { RoomQueuePanel } from '@/components/room/RoomQueuePanel'
import {
  addRoomQueueItem,
  fetchRoomQueueLikes,
  promoteRoomQueueItem,
  type RoomQueueItem,
} from '@/lib/room'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${Object.values(options).join(' ')}` : key,
  }),
}))

vi.mock('@/hooks/use-online', () => ({
  useOnline: () => true,
}))

vi.mock('@/api/list-fetch', () => ({
  fetchSongsPage: vi.fn(),
}))

vi.mock('@/lib/room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/room')>()
  return {
    ...actual,
    addRoomQueueItem: vi.fn().mockResolvedValue(undefined),
    fetchRoomQueueLikes: vi.fn().mockResolvedValue({ song_ids: [] }),
    promoteRoomQueueItem: vi.fn().mockResolvedValue(undefined),
  }
})

function song(
  id: string,
  title: string,
  liked = false,
  metadata: { languages?: string[]; tags?: Record<string, string> } = {},
): components['schemas']['Song'] {
  return {
    id,
    owner: 'team-1',
    not_a_song: false,
    blobs: [],
    data: { titles: [title], sections: [], ...metadata },
    user_specific_addons: { liked },
  } as components['schemas']['Song']
}

const queue = [
  { id: 'q1', song_id: 's1', title: 'Anchor', added_by: 'Alex', upvotes: 0, played: false, song: { song: song('s1', 'Anchor'), language: null, flow: null } },
  { id: 'q2', song_id: 's2', title: 'Grace', added_by: 'Sam', upvotes: 2, played: false, song: { song: song('s2', 'Grace'), language: null, flow: null } },
] as RoomQueueItem[]

function renderPanel(overrides: Partial<ComponentProps<typeof RoomQueuePanel>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RoomQueuePanel
        roomId="room-1"
        queue={queue}
        revision={4}
        votedQueueIds={['q2']}
        canAdd={false}
        canManage={false}
        onVote={vi.fn()}
        open={false}
        {...overrides}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RoomQueuePanel', () => {
  it('renders queue rows like the player TOC with position and vote count', () => {
    renderPanel()

    expect(screen.getByRole('option', { name: 'rooms.queue.activate Anchor 1' })).toHaveTextContent('1. Anchor')
    expect(screen.getByRole('option', { name: 'rooms.queue.activate Grace 2' })).toHaveTextContent('2. Grace')
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'rooms.queue.removeUpvote Grace' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('toggles a participant vote without requiring queue-management access', () => {
    const onVote = vi.fn()
    renderPanel({ onVote })

    fireEvent.click(screen.getByRole('button', { name: 'rooms.queue.upvote Anchor' }))

    expect(onVote).toHaveBeenCalledWith('q1', true)
  })

  it('does not offer a personal Liked mode to anonymous guests', () => {
    renderPanel({ canAdd: false })

    expect(screen.queryByRole('radio', { name: 'player.toc.sortLiked' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'player.toc.sortAlphabetical' })).toBeInTheDocument()
  })

  it('separates played songs in order mode and still allows them to be upvoted', () => {
    const onVote = vi.fn()
    const mixedQueue = [
      { ...queue[0], upvotes: 1, played: false },
      { ...queue[1], upvotes: 0, played: true },
    ]
    renderPanel({ queue: mixedQueue, votedQueueIds: [], onVote })

    const separator = screen.getByRole('separator', { name: 'rooms.queue.alreadyPlayed' })
    expect(separator.nextElementSibling).toHaveTextContent('Grace')

    fireEvent.click(screen.getByRole('button', { name: 'rooms.queue.upvote Grace' }))
    expect(onVote).toHaveBeenCalledWith('q2', true)
  })

  it('removes the separator when filtering leaves only one playback section', () => {
    const filteredQueue = [
      { ...queue[0], song: { ...queue[0].song, song: song('s1', 'Anchor', false, { languages: ['en'] }) }, played: false },
      { ...queue[1], song: { ...queue[1].song, song: song('s2', 'Grace', false, { languages: ['de'] }) }, played: true },
    ]
    renderPanel({ queue: filteredQueue, votedQueueIds: [] })

    expect(screen.getByRole('separator', { name: 'rooms.queue.alreadyPlayed' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'de' }))

    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'rooms.queue.activate Grace 2' })).toBeInTheDocument()
  })

  it('lets the host activate any queue row', async () => {
    renderPanel({ canManage: true })

    fireEvent.click(screen.getByRole('option', { name: 'rooms.queue.activate Anchor 1' }))
    fireEvent.click(screen.getByRole('option', { name: 'rooms.queue.activate Grace 2' }))
    await waitFor(() => expect(promoteRoomQueueItem).toHaveBeenCalledTimes(2))

    expect(promoteRoomQueueItem).toHaveBeenNthCalledWith(1, 'room-1', 'q1', 4)
    expect(promoteRoomQueueItem).toHaveBeenNthCalledWith(2, 'room-1', 'q2', 4)
    expect(screen.queryByRole('button', { name: 'rooms.queue.remove Grace' })).not.toBeInTheDocument()
    expect(addRoomQueueItem).not.toHaveBeenCalled()
  })

  it('only shows the bottom library search for open rooms', () => {
    const { rerender } = renderPanel({ canAdd: true, open: true })
    expect(screen.getByRole('textbox', { name: 'rooms.queue.searchAria' })).toBeInTheDocument()

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <RoomQueuePanel
          roomId="room-1"
          queue={queue}
          revision={4}
          votedQueueIds={[]}
          canAdd
          canManage={false}
          onVote={vi.fn()}
          open={false}
        />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('sorts the current queue alphabetically, including played songs', async () => {
    renderPanel({
      canAdd: true,
      queue: queue.map((item, index) => ({ ...item, played: index === 1 })),
    })

    await fireEvent.click(screen.getByRole('radio', { name: 'player.toc.sortAlphabetical' }))
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option').map((row) => row.textContent?.trim())).toEqual(['1. Anchor', '2. Grace'])
  })

  it('filters the current queue to songs liked by the current user', async () => {
    vi.mocked(fetchRoomQueueLikes).mockResolvedValue({ song_ids: ['s1'] })
    renderPanel({ canAdd: true })

    await fireEvent.click(screen.getByRole('radio', { name: 'player.toc.sortLiked' }))
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('option', { name: 'rooms.queue.activate Anchor 1' })).toHaveTextContent('Anchor'))
    expect(screen.queryByText('Grace')).not.toBeInTheDocument()
  })
})
