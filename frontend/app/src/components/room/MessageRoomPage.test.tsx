import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MessageRoomPage } from '@/components/room/MessageRoomPage'
import { applyRoomMessage, createRoomReplay } from '@/lib/room-message'
import { renderWithProviders } from '@/test/renderWithProviders'

const mocks = vi.hoisted(() => ({
  clearCredentials: vi.fn(),
  joinRoom: vi.fn(),
  readCredentials: vi.fn(),
  debugEnabled: false,
  sendChange: vi.fn(),
  roomState: null as unknown,
}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return { ...actual, useTranslation: () => ({ t: (key: string, values?: { title?: string }) => values?.title ? `${key}:${values.title}` : key }) }
})
vi.mock('@/lib/room-message-api', () => ({
  clearMessageRoomCredentials: mocks.clearCredentials,
  joinMessageRoom: mocks.joinRoom,
  readMessageRoomCredentials: mocks.readCredentials,
  roomDebugOptionsEnabled: () => mocks.debugEnabled,
}))
vi.mock('@/lib/use-message-room', () => ({ useMessageRoom: () => mocks.roomState }))
vi.mock('@/components/room/RoomThreePanelShell', () => ({
  RoomThreePanelShell: ({ queue, player, details }: { queue: React.ReactNode; player: React.ReactNode; details: React.ReactNode }) => <div>{queue}{player}{details}</div>,
}))
vi.mock('@/components/player/PlayerBook', () => ({
  PlayerBook: ({ sharedSelection, onSharedSelectionChange }: { sharedSelection: { song: number; slide: number } | null; onSharedSelectionChange: (song: number, slide: number, activate: boolean) => void }) => (
    <button type="button" data-testid="room-player" onClick={() => onSharedSelectionChange(1, 0, true)}>{`sheet:${sharedSelection?.song ?? 'none'}`}</button>
  ),
}))
vi.mock('@/components/player/av/PlayerAv', () => ({
  PlayerAv: ({ sharedSelection }: { sharedSelection: { song: number; slide: number } | null }) => <div data-testid="room-player">{`av:${sharedSelection?.song ?? 'none'}`}</div>,
}))

const credentials = {
  room_id: 'room-1',
  visit_id: 'visit-current',
  resume_credential: 'resume-secret',
  connection_ticket: 'ticket-secret',
  mode: 'sheet' as const,
}

const items = [
  { song: { id: 'song-a', data: { titles: ['Song A'], sections: [{ title: 'Verse' }] } }, capo_shape: null, language: null, flow: null },
  { song: { id: 'song-b', data: { titles: ['Song B'], sections: [{ title: 'Chorus' }] } }, capo_shape: null, language: null, flow: null },
] as unknown as import('@/api/schema').components['schemas']['PlayerChordsItem'][]

function createRoomState() {
  let replay = createRoomReplay('room-1', [1, 1])
  replay = applyRoomMessage(replay, {
    id: 'vote-b', room_id: 'room-1', visit_id: 'other-visit', order: { epoch: 1, sequence: 1 },
    change: { type: 'vote', song: 1, voted: true },
  })
  replay = applyRoomMessage(replay, {
    id: 'activate-a', room_id: 'room-1', visit_id: 'other-visit', order: { epoch: 1, sequence: 2 },
    change: { type: 'selection', song: 0, slide: 0, activate: true },
  })
  return {
    content: { items, toc: [] },
    roomName: 'Sunday Room',
    replay,
    members: [{ visit_id: 'visit-current', display_name: 'Alex' }],
    status: 'connected',
    error: null,
    debugLog: { room_id: 'room-1', entries: [{ source: 'replay', event: { id: 'vote-b', room_id: 'room-1', visit_id: 'other-visit', order: { epoch: 1, sequence: 1 }, change: { type: 'vote', song: 1, voted: true } } }], truncated: false },
    sendChange: mocks.sendChange,
  }
}

beforeEach(() => {
  mocks.clearCredentials.mockReset()
  mocks.joinRoom.mockReset().mockResolvedValue(credentials)
  mocks.readCredentials.mockReset().mockReturnValue(null)
  mocks.debugEnabled = false
  mocks.sendChange.mockReset().mockReturnValue(true)
  mocks.roomState = createRoomState()
})

describe('MessageRoomPage', () => {
  it('keeps every fixed song visible and shares virtual queue votes and activations', async () => {
    renderWithProviders(<MessageRoomPage roomId="room-1" />)

    expect(await screen.findByText('Song A')).toBeInTheDocument()
    expect(screen.getByText('Song B')).toBeInTheDocument()
    expect(screen.getByText('rooms.played')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'rooms.voteForSong:Song A' }))
    expect(mocks.sendChange).toHaveBeenCalledWith({ type: 'vote', song: 0, voted: true })
    fireEvent.click(screen.getByTestId('room-player'))
    expect(mocks.sendChange).toHaveBeenCalledWith({ type: 'selection', song: 1, slide: 0, activate: true })
  })

  it('shows a bounded viewer and downloads the same credential-free JSON when enabled', async () => {
    mocks.debugEnabled = true
    renderWithProviders(<MessageRoomPage roomId="room-1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'rooms.debug.open' }))
    const viewer = screen.getByTestId('room-debug-log')
    const download = screen.getByRole('link', { name: 'rooms.debug.download' })
    const payload = decodeURIComponent((download.getAttribute('href') ?? '').split(',').slice(1).join(','))

    expect(payload).toBe(viewer.textContent)
    expect(payload).toContain('"source": "replay"')
    expect(payload).not.toContain('resume-secret')
    expect(payload).not.toContain('ticket-secret')
  })

  it('does not show diagnostics while the local option is disabled', async () => {
    renderWithProviders(<MessageRoomPage roomId="room-1" />)

    await screen.findByText('Song A')
    expect(screen.queryByRole('button', { name: 'rooms.debug.open' })).not.toBeInTheDocument()
  })
})
