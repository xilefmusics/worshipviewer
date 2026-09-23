import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RoomsRoute } from '@/routes/_hub/rooms'
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: { component: unknown }) => opts,
  useLocation: () => ({ search: {} }),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/hooks/useWritableTeams', () => ({
  useWritableTeams: () => ({ teams: [], user: undefined }),
}))
vi.mock('@/components/room/RoomsList', () => ({
  RoomsList: () => <div data-testid="rooms-list" />,
}))
vi.mock('@/components/room/CreateRoomDialog', () => ({
  CreateRoomDialog: () => <div data-testid="create-room-dialog" />,
}))

describe('RoomsRoute', () => {
  it('shows the rooms list and create dialog by default', () => {
    render(<RoomsRoute />)
    expect(screen.getByTestId('rooms-list')).toBeInTheDocument()
    expect(screen.getByTestId('create-room-dialog')).toBeInTheDocument()
  })
})
