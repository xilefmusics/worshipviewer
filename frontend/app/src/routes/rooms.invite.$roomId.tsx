import { createFileRoute } from '@tanstack/react-router'

import { MessageRoomPage } from '@/components/room/MessageRoomPage'

export const Route = createFileRoute('/rooms/invite/$roomId')({ component: RoomInviteRoute })

function RoomInviteRoute() {
  const { roomId } = Route.useParams()
  return <MessageRoomPage roomId={roomId} />
}
