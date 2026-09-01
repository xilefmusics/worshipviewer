import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { CreatePlayerRoomDialog } from '@/components/player-room/CreatePlayerRoomDialog'
import { PlayerRoomsList } from '@/components/player-room/PlayerRoomsList'
import { useWritableTeams } from '@/hooks/useWritableTeams'

export const Route = createFileRoute('/_hub/player-rooms')({ component: PlayerRoomsRoute })

function PlayerRoomsRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const { teams, user } = useWritableTeams('playerRoomCreate')

  useEffect(() => {
    const raw = (location.search as Record<string, unknown>).new
    if (raw !== '1' && raw !== 1) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latch the hub FAB query state into the dialog
    setCreateOpen(true)
    void navigate({ to: '/player-rooms', replace: true })
  }, [location.search, navigate])

  return (
    <>
      <PlayerRoomsList />
      <CreatePlayerRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        teams={teams}
        userId={user?.id}
        onCreated={(roomId) => {
          window.location.assign(`/player/room/${encodeURIComponent(roomId)}`)
        }}
      />
    </>
  )
}
