import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render as renderTestingLibrary, screen, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Team } from '@/api/teams-sessions-fetch'
import { CreateRoomDialog } from '@/components/room/CreateRoomDialog'

const createRoom = vi.fn()
const fetchCollectionsPage = vi.fn()
const fetchSetlistsPage = vi.fn()
let online = true
const LAST_OWNER_LS = 'wv.roomCreate.lastOwnerTeamId'
const localStorageState = new Map<string, string>()
const localStorageMock = {
  getItem: (key: string) => localStorageState.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageState.set(key, value),
  removeItem: (key: string) => localStorageState.delete(key),
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-online', () => ({ useOnline: () => online }))
vi.mock('@/lib/room', () => ({
  createRoom: (...args: unknown[]) => createRoom(...args),
}))
vi.mock('@/api/list-fetch', () => ({
  fetchCollectionsPage: (...args: unknown[]) => fetchCollectionsPage(...args),
  fetchSetlistsPage: (...args: unknown[]) => fetchSetlistsPage(...args),
}))
vi.mock('@/lib/team-display-name', () => ({
  getTeamDisplayName: (team: Team) => team.name,
  isPersonalTeamName: (name: string) => name.trim().toLowerCase() === 'personal',
}))

const team = (id: string, name: string) => ({ id, name, members: [] }) as unknown as Team

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderTestingLibrary(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  online = true
  localStorageState.clear()
  vi.stubGlobal('localStorage', localStorageMock)
  Element.prototype.scrollIntoView = vi.fn()
  createRoom.mockReset().mockResolvedValue({ room: { id: 'room-1' } })
  fetchCollectionsPage.mockReset().mockResolvedValue({ items: [], total: 0 })
  fetchSetlistsPage.mockReset().mockResolvedValue({ items: [], total: 0 })
})

