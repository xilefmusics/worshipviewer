import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerRoomCredentials, PlayerRoomSnapshot } from '@/lib/player-room'
import { PlayerRoomLivePage } from '@/components/player-room/PlayerRoomLivePage'

const usePlayerRoom = vi.fn()
const registerPlayerRoomMedia = vi.fn()
let slideViewProps: Record<string, unknown> | null = null

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/player-room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/player-room')>()
  return { ...actual, usePlayerRoom: (...args: unknown[]) => usePlayerRoom(...args) }
})

vi.mock('@/lib/player-room-media', () => ({
  registerPlayerRoomMedia: (...args: unknown[]) => registerPlayerRoomMedia(...args),
}))

vi.mock('@/components/player-room/PlayerRoomSidebar', () => ({
  PlayerRoomSidebar: () => <aside data-testid="room-sidebar" />,
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

const credentials: PlayerRoomCredentials = {
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
  nextProjection: PlayerRoomSnapshot['projection'],
): PlayerRoomSnapshot {
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

function mockRoom(snapshot: PlayerRoomSnapshot) {
  usePlayerRoom.mockReturnValue({
    snapshot,
    status: 'connected',
    sendMusicalState: vi.fn(),
    sendProjection: vi.fn(),
    sendGuestsAllowed: vi.fn(),
    leave: vi.fn(),
  })
}

beforeEach(() => {
  slideViewProps = null
  usePlayerRoom.mockReset()
  registerPlayerRoomMedia.mockReset().mockReturnValue(vi.fn())
})

describe('PlayerRoomLivePage slide mode', () => {
  it('renders a clean black canvas before the first projection event', () => {
    mockRoom(snapshotWithProjection(null))

    const { container } = render(<PlayerRoomLivePage credentials={credentials} />)

    expect(container.firstElementChild).toHaveClass('bg-black', 'h-dvh', 'w-dvw')
    expect(screen.queryByText('common.load')).not.toBeInTheDocument()
    expect(screen.queryByTestId('room-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('slide-view')).not.toBeInTheDocument()
  })

  it('renders projection content without the room sidebar', () => {
    mockRoom(snapshotWithProjection(projection))

    render(<PlayerRoomLivePage credentials={credentials} />)

    expect(screen.getByTestId('slide-view')).toBeInTheDocument()
    expect(screen.queryByTestId('room-sidebar')).not.toBeInTheDocument()
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
    const { container } = render(<PlayerRoomLivePage credentials={credentials} />)

    fireEvent.doubleClick(container.firstElementChild as Element)

    expect(requestFullscreen).toHaveBeenCalledOnce()
  })
})
