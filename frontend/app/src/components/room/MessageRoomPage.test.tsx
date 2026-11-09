import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MessageRoomPage } from '@/components/room/MessageRoomPage'
import { applyRoomMessage, createRoomReplay } from '@/lib/room-message'
import { renderWithProviders } from '@/test/renderWithProviders'

const mocks = vi.hoisted(() => ({
  clearCredentials: vi.fn(),
  joinRoom: vi.fn(),
  readCredentials: vi.fn(),
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
}))
vi.mock('@/lib/use-message-room', () => ({ useMessageRoom: () => mocks.roomState }))
vi.mock('@/components/room/RoomPlayerShell', () => ({
  RoomPlayerShell: ({ player }: { player: React.ReactNode }) => <div>{player}</div>,
}))
vi.mock('@/components/player/PlayerBook', () => ({
  PlayerBook: ({ sharedSelection, onSharedSelectionChange, renderTocRowSuffix, roomSettingsReturn }: { sharedSelection: { song: number; section: number; slide: number } | null; onSharedSelectionChange: (song: number, section: number, slide: number, activate: boolean) => void; renderTocRowSuffix?: (entry: import('@/lib/player/toc-display').TocDisplayEntry) => React.ReactNode; roomSettingsReturn?: { roomId: string; mode: string } }) => (
    <div>
      <button type="button" data-testid="room-player" data-settings-room-id={roomSettingsReturn?.roomId} data-settings-room-mode={roomSettingsReturn?.mode} onClick={() => onSharedSelectionChange(1, 0, 0, true)}>{`sheet:${sharedSelection?.song ?? 'none'}`}</button>
      {renderTocRowSuffix?.({ key: 'song-a', sourceIdx: 0, title: 'Song A', languageIndex: null, liked: false, showNumber: true })}
      {renderTocRowSuffix?.({ key: 'song-b', sourceIdx: 1, title: 'Song B', languageIndex: null, liked: false, showNumber: true })}
    </div>
  ),
}))
vi.mock('@/components/player/av/PlayerAv', () => ({
  PlayerAv: ({
    sharedSelection,
    onSharedBackgroundChange,
    roomSettingsReturn,
  }: {
    sharedSelection: { song: number; slide: number } | null
    onSharedBackgroundChange: (background: { preset: number; image?: { mediaId: string; assetId: string } }) => void
    roomSettingsReturn?: { roomId: string; mode: string }
  }) => (
    <div>
      <div data-testid="room-player" data-settings-room-id={roomSettingsReturn?.roomId} data-settings-room-mode={roomSettingsReturn?.mode}>{`av:${sharedSelection?.song ?? 'none'}`}</div>
      <button
        type="button"
        data-testid="set-room-background"
        onClick={() => onSharedBackgroundChange({
          preset: 2,
          image: { mediaId: 'media-bg', assetId: 'asset-bg' },
        })}
      >
        set background
      </button>
    </div>
  ),
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
    change: { type: 'selection', song: 0, section: 0, slide: 0, activate: true },
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
  mocks.sendChange.mockReset().mockReturnValue(true)
  mocks.roomState = createRoomState()
})

describe('MessageRoomPage', () => {
  it('puts vote controls in the player contents and shares votes and activations', async () => {
    renderWithProviders(<MessageRoomPage roomId="room-1" />)

    expect(await screen.findByRole('button', { name: 'rooms.voteForSong:Song A' })).toHaveTextContent('▲ 0')
    expect(screen.getByRole('button', { name: 'rooms.voteForSong:Song B' })).toHaveTextContent('▲ 1')
    expect(screen.getByTestId('room-player')).toHaveAttribute('data-settings-room-id', 'room-1')
    expect(screen.getByTestId('room-player')).toHaveAttribute('data-settings-room-mode', 'sheet')
    expect(screen.queryByText('rooms.queue.title')).not.toBeInTheDocument()
    expect(screen.queryByText('rooms.details')).not.toBeInTheDocument()
    expect(screen.queryByText('rooms.participants')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'rooms.voteForSong:Song A' }))
    expect(mocks.sendChange).toHaveBeenCalledWith({ type: 'vote', song: 0, voted: true })
    fireEvent.click(screen.getByTestId('room-player'))
    expect(mocks.sendChange).toHaveBeenCalledWith({ type: 'selection', song: 1, section: 0, slide: 0, activate: true })
  })

  it('does not render the room details panel', async () => {
    renderWithProviders(<MessageRoomPage roomId="room-1" />)

    expect(await screen.findByTestId('room-player')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'rooms.copyLink' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'rooms.debug.open' })).not.toBeInTheDocument()
  })

  it('sends shared AV backgrounds as room changes', async () => {
    mocks.joinRoom.mockResolvedValue({ ...credentials, mode: 'av' })
    renderWithProviders(<MessageRoomPage roomId="room-1" initialMode="av" />)

    expect(await screen.findByTestId('room-player')).toHaveAttribute('data-settings-room-id', 'room-1')
    expect(screen.getByTestId('room-player')).toHaveAttribute('data-settings-room-mode', 'av')
    fireEvent.click(screen.getByTestId('set-room-background'))
    expect(mocks.sendChange).toHaveBeenCalledWith({
      type: 'set_background',
      background: {
        preset: 2,
        image: { media_id: 'media-bg', asset_id: 'asset-bg' },
      },
    })
  })
})
