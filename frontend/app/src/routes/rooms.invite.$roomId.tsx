import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { RoomLivePage } from '@/components/room/RoomLivePage'
import { readRoomCredentials } from '@/lib/room'

export const Route = createFileRoute('/rooms/invite/$roomId')({
  component: InviteLiveRoute,
})

function InviteLiveRoute() {
  const { t } = useTranslation()
  const { roomId } = Route.useParams()
  const credentials = readRoomCredentials(roomId)

  if (credentials) {
    return <RoomLivePage credentials={credentials} />
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <p>{t('rooms.missingCredentials')}</p>
    </main>
  )
}
