import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Team } from '@/api/teams-sessions-fetch'
import { CreatePlayerRoomDialog } from '@/components/player-room/CreatePlayerRoomDialog'

const createPlayerRoom = vi.fn()
let online = true

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-online', () => ({ useOnline: () => online }))
vi.mock('@/lib/player-room', () => ({
  createPlayerRoom: (...args: unknown[]) => createPlayerRoom(...args),
}))
vi.mock('@/lib/team-display-name', () => ({
  getTeamDisplayName: (team: Team) => team.name,
}))

const team = (id: string, name: string) => ({ id, name, members: [] }) as unknown as Team

beforeEach(() => {
  online = true
  createPlayerRoom.mockReset().mockResolvedValue({ room: { id: 'room-1' } })
})

describe('CreatePlayerRoomDialog', () => {
  it('uses the only writable team without showing a chooser', async () => {
    const onCreated = vi.fn()
    render(
      <CreatePlayerRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={onCreated}
      />,
    )

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    const nameInput = screen.getByRole('textbox', { name: 'playerRooms.nameLabel' })
    const generatedName = nameInput.getAttribute('placeholder')
    expect(generatedName).toMatch(/^[A-Za-z]+ [A-Za-z]+$/)
    fireEvent.click(screen.getByRole('button', { name: 'playerRooms.createSubmit' }))

    await waitFor(() =>
      expect(createPlayerRoom).toHaveBeenCalledWith({ team_id: 'team-1', name: generatedName }),
    )
    expect(onCreated).toHaveBeenCalledWith('room-1')
  })

  it('uses a custom room name when one is entered', async () => {
    render(
      <CreatePlayerRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'playerRooms.nameLabel' }), {
      target: { value: 'Sunday Worship' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'playerRooms.createSubmit' }))

    await waitFor(() =>
      expect(createPlayerRoom).toHaveBeenCalledWith({ team_id: 'team-1', name: 'Sunday Worship' }),
    )
  })

  it('requires an explicit choice when multiple writable teams are available', () => {
    render(
      <CreatePlayerRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One'), team('team-2', 'Two')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'playerRooms.createSubmit' })).toBeDisabled()
  })

  it('keeps creation unavailable while offline', () => {
    online = false
    render(
      <CreatePlayerRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'playerRooms.createSubmit' })).toBeDisabled()
  })

  it('shows an actionable error and remains open after a failed request', async () => {
    createPlayerRoom.mockRejectedValue(new Error('forbidden'))
    render(
      <CreatePlayerRoomDialog
        open
        onOpenChange={vi.fn()}
        teams={[team('team-1', 'One')]}
        userId="user-1"
        onCreated={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'playerRooms.createSubmit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('playerRooms.createFailedAction')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
