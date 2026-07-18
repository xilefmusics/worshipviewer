import { createFileRoute } from '@tanstack/react-router'
import { PlayerRoomsList } from '@/components/player-room/PlayerRoomsList'
export const Route = createFileRoute('/_hub/player-rooms')({ component: PlayerRoomsList })