describe('CreateRoomDialog', () => {
  it('uses the only writable team without showing a chooser', async () => {
    const onCreated = vi.fn()
    render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={onCreated}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'rooms.songPool.typeLabel' })).toBeInTheDocument()
    const nameInput = screen.getByRole('textbox', { name: 'rooms.nameLabel' })
    expect(nameInput).toHaveAttribute('placeholder', 'rooms.namePlaceholder')
    fireEvent.change(nameInput, { target: { value: 'Sunday Worship' } })
    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({ team_id: 'team-1', name: 'Sunday Worship' }),
    )
    expect(onCreated).toHaveBeenCalledWith('room-1')
  })

  it('requires a non-blank room name before creating', async () => {
    render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'rooms.nameLabel' }), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('rooms.nameRequired')
    expect(createRoom).not.toHaveBeenCalled()
  })

  it('uses a custom room name when one is entered', async () => {
    render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'rooms.nameLabel' }), {
      target: { value: 'Sunday Worship' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({ team_id: 'team-1', name: 'Sunday Worship' }),
    )
  })

  it('passes a selected source and pre-fills its title as the room name', async () => {
    render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        source={{ type: 'collection', id: 'collection-1', title: 'Sunday Set' }}
        onCreated={vi.fn()}
      />,
    )

    const nameInput = screen.getByRole('textbox', { name: 'rooms.nameLabel' })
    expect(nameInput).toHaveValue('Sunday Set')
    expect(screen.queryByRole('combobox', { name: 'rooms.songPool.typeLabel' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({
        team_id: 'team-1',
        name: 'Sunday Set',
        source_type: 'collection',
        source_id: 'collection-1',
      }),
    )
  })

  it('passes a selected collection as the song pool for an independent room', async () => {
    fetchCollectionsPage.mockResolvedValue({
      items: [{ id: 'collection-1', title: 'Sunday songs' }],
      total: 1,
    })
    render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'rooms.songPool.typeLabel' }))
    fireEvent.click(await screen.findByRole('option', { name: 'rooms.songPool.collectionType' }))
    const poolSelect = await screen.findByRole('combobox', { name: 'rooms.songPool.sourceLabel' })
    await waitFor(() => expect(poolSelect).toBeEnabled())
    fireEvent.click(poolSelect)
    fireEvent.click(await screen.findByRole('option', { name: 'Sunday songs' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'rooms.nameLabel' }), {
      target: { value: 'Sunday Worship' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({
        team_id: 'team-1',
        name: 'Sunday Worship',
        source_type: 'collection',
        source_id: 'collection-1',
      }),
    )
  })

  it('defaults to the first team when multiple writable teams are available', () => {
    render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One'), team('team-2', 'Two')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'rooms.teamLabel' })).toHaveTextContent('One')
    expect(screen.getByRole('button', { name: 'rooms.createSubmit' })).toBeEnabled()
  })

  it('prefers the personal team and remembers the last selected team', async () => {
    const onCreated = vi.fn()
    const { rerender } = render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One'), team('team-2', 'Personal')]}
        userId="user-1"
        onCreated={onCreated}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'rooms.teamLabel' })).toHaveTextContent('Personal')
    fireEvent.change(screen.getByRole('textbox', { name: 'rooms.nameLabel' }), {
      target: { value: 'Sunday Worship' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))
    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({ team_id: 'team-2', name: 'Sunday Worship' }),
    )
    expect(localStorageMock.getItem(LAST_OWNER_LS)).toBe('team-2')
    expect(onCreated).toHaveBeenCalledWith('room-1')

    localStorageMock.setItem(LAST_OWNER_LS, 'team-1')
    rerender(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One'), team('team-2', 'Personal')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'rooms.teamLabel' })).toHaveTextContent('One')
  })

  it('keeps creation unavailable while offline', () => {
    online = false
    render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'rooms.createSubmit' })).toBeDisabled()
  })

  it('shows an actionable error and remains open after a failed request', async () => {
    createRoom.mockRejectedValue(new Error('forbidden'))
    render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'rooms.nameLabel' }), {
      target: { value: 'Sunday Worship' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('rooms.createFailedAction')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows a pending state while creating and keeps cancel available', () => {
    createRoom.mockReturnValue(new Promise(() => {}))
    const onOpenChange = vi.fn()
    render(
      <CreateRoomDialog
        open
        onOpenChange={onOpenChange}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'rooms.nameLabel' }), {
      target: { value: 'Sunday Worship' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))

    expect(screen.getByRole('button', { name: 'common.load' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'teams.dialogCancel' })).toBeEnabled()
  })

  it('dismisses from the drag handle and snaps back for a short drag', () => {
    const onOpenChange = vi.fn()
    render(
      <CreateRoomDialog
        open
        onOpenChange={onOpenChange}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    const handle = screen.getByRole('dialog').querySelector('div[style*="touch-action"]')
    expect(handle).not.toBeNull()
    const dragHandle = handle as HTMLDivElement
    dragHandle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(dragHandle, { pointerId: 1, clientY: 100 })
    fireEvent.pointerMove(dragHandle, { pointerId: 1, clientY: 180 })
    fireEvent.pointerUp(dragHandle, { pointerId: 1, clientY: 180 })
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.pointerDown(dragHandle, { pointerId: 2, clientY: 100 })
    fireEvent.pointerMove(dragHandle, { pointerId: 2, clientY: 200 })
    fireEvent.pointerUp(dragHandle, { pointerId: 2, clientY: 200 })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('resets the edited name when cancelled', () => {
    const onOpenChange = vi.fn()
    render(
      <CreateRoomDialog
        open
        onOpenChange={onOpenChange}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    const nameInput = screen.getByRole('textbox', { name: 'rooms.nameLabel' })
    fireEvent.change(nameInput, { target: { value: 'Sunday Worship' } })
    fireEvent.click(screen.getByRole('button', { name: 'teams.dialogCancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(nameInput).toHaveValue('')
  })
})
