import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  endPlayerRoom,
  formatRoomDuration,
  joinPlayerRoom,
  listPlayerRooms,
  playerRoomShortName,
  roomSourceTypeLabel,
  useRoomElapsedSeconds,
  type PlayerRoomSummary,
} from '@/lib/player-room'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const tapFeedback = { scale: 0.985 }
const tapTransition = { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const }

function RoomListRow({
  room,
  onSelect,
  onClose,
  closing,
}: {
  room: PlayerRoomSummary
  onSelect: () => void
  onClose: () => void
  closing: boolean
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const elapsedSeconds = useRoomElapsedSeconds(room.created_at)
  const durationLabel = formatRoomDuration(elapsedSeconds)

  return (
    <div className={cn(HUB_LIST_ROW_SHELL_CLASS, HUB_LIST_ROW_BORDER_CLASS, 'w-full gap-3')}>
      <motion.button
        type="button"
        className="min-w-0 flex-1 border-0 bg-transparent text-left"
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
      {room.can_close ? (
        <Button type="button" variant="destructive" size="sm" disabled={closing} onClick={onClose}>
          {t('playerRooms.end')}
        </Button>
      ) : null}
    </div>
  )
}

export function PlayerRoomsList() {
  const { t } = useTranslation()
  const { debouncedQ, selectedTeamId } = useHubSearch()
  const online = useOnline()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<PlayerRoomSummary | null>(null)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['player-rooms', debouncedQ, selectedTeamId],
    queryFn: () => listPlayerRooms({ page: 0, q: debouncedQ, team: selectedTeamId ?? undefined }),
    enabled: online,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
            closing={closingId === room.id}
            onSelect={() => {
              setSelected(room)
              setChooserOpen(true)
            }}
            onClose={() => {
              setClosingId(room.id)
              void endPlayerRoom(room.id)
                .then(() => queryClient.invalidateQueries({ queryKey: ['player-rooms'] }))
                .catch(() => undefined)
                .finally(() => setClosingId(null))
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
