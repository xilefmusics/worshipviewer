import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomsList } from '@/components/room/RoomsList'
import { renderWithProviders } from '@/test/renderWithProviders'

const mocks = vi.hoisted(() => ({
  deleteRoom: vi.fn(),
  joinRoom: vi.fn(),
  listRooms: vi.fn(),
}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) }
})
vi.mock('@/hooks/useHubSearch', () => ({ useHubSearch: () => ({ debouncedQ: '', selectedTeamId: undefined }) }))
vi.mock('@/hooks/use-online', () => ({ useOnline: () => true }))
vi.mock('@/lib/room-message-api', () => ({
  deleteMessageRoom: mocks.deleteRoom,
  joinMessageRoom: mocks.joinRoom,
  listMessageRooms: mocks.listRooms,
}))

const room = {
  id: 'room-1',
  name: 'Sunday Setlist',
  team_id: 'team-1',
  song_count: 3,
  can_delete: true,
  created_at: '2026-01-01T00:00:00Z',
}

function renderRooms(overrides: Partial<typeof room> = {}) {
  mocks.listRooms.mockResolvedValue({ items: [{ ...room, ...overrides }], total: 1 })
  return renderWithProviders(<RoomsList />)
}

beforeEach(() => {
  mocks.deleteRoom.mockReset().mockResolvedValue(undefined)
  mocks.joinRoom.mockReset().mockResolvedValue({})
  mocks.listRooms.mockReset()
})

describe('RoomsList', () => {
  it('shows the room row and offers AV and projector entry actions', async () => {
    renderRooms()

    expect(await screen.findByRole('heading', { name: 'Sunday Setlist' })).toBeInTheDocument()
    expect(screen.getByRole('listitem').querySelector('p')).toHaveTextContent('rooms.roomSongCount')
    expect(screen.getByRole('button', { name: 'Sunday Setlist' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'hub.actions.menuAria' }))
    expect(await screen.findByRole('menuitem', { name: 'rooms.joinAv' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'rooms.joinSlide' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'rooms.delete' })).toBeInTheDocument()
  })

  it('hides delete from users without team editor rights', async () => {
    renderRooms({ can_delete: false })

    await screen.findByRole('heading', { name: 'Sunday Setlist' })
    expect(screen.queryByRole('button', { name: 'rooms.delete' })).not.toBeInTheDocument()
  })

  it('confirms deletion before calling the room API', async () => {
    renderRooms()

    fireEvent.click(await screen.findByRole('button', { name: 'hub.actions.menuAria' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'rooms.delete' }))
    expect(screen.getByRole('heading', { name: 'rooms.deleteConfirmTitle' })).toBeInTheDocument()
    expect(mocks.deleteRoom).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'rooms.deleteConfirm' }))
    await waitFor(() => expect(mocks.deleteRoom).toHaveBeenCalledWith('room-1'))
  })
})
