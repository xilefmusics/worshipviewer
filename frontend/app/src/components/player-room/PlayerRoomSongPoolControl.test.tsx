import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlayerRoomSongPoolControl } from '@/components/player-room/PlayerRoomSongPoolControl'
import { renderWithProviders } from '@/test/renderWithProviders'

let online = true

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) }
})
vi.mock('@/hooks/use-online', () => ({ useOnline: () => online }))
vi.mock('@/api/list-fetch', () => ({
  fetchCollectionsPage: vi.fn().mockResolvedValue({ items: [{ id: 'collection-1', title: 'Sunday songs' }], total: 1 }),
  fetchSetlistsPage: vi.fn().mockResolvedValue({ items: [{ id: 'setlist-1', title: 'Sunday setlist' }], total: 1 }),
}))
vi.mock('@/lib/player-room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/player-room')>()
  return { ...actual, updatePlayerRoomSongPool: vi.fn() }
})

beforeEach(() => {
  online = true
})

describe('PlayerRoomSongPoolControl', () => {
  it('shows the current pool read-only to non-host participants', () => {
    renderWithProviders(
      <PlayerRoomSongPoolControl
        roomId="room-1"
        revision={4}
        songPool={{ type: 'collection', id: 'collection-1', title: 'Sunday songs' }}
        isHost={false}
      />,
    )

    expect(screen.getByText('playerRooms.songPool.label')).toBeInTheDocument()
    expect(screen.getByText('Sunday songs')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows an editable pool control to the host', async () => {
    renderWithProviders(
      <PlayerRoomSongPoolControl
        roomId="room-1"
        revision={4}
        songPool={{ type: 'open' }}
        isHost
      />,
    )

    expect(await screen.findByRole('combobox')).toBeEnabled()
  })
})
