import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PlayerRoomJoinSheet,
} from '@/components/player-room/PlayerRoomJoinSheet'
import { playerRoomJoinModeChoiceToWire } from '@/lib/player-room-join-mode'
import { UsersIcon } from '@/components/icons/lucide-animated/users-icon'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import {
  joinPlayerRoom,
  listPlayerRooms,
  playerRoomShortName,
  type PlayerRoomSummary,
} from '@/lib/player-room'
import { cn } from '@/lib/utils'

const tapFeedback = { scale: 0.985 }
const tapTransition = { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const }

export function HubPlayerRoomJoinPrompt() {
  const { t } = useTranslation()
  const online = useOnline()
  const reduceMotion = useReducedMotion()
  const { selectedTeamId } = useHubSearch()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [hovered, setHovered] = useState(false)

  const query = useQuery({
    queryKey: ['player-rooms', 'footer-prompt', selectedTeamId ?? 'all'],
    queryFn: () => listPlayerRooms({ page: 0, team: selectedTeamId ?? undefined }),
    enabled: online,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const room = useMemo<PlayerRoomSummary | null>(() => query.data?.items[0] ?? null, [query.data?.items])

  if (!online || !room) return null

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-2 flex justify-center">
        <motion.button
          type="button"
          className={cn(
            'pointer-events-auto flex w-full max-w-full items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2',
            'shadow-[var(--shadow-elevated)] transition-colors hover:bg-[var(--color-muted)]/40',
          )}
          aria-label={t('playerRooms.footerJoinAria', { title: playerRoomShortName(room) })}
          onClick={() => setSheetOpen(true)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          whileTap={reduceMotion ? undefined : tapFeedback}
          transition={tapTransition}
        >
          <UsersIcon className="size-4 shrink-0 text-[var(--color-muted-foreground)]" isHovered={hovered} size={16} />
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--color-foreground)]">
            {playerRoomShortName(room)}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-foreground)]">
            {t('playerRooms.join')}
          </span>
        </motion.button>
      </div>
      <PlayerRoomJoinSheet
        sheetId={room.id}
        title={playerRoomShortName(room)}
        avOccupied={room.av_occupied}
        open={sheetOpen}
        pending={pending}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setPending(false)
        }}
        onJoin={(choice) => {
          const { mode, hideChords } = playerRoomJoinModeChoiceToWire(choice)
          setPending(true)
          void joinPlayerRoom(room.id, mode, hideChords)
            .then(() => window.location.assign(`/player/room/${encodeURIComponent(room.id)}`))
            .catch(() => setPending(false))
        }}
      />
    </>
  )
}
