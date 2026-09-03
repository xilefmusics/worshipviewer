import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Team } from '@/api/teams-sessions-fetch'
import { CreateRoomDialog } from '@/components/room/CreateRoomDialog'

const createRoom = vi.fn()
let online = true

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-online', () => ({ useOnline: () => online }))
vi.mock('@/lib/room', () => ({
  createRoom: (...args: unknown[]) => createRoom(...args),
}))
vi.mock('@/lib/team-display-name', () => ({
  getTeamDisplayName: (team: Team) => team.name,
}))

const team = (id: string, name: string) => ({ id, name, members: [] }) as unknown as Team

beforeEach(() => {
  online = true
  createRoom.mockReset().mockResolvedValue({ room: { id: 'room-1' } })
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

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    const nameInput = screen.getByRole('textbox', { name: 'rooms.nameLabel' })
    const generatedName = nameInput.getAttribute('placeholder')
    expect(generatedName).toMatch(/^[A-Za-z]+ [A-Za-z]+$/)
    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({ team_id: 'team-1', name: generatedName }),
    )
    expect(onCreated).toHaveBeenCalledWith('room-1')
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

  it('requires an explicit choice when multiple writable teams are available', () => {
    render(
      <CreateRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One'), team('team-2', 'Two')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'rooms.createSubmit' })).toBeDisabled()
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

    fireEvent.click(screen.getByRole('button', { name: 'rooms.createSubmit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('rooms.createFailedAction')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
