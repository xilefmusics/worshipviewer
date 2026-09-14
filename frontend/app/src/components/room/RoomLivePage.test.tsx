import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import type { RoomCredentials, RoomSnapshot } from '@/lib/room'
import { RoomLivePage } from '@/components/room/RoomLivePage'

const useRoom = vi.fn()
let slideViewProps: Record<string, unknown> | null = null
let playerBookProps: Record<string, unknown> | null = null
let playerAvProps: Record<string, unknown> | null = null
let roomQueuePanelProps: Record<string, unknown> | null = null
let isPhoneViewport = false

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/room')>()
  return { ...actual, useRoom: (...args: unknown[]) => useRoom(...args) }
})

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsPhoneWidth: () => isPhoneViewport,
}))

vi.mock('@/components/room/RoomSidebar', () => ({
  RoomSidebar: () => <aside data-testid="room-sidebar" />,
}))

vi.mock('@/components/room/RoomQueuePanel', () => ({
  RoomQueuePanel: (props: Record<string, unknown>) => {
    roomQueuePanelProps = props
    return <aside data-testid="room-queue" />
  },
}))

vi.mock('@/components/player/PlayerBook', () => ({
  PlayerBook: (props: Record<string, unknown>) => {
    playerBookProps = props
    return <div data-testid="player-book">{props.tocSidebar as ReactNode}</div>
  },
}))

vi.mock('@/components/player/av/PlayerAv', () => ({
  PlayerAv: (props: Record<string, unknown>) => {
    playerAvProps = props
    return <div data-testid="player-av" />
  },
}))

vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: (props: Record<string, unknown>) => {
    slideViewProps = props
    return <div data-testid="slide-view" />
  },
}))

const credentials: RoomCredentials = {
  room_id: 'room-1',
  session_id: 'participant-1',
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
  const roomItem = { song: { id: 'song-1' }, language: null, flow: null } as RoomSnapshot['content']['items'][number]
  return {
    id: 'room-1',
    name: 'Room',
    team_id: 'team-1',
    host_email: 'host@example.com',
    session_count: 1,
    av_occupied: true,
    created_at: new Date().toISOString(),
    new_joins_locked: false,
    content: { items: [roomItem], toc: [] },
    queue: [],
    voted_queue_ids: [],
    musical_state: { item_index: 0, started: false, language: null, transposition: null },
    projection: nextProjection,
    sessions: [
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
    sendGuestAccessAllowed: vi.fn(),
    sendNewJoinsLocked: vi.fn(),
    sendQueueVote: vi.fn(),
    leave: vi.fn(),
  })
}

beforeEach(() => {
  slideViewProps = null
  playerBookProps = null
  playerAvProps = null
  roomQueuePanelProps = null
  isPhoneViewport = false
  useRoom.mockReset()
})

describe('RoomLivePage slide mode', () => {
  it('renders a clean black canvas before the first projection event', () => {
    mockRoom(snapshotWithProjection(null))

    render(<RoomLivePage credentials={credentials} />)

    expect(screen.getByTestId('room-slide-canvas')).toHaveClass('bg-black', 'h-full', 'w-full')
    expect(screen.queryByText('common.load')).not.toBeInTheDocument()
    expect(screen.getByTestId('room-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('room-queue')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'rooms.panel.queue' })).toHaveClass(
      'md:absolute',
      'w-[13.31rem]',
      'sm:w-[16.94rem]',
    )
    expect(screen.getByRole('region', { name: 'rooms.panel.details' })).toHaveClass(
      'md:absolute',
      'w-[13.31rem]',
      'sm:w-[16.94rem]',
    )
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

describe('RoomLivePage responsive player layout', () => {
  it('uses the full PlayerBook chrome with room sidebars on desktop', () => {
    mockRoom(snapshotWithProjection(null))

    render(<RoomLivePage credentials={{ ...credentials, mode: 'sheet' }} />)

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByTestId('player-book')).toBeInTheDocument()
    expect(playerBookProps).toEqual(expect.objectContaining({
      tocSidebar: expect.anything(),
      roomSidebar: expect.anything(),
      backToOverride: '/rooms',
      backAriaKeyOverride: 'rooms.backToList',
    }))
    expect(playerBookProps).not.toHaveProperty('embedded')
    expect(roomQueuePanelProps).toMatchObject({ currentSongId: null })
  })

  it('keeps the three-panel shell on mobile', () => {
    isPhoneViewport = true
    mockRoom(snapshotWithProjection(null))

    render(<RoomLivePage credentials={{ ...credentials, mode: 'sheet' }} />)

    expect(screen.queryByRole('tablist', { name: 'rooms.panels' })).not.toBeInTheDocument()
    expect(playerBookProps).toEqual(expect.objectContaining({ embedded: true }))
    expect(playerBookProps).not.toHaveProperty('tocSidebar')
    expect(playerBookProps).not.toHaveProperty('roomSidebar')
  })

  it('keeps AV in the three-panel shell on mobile', () => {
    isPhoneViewport = true
    mockRoom(snapshotWithProjection(null))

    render(<RoomLivePage credentials={{ ...credentials, mode: 'av' }} />)

    expect(screen.queryByRole('tablist', { name: 'rooms.panels' })).not.toBeInTheDocument()
    expect(playerAvProps).toEqual(expect.objectContaining({ embedded: true }))
    expect(playerAvProps).not.toHaveProperty('tocSidebar')
    expect(playerAvProps).not.toHaveProperty('roomSidebar')
  })

  it('passes the queue sidebar through to the desktop AV player', () => {
    mockRoom(snapshotWithProjection(null))

    render(<RoomLivePage credentials={{ ...credentials, mode: 'av' }} />)

    expect(screen.getByTestId('player-av')).toBeInTheDocument()
    expect(playerAvProps).toEqual(expect.objectContaining({
      tocSidebar: expect.anything(),
      roomSidebar: expect.anything(),
      backToOverride: '/rooms',
      backAriaKeyOverride: 'rooms.backToList',
    }))
    expect(playerAvProps).not.toHaveProperty('embedded')
  })
})

describe('RoomLivePage empty room', () => {
  it('renders a purposeful Sheet empty state with host controls reachable', () => {
    const emptySnapshot = snapshotWithProjection(null)
    emptySnapshot.content = { items: [], toc: [] }
    emptySnapshot.sessions[0] = {
      ...emptySnapshot.sessions[0],
      mode: 'sheet',
      is_host: true,
    }
    mockRoom(emptySnapshot)

    render(<RoomLivePage credentials={{ ...credentials, mode: 'sheet' }} />)

    expect(screen.getByText('rooms.emptyRoomTitle')).toBeInTheDocument()
    expect(screen.getByTestId('room-sidebar')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'rooms.panel.queue' })).toHaveClass('md:absolute')
    expect(screen.getByRole('region', { name: 'rooms.panel.details' })).toHaveClass('md:absolute')
    expect(screen.queryByTestId('player-book')).not.toBeInTheDocument()
    expect(screen.queryByText('common.load')).not.toBeInTheDocument()
  })
})
