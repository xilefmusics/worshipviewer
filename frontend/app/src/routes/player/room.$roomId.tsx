import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PlayerRoomLivePage } from '@/components/player-room/PlayerRoomLivePage'
import { readRoomCredentials } from '@/lib/player-room'

export const Route = createFileRoute('/player/room/$roomId')({ component: PlayerRoomRoute })
function PlayerRoomRoute() { const { t } = useTranslation(); const { roomId } = Route.useParams(); const credentials = readRoomCredentials(roomId); return credentials ? <PlayerRoomLivePage credentials={credentials} /> : <main className="p-6">{t('playerRooms.missingCredentials')}</main> }
