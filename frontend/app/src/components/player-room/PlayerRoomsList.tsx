import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  HUB_LIST_META_CLASS,
  HUB_LIST_ROW_BORDER_CLASS,
  HUB_LIST_ROW_SHELL_CLASS,
  HUB_LIST_SUBTITLE_CLASS,
  HUB_LIST_TITLE_CLASS,
} from '@/components/hub/hub-list-styles'
import {
  PlayerRoomJoinSheet,
} from '@/components/player-room/PlayerRoomJoinSheet'
import { playerRoomJoinModeChoiceToWire } from '@/lib/player-room-join-mode'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import {
  formatRoomDuration,
  joinPlayerRoom,
  listPlayerRooms,
  playerRoomShortName,
  roomSourceTypeLabel,
  useRoomElapsedSeconds,
  type PlayerRoomSummary,
} from '@/lib/player-room'
import { cn } from '@/lib/utils'

const tapFeedback = { scale: 0.985 }
const tapTransition = { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const }

function RoomListRow({
  room,
  onSelect,
}: {
  room: PlayerRoomSummary
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const elapsedSeconds = useRoomElapsedSeconds(room.created_at)
  const durationLabel = formatRoomDuration(elapsedSeconds)

  return (
    <motion.button
      type="button"
      className={cn(HUB_LIST_ROW_SHELL_CLASS, HUB_LIST_ROW_BORDER_CLASS, 'w-full border-0 bg-transparent text-left')}
      onClick={onSelect}
      whileTap={reduceMotion ? undefined : tapFeedback}
      transition={tapTransition}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
        <p className={HUB_LIST_TITLE_CLASS}>{playerRoomShortName(room)}</p>
        <div className="flex min-w-0 items-baseline gap-2">
          <p className={cn(HUB_LIST_SUBTITLE_CLASS, 'min-w-0 flex-1 truncate')}>
            {roomSourceTypeLabel(room.source_type, t)}
            {' · '}
            {room.host_email}
            {' · '}
            {t('playerRooms.listParticipants', { count: room.participant_count })}
          </p>
          <time
            dateTime={`PT${elapsedSeconds}S`}
            className={cn(HUB_LIST_META_CLASS, 'shrink-0 tabular-nums')}
          >
            {durationLabel}
          </time>
        </div>
      </div>
    </motion.button>
  )
}

export function PlayerRoomsList() {
  const { t } = useTranslation()
  const { debouncedQ, selectedTeamId } = useHubSearch()
  const online = useOnline()
  const [selected, setSelected] = useState<PlayerRoomSummary | null>(null)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const query = useQuery({
    queryKey: ['player-rooms', debouncedQ, selectedTeamId],
    queryFn: () => listPlayerRooms({ page: 0, q: debouncedQ, team: selectedTeamId ?? undefined }),
    enabled: online,
  })

  if (!online) return <p className="p-6 text-center">{t('playerRooms.onlineRequired')}</p>
  if (query.isPending) return <p className="p-6 text-center">{t('common.load')}</p>
  if (query.isError) {
    return <p className="p-6 text-center text-[var(--color-danger)]">{t('playerRooms.loadFailed')}</p>
  }

  return (
    <>
      <div className="flex flex-col gap-0 pb-4">
        {query.data.items.map((room) => (
          <RoomListRow
            key={room.id}
            room={room}
            onSelect={() => {
              setSelected(room)
              setChooserOpen(true)
            }}
          />
        ))}
      </div>
      {query.data.items.length === 0 ? (
        <p className="p-8 text-center text-[var(--color-muted-foreground)]">{t('playerRooms.empty')}</p>
      ) : null}
      {selected ? (
        <PlayerRoomJoinSheet
          sheetId={selected.id}
          title={playerRoomShortName(selected)}
          avOccupied={selected.av_occupied}
          open={chooserOpen}
          pending={pending}
          onOpenChange={(open) => {
            setChooserOpen(open)
            if (!open) {
              setPending(false)
              window.setTimeout(() => setSelected(null), 280)
            }
          }}
          onJoin={(choice) => {
            const { mode, hideChords } = playerRoomJoinModeChoiceToWire(choice)
            setPending(true)
            void joinPlayerRoom(selected.id, mode, hideChords)
              .then(() => window.location.assign(`/player/room/${encodeURIComponent(selected.id)}`))
              .catch(() => setPending(false))
          }}
        />
      ) : null}
    </>
  )
}
