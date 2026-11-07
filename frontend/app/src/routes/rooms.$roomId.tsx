import { createFileRoute } from '@tanstack/react-router'

import { MessageRoomPage } from '@/components/room/MessageRoomPage'

export const Route = createFileRoute('/rooms/$roomId')({
  validateSearch: (search: Record<string, unknown>) => {
    const mode: 'av' | 'slide' | 'sheet' =
      search.mode === 'av' || search.mode === 'slide' ? search.mode : 'sheet'
    return { mode }
  },
  component: RoomRoute,
})

function RoomRoute() {
  const { roomId } = Route.useParams()
  const { mode } = Route.useSearch()
  return <MessageRoomPage roomId={roomId} initialMode={mode} />
}
