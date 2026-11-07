import { createFileRoute } from '@tanstack/react-router'

import { MessageRoomPage } from '@/components/room/MessageRoomPage'

export const Route = createFileRoute('/rooms/$roomId')({
  validateSearch: (search: Record<string, unknown>) => ({ mode: search.mode === 'av' ? 'av' as const : 'sheet' as const }),
  component: RoomRoute,
})

function RoomRoute() {
  const { roomId } = Route.useParams()
  const { mode } = Route.useSearch()
  return <MessageRoomPage roomId={roomId} initialMode={mode} />
}
