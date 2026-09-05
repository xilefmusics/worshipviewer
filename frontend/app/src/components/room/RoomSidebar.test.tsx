import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomSidebar } from '@/components/room/RoomSidebar'
import { renderWithProviders } from '@/test/renderWithProviders'

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  }
})
vi.mock('@/hooks/use-online', () => ({ useOnline: () => true }))
vi.mock('@/lib/room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/room')>()
  return {
    ...actual,
    updateRoomQueueAccess: vi.fn().mockResolvedValue(undefined),
    formatRoomDuration: () => '00:01',
    participantModeLabel: () => 'rooms.mode.chords',
    useRoomElapsedSeconds: () => 1,
  }
})

const onEndRoom = vi.fn()

beforeEach(() => {
  onEndRoom.mockReset()
})

function renderSidebar() {
  return renderWithProviders(
    <RoomSidebar
      name="Room"
      createdAt="2026-01-01T00:00:00Z"
      status="connected"
      participants={[]}
      isHost
      canClose
      guestsAllowed
      onGuestsAllowedChange={vi.fn()}
      locked={false}
      onRoomLockedChange={vi.fn()}
      roomId="room-1"
      revision={1}
      open
      inviteSecret="invite-secret"
      onEndRoom={onEndRoom}
    />,
  )
}

describe('RoomSidebar', () => {
  it('groups room access settings and confirms before closing', () => {
    renderSidebar()

    expect(screen.getByRole('checkbox', { name: 'rooms.queueAccess.allow' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'rooms.lockRoom.label' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'rooms.allowGuests.label' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'rooms.end' }))

    expect(screen.getByRole('heading', { name: 'rooms.closeConfirmTitle' })).toBeInTheDocument()
    expect(onEndRoom).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'rooms.closeConfirm' }))

    expect(onEndRoom).toHaveBeenCalledOnce()
  })
})
