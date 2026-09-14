import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FileTextIcon } from '@/components/icons/lucide-animated/file-text-icon'
import { OutputIcon } from '@/components/icons/lucide-animated/output-icon'
import { ProjectorIcon } from '@/components/icons/lucide-animated/projector-icon'
import { TrashIcon } from '@/components/icons/lucide-animated/trash-icon'
import {
  HUB_ACTION_ICON_CLASS,
  HubActionItem,
  HubActionSeparator,
  HubActionsDrawer,
} from '@/components/hub/HubActionsDrawer'
import {
  HUB_LIST_META_CLASS,
  HUB_LIST_ROW_BORDER_CLASS,
  HUB_LIST_ROW_SHELL_CLASS,
  HUB_LIST_SUBTITLE_CLASS,
  HUB_LIST_TITLE_CLASS,
} from '@/components/hub/hub-list-styles'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import { writeHideChordsPreference } from '@/lib/hide-chords-preference'
import { roomJoinModeChoiceToWire, type RoomJoinModeChoice } from '@/lib/room-join-mode'
import {
  endRoom,
  formatRoomDuration,
  joinRoom,
  listRooms,
  roomShortName,
  useRoomElapsedSeconds,
  type RoomSummary,
} from '@/lib/room'
import { cn } from '@/lib/utils'

const tapFeedback = { scale: 0.985 }
const tapTransition = { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const }
const ROOM_JOIN_CHOICES: RoomJoinModeChoice[] = ['chords', 'text', 'av', 'slide']

function RoomJoinModeIcon({ mode, isHovered }: { mode: RoomJoinModeChoice; isHovered: boolean }) {
  if (mode === 'av') {
    return <OutputIcon isHovered={isHovered} size={16} className={HUB_ACTION_ICON_CLASS} />
  }
  if (mode === 'slide') {
    return <ProjectorIcon isHovered={isHovered} size={16} className={HUB_ACTION_ICON_CLASS} />
  }
  return <FileTextIcon isHovered={isHovered} size={16} className={HUB_ACTION_ICON_CLASS} />
}

