import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomQueuePanel } from '@/components/room/RoomQueuePanel'
import {
  addRoomQueueItem,
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
    promoteRoomQueueItem: vi.fn().mockResolvedValue(undefined),
  }
})

const queue = [
  { id: 'q1', song_id: 's1', title: 'Anchor', added_by: 'Alex', upvotes: 0 },
  { id: 'q2', song_id: 's2', title: 'Grace', added_by: 'Sam', upvotes: 2 },
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
})
