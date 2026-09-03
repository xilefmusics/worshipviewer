import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { RoomLivePage } from '@/components/room/RoomLivePage'
import { readRoomCredentials } from '@/lib/room'

export const Route = createFileRoute('/rooms/$roomId')({ component: RoomRoute })
function RoomRoute() { const { t } = useTranslation(); const { roomId } = Route.useParams(); const credentials = readRoomCredentials(roomId); return credentials ? <RoomLivePage credentials={credentials} /> : <main className="p-6">{t('rooms.missingCredentials')}</main> }