function RoomListRow({
  room,
  onJoin,
  onClose,
  joining,
  closing,
}: {
  room: RoomSummary
  onJoin: (choice: RoomJoinModeChoice) => void
  onClose: () => void
  joining: boolean
  closing: boolean
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const elapsedSeconds = useRoomElapsedSeconds(room.created_at)
  const durationLabel = formatRoomDuration(elapsedSeconds)
  const [itemHot, setItemHot] = useState<RoomJoinModeChoice | 'close' | null>(null)
  const hover = (key: RoomJoinModeChoice | 'close') => (hot: boolean) =>
    setItemHot(hot ? key : null)

  return (
    <div className={cn(HUB_LIST_ROW_SHELL_CLASS, HUB_LIST_ROW_BORDER_CLASS, 'w-full cursor-default gap-3')}>
      <motion.button
        type="button"
        className="min-w-0 flex-1 border-0 bg-transparent text-left"
        disabled={joining}
        onClick={() => onJoin('chords')}
        whileTap={reduceMotion ? undefined : tapFeedback}
        transition={tapTransition}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
          <p className={HUB_LIST_TITLE_CLASS}>{roomShortName(room)}</p>
          <div className="flex min-w-0 items-baseline gap-2">
            <p className={cn(HUB_LIST_SUBTITLE_CLASS, 'min-w-0 flex-1 truncate')}>
              {room.host_email}
              {' · '}
              {t('rooms.listSessions', { count: room.session_count })}
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
      <HubActionsDrawer
        title={roomShortName(room)}
        triggerAriaLabel={t('hub.actions.menuAria', { title: roomShortName(room) })}
      >
        <div role="group" aria-label={t('rooms.join')}>
          <div className="px-2 pb-1 text-xs font-semibold text-[var(--color-muted-foreground)]">
            {t('rooms.join')}
          </div>
          {ROOM_JOIN_CHOICES.map((mode) => {
            const disabled = joining || (mode === 'av' && room.av_occupied)
            return (
              <HubActionItem
                key={mode}
                disabled={disabled}
                title={mode === 'av' && room.av_occupied ? t('rooms.avOccupied') : undefined}
                onSelect={() => onJoin(mode)}
                onHoverChange={hover(mode)}
              >
                <RoomJoinModeIcon mode={mode} isHovered={itemHot === mode} />
                {t(`rooms.mode.${mode}`)}
              </HubActionItem>
            )
          })}
        </div>
        {room.can_close ? (
          <>
            <HubActionSeparator />
            <div role="group" aria-label={t('hub.actions.general')}>
              <div className="px-2 pb-1 pt-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
                {t('hub.actions.general')}
              </div>
              <HubActionItem
                destructive
                disabled={joining || closing}
                onSelect={onClose}
                onHoverChange={hover('close')}
              >
                <TrashIcon isHovered={itemHot === 'close'} size={16} className="shrink-0" />
                {t('rooms.end')}
              </HubActionItem>
            </div>
          </>
        ) : null}
      </HubActionsDrawer>
    </div>
  )
}

export function RoomsList() {
  const { t } = useTranslation()
  const { debouncedQ, selectedTeamId } = useHubSearch()
  const online = useOnline()
  const queryClient = useQueryClient()
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [closeTarget, setCloseTarget] = useState<RoomSummary | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['rooms', debouncedQ, selectedTeamId],
    queryFn: () => listRooms({ page: 0, q: debouncedQ, team: selectedTeamId ?? undefined }),
    enabled: online,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const join = (room: RoomSummary, choice: RoomJoinModeChoice) => {
    if (joiningId != null || (choice === 'av' && room.av_occupied)) return
    const { mode, hideChords } = roomJoinModeChoiceToWire(choice)
    if (choice === 'chords' || choice === 'text') {
      writeHideChordsPreference(hideChords)
    }
    setJoiningId(room.id)
    void joinRoom(room.id, mode, hideChords)
      .then(() => window.location.assign(`/rooms/${encodeURIComponent(room.id)}`))
      .catch(() => setJoiningId(null))
  }

  const close = (room: RoomSummary) => {
    if (closingId != null || joiningId != null) return
    setCloseTarget(room)
  }

  const confirmClose = () => {
    if (!closeTarget || closingId != null) return
    const room = closeTarget
    setClosingId(room.id)
    void endRoom(room.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['rooms'] }))
      .catch(() => undefined)
      .finally(() => {
        setClosingId(null)
        setCloseTarget(null)
      })
  }

  if (!online) return <p className="p-6 text-center">{t('rooms.onlineRequired')}</p>
  if (query.isPending) return <p className="p-6 text-center">{t('common.load')}</p>
  if (query.isError) {
    return <p className="p-6 text-center text-[var(--color-danger)]">{t('rooms.loadFailed')}</p>
  }

  return (
    <>
      <div className="flex flex-col gap-0 pb-4">
        {query.data.items.map((room) => (
          <RoomListRow
            key={room.id}
            room={room}
            joining={joiningId != null}
            closing={closingId === room.id}
            onJoin={(choice) => join(room, choice)}
            onClose={() => close(room)}
          />
        ))}
      </div>
      {query.data.items.length === 0 ? (
        <p className="p-8 text-center text-[var(--color-muted-foreground)]">{t('rooms.empty')}</p>
      ) : null}
      <AlertDialog
        open={closeTarget != null}
        onOpenChange={(open) => {
          if (!open && closingId == null) setCloseTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rooms.closeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('rooms.closeConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closingId != null}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={closingId != null}
              className="bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]/90"
              onClick={(event) => {
                event.preventDefault()
                confirmClose()
              }}
            >
              {closingId != null ? t('common.load') : t('rooms.closeConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
