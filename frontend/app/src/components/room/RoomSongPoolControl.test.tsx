import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomSongPoolControl } from '@/components/room/RoomSongPoolControl'
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
vi.mock('@/lib/room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/room')>()
  return { ...actual, updateRoomSongPool: vi.fn() }
})

beforeEach(() => {
  online = true
})

describe('RoomSongPoolControl', () => {
  it('shows the current pool read-only to non-host participants', () => {
    renderWithProviders(
      <RoomSongPoolControl
        roomId="room-1"
        revision={4}
        songPool={{ type: 'collection', id: 'collection-1', title: 'Sunday songs' }}
        isHost={false}
      />,
    )

    expect(screen.getByText('rooms.songPool.label')).toBeInTheDocument()
    expect(screen.getByText('Sunday songs')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows separate type, source, and access controls to the host', async () => {
    renderWithProviders(
      <RoomSongPoolControl
        roomId="room-1"
        revision={4}
        songPool={undefined}
        isHost
      />,
    )

    const comboboxes = await screen.findAllByRole('combobox')
    expect(comboboxes).toHaveLength(2)
    expect(comboboxes[0]).toBeEnabled()
    expect(comboboxes[1]).toBeDisabled()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
})
