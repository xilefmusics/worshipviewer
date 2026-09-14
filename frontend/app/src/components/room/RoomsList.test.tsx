import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomsList } from '@/components/room/RoomsList'
import { renderWithProviders } from '@/test/renderWithProviders'

const mocks = vi.hoisted(() => ({
  endRoom: vi.fn(),
  joinRoom: vi.fn(),
  listRooms: vi.fn(),
  writeHideChordsPreference: vi.fn(),
}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  }
})
vi.mock('@/hooks/useHubSearch', () => ({
  useHubSearch: () => ({ debouncedQ: '', selectedTeamId: undefined }),
}))
vi.mock('@/hooks/use-online', () => ({ useOnline: () => true }))
vi.mock('@/lib/hide-chords-preference', () => ({
  writeHideChordsPreference: mocks.writeHideChordsPreference,
}))
vi.mock('@/lib/room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/room')>()
  return {
    ...actual,
    endRoom: mocks.endRoom,
    formatRoomDuration: () => '00:01',
    joinRoom: mocks.joinRoom,
    listRooms: mocks.listRooms,
    useRoomElapsedSeconds: () => 1,
  }
})

const room = {
  id: 'room-1',
  name: 'Sunday Setlist',
  team_id: 'team-1',
  host_email: 'host@example.com',
  session_count: 2,
  av_occupied: true,
  can_close: true,
  created_at: '2026-01-01T00:00:00Z',
}

function renderRooms(overrides: Partial<typeof room> = {}) {
  mocks.listRooms.mockResolvedValue({ items: [{ ...room, ...overrides }], total: 1 })
  return renderWithProviders(<RoomsList />)
}

async function openActions() {
  await screen.findByRole('button', { name: 'hub.actions.menuAria' })
  fireEvent.click(screen.getByRole('button', { name: 'hub.actions.menuAria' }))
  await screen.findByRole('group', { name: 'rooms.join' })
}

beforeEach(() => {
  mocks.endRoom.mockReset().mockResolvedValue(undefined)
  mocks.joinRoom.mockReset()
  mocks.listRooms.mockReset()
  mocks.writeHideChordsPreference.mockReset()
})

describe('RoomsList', () => {
  it('joins the room in Chords mode from the primary row action', async () => {
    mocks.joinRoom.mockImplementation(() => new Promise(() => undefined))
    renderRooms()

    fireEvent.click(await screen.findByRole('button', { name: /Sunday Setlist/ }))

    expect(mocks.joinRoom).toHaveBeenCalledWith('room-1', 'sheet', false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('provides all four join modes and disables occupied AV', async () => {
    mocks.joinRoom.mockRejectedValue(new Error('test'))
    renderRooms()

    await openActions()

    expect(screen.getByRole('group', { name: 'rooms.join' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'rooms.mode.chords' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'rooms.mode.text' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'rooms.mode.av' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'rooms.mode.slide' })).toBeEnabled()
    expect(screen.getByRole('group', { name: 'hub.actions.general' })).toBeInTheDocument()
  })

  it.each([
    ['rooms.mode.chords', 'sheet', false],
    ['rooms.mode.text', 'sheet', true],
    ['rooms.mode.av', 'av', false],
    ['rooms.mode.slide', 'slide', false],
  ] as const)('joins with the selected mode: %s', async (label, mode, hideChords) => {
    mocks.joinRoom.mockRejectedValue(new Error('test'))
    renderRooms({ av_occupied: false })

    await openActions()
    fireEvent.click(screen.getByRole('menuitem', { name: label }))

    await waitFor(() => expect(mocks.joinRoom).toHaveBeenCalledWith('room-1', mode, hideChords))
  })

  it('moves Close into General and confirms before ending the room', async () => {
    renderRooms()

    expect(screen.queryByRole('button', { name: 'rooms.end' })).not.toBeInTheDocument()
    await openActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'rooms.end' }))

    expect(screen.getByRole('heading', { name: 'rooms.closeConfirmTitle' })).toBeInTheDocument()
    expect(mocks.endRoom).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(mocks.endRoom).not.toHaveBeenCalled()

    await openActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'rooms.end' }))
    fireEvent.click(screen.getByRole('button', { name: 'rooms.closeConfirm' }))

    await waitFor(() => expect(mocks.endRoom).toHaveBeenCalledWith('room-1'))
  })

  it('hides Close for rooms the user cannot close', async () => {
    renderRooms({ can_close: false })

    await openActions()

    expect(screen.queryByRole('group', { name: 'hub.actions.general' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'rooms.end' })).not.toBeInTheDocument()
  })
})
