import { screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomQueueAccessControl } from '@/components/room/RoomQueueAccessControl'
import { renderWithProviders } from '@/test/renderWithProviders'

let online = true

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) }
})
vi.mock('@/hooks/use-online', () => ({ useOnline: () => online }))
vi.mock('@/lib/room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/room')>()
  return { ...actual, updateRoomQueueAccess: vi.fn().mockResolvedValue(undefined) }
})

import { updateRoomQueueAccess } from '@/lib/room'

beforeEach(() => {
  online = true
  vi.clearAllMocks()
})

describe('RoomQueueAccessControl', () => {
  it('shows queue access read-only to non-host participants', () => {
    renderWithProviders(
      <RoomQueueAccessControl roomId="room-1" revision={4} open={false} isHost={false} />,
    )

    expect(screen.getByText('rooms.queueAccess.shortLabel')).toBeInTheDocument()
    expect(screen.getByText('rooms.queueAccess.disabled')).toBeInTheDocument()
    expect(screen.queryByText('rooms.queueAccess.disabledDescription')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('lets the host toggle queue access', async () => {
    renderWithProviders(
      <RoomQueueAccessControl roomId="room-1" revision={4} open={false} isHost />,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'rooms.queueAccess.allow' })
    expect(screen.getByText('rooms.queueAccess.shortLabel')).toBeInTheDocument()
    expect(screen.queryByText('rooms.queueAccess.allowedDescription')).not.toBeInTheDocument()
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)

    await waitFor(() => expect(updateRoomQueueAccess).toHaveBeenCalledWith('room-1', true, 4))
  })
})
