import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PlayerRoomLivePage } from '@/components/player-room/PlayerRoomLivePage'
import { readRoomCredentials } from '@/lib/player-room'

export const Route = createFileRoute('/player-rooms/invite/$roomId')({
  component: InviteLiveRoute,
})

function InviteLiveRoute() {
  const { t } = useTranslation()
  const { roomId } = Route.useParams()
  const credentials = readRoomCredentials(roomId)

  if (credentials) {
    return <PlayerRoomLivePage credentials={credentials} />
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <p>{t('playerRooms.missingCredentials')}</p>
    </main>
  )
}
