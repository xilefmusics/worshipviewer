import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RoomCredentials, RoomSnapshot } from '@/lib/room'
import { RoomLivePage } from '@/components/room/RoomLivePage'

const useRoom = vi.fn()
const registerRoomMedia = vi.fn()
let slideViewProps: Record<string, unknown> | null = null

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/room')>()
  return { ...actual, useRoom: (...args: unknown[]) => useRoom(...args) }
})

vi.mock('@/lib/room-media', () => ({
  registerRoomMedia: (...args: unknown[]) => registerRoomMedia(...args),
}))

vi.mock('@/components/room/RoomSidebar', () => ({
  RoomSidebar: () => <aside data-testid="room-sidebar" />,
}))

vi.mock('@/components/room/RoomQueuePanel', () => ({
  RoomQueuePanel: () => <aside data-testid="room-queue" />,
}))

vi.mock('@/components/player/PlayerBook', () => ({
  PlayerBook: () => <div data-testid="player-book" />,
}))

vi.mock('@/components/player/av/PlayerAv', () => ({
  PlayerAv: () => <div data-testid="player-av" />,
}))

vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: (props: Record<string, unknown>) => {
    slideViewProps = props
    return <div data-testid="slide-view" />
  },
}))

const credentials: RoomCredentials = {
  room_id: 'room-1',
  participant_id: 'participant-1',
  mode: 'slide',
  resume_credential: 'resume',
  connection_ticket: 'ticket',
}

const projection = {
  content_text: 'Projected lyric',
  content_layer: { fontSize: 60 },
  background_layer: { preset: 2 },
  transition: { style: 'none', durationMs: 0 },
  screen_state: 'live' as const,
  item_title: 'Song',
  next_preview: null,
}

function snapshotWithProjection(
  nextProjection: RoomSnapshot['projection'],
): RoomSnapshot {
  return {
    id: 'room-1',
    name: 'Room',
    team_id: 'team-1',
    source_type: 'song',
    source_id: 'song-1',
    source_title: 'Song',
    host_email: 'host@example.com',
    participant_count: 1,
    av_occupied: true,
    created_at: new Date().toISOString(),
    content: { items: [{ type: 'blob', blob_id: 'blob-1' }], toc: [] },
    queue: [],
    voted_queue_ids: [],
    musical_state: { item_index: 0, language: null, transposition: null },
    projection: nextProjection,
    participants: [
      {
        id: 'participant-1',
        mode: 'slide',
        display_name: 'Projection',
        avatar_url: null,
        anonymous: false,
        connected: true,
        is_host: false,
        is_av_host: false,
      },
    ],
    revision: 1,
    host_lease_expires_at: new Date(Date.now() + 30_000).toISOString(),
  }
}

function mockRoom(snapshot: RoomSnapshot) {
  useRoom.mockReturnValue({
    snapshot,
    status: 'connected',
    sendMusicalState: vi.fn(),
    sendProjection: vi.fn(),
    sendGuestsAllowed: vi.fn(),
    sendQueueVote: vi.fn(),
    leave: vi.fn(),
  })
}

beforeEach(() => {
  slideViewProps = null
  useRoom.mockReset()
  registerRoomMedia.mockReset().mockReturnValue(vi.fn())
})

describe('RoomLivePage slide mode', () => {
  it('renders a clean black canvas before the first projection event', () => {
    mockRoom(snapshotWithProjection(null))

    render(<RoomLivePage credentials={credentials} />)

    expect(screen.getByTestId('room-slide-canvas')).toHaveClass('bg-black', 'h-full', 'w-full')
    expect(screen.queryByText('common.load')).not.toBeInTheDocument()
    expect(screen.getByTestId('room-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('room-queue')).toBeInTheDocument()
    expect(screen.queryByTestId('slide-view')).not.toBeInTheDocument()
  })

  it('renders projection content without the room sidebar', () => {
    mockRoom(snapshotWithProjection(projection))

    render(<RoomLivePage credentials={credentials} />)

    expect(screen.getByTestId('slide-view')).toBeInTheDocument()
    expect(screen.getByTestId('room-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('room-queue')).toBeInTheDocument()
    expect(slideViewProps).toMatchObject({
      contentText: 'Projected lyric',
      screenState: 'live',
    })
  })

  it('requests fullscreen when the canvas is double-clicked', () => {
    mockRoom(snapshotWithProjection(null))
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })
    render(<RoomLivePage credentials={credentials} />)

    fireEvent.doubleClick(screen.getByTestId('room-slide-canvas'))

    expect(requestFullscreen).toHaveBeenCalledOnce()
  })
})

describe('RoomLivePage empty room', () => {
  it('renders a purposeful Sheet empty state with host controls reachable', () => {
    const emptySnapshot = snapshotWithProjection(null)
    emptySnapshot.source_type = null
    emptySnapshot.source_id = null
    emptySnapshot.source_title = null
    emptySnapshot.content = { items: [], toc: [] }
    emptySnapshot.participants[0] = {
      ...emptySnapshot.participants[0],
      mode: 'sheet',
      is_host: true,
    }
    mockRoom(emptySnapshot)

    render(<RoomLivePage credentials={{ ...credentials, mode: 'sheet' }} />)

    expect(screen.getByText('rooms.emptyRoomTitle')).toBeInTheDocument()
    expect(screen.getByTestId('room-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('player-book')).not.toBeInTheDocument()
    expect(screen.queryByText('common.load')).not.toBeInTheDocument()
  })
})
