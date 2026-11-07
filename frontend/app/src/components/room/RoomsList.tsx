import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import { Button } from '@/components/ui/button'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import { useSession } from '@/hooks/useSession'
import { useTeamDetail } from '@/hooks/useTeamDetail'
import {
  deleteMessageRoom,
  listMessageRooms,
  type MessageRoomSummary,
  type RoomDisplayMode,
} from '@/lib/room-message-api'
import { cn } from '@/lib/utils'
import { getTeamDisplayName } from '@/lib/team-display-name'

export function RoomsList() {
  const { t } = useTranslation()
  const { debouncedQ, selectedTeamId } = useHubSearch()
  const online = useOnline()
  const queryClient = useQueryClient()
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MessageRoomSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(0)
  useEffect(() => {
    queueMicrotask(() => setPage(0))
  }, [debouncedQ, selectedTeamId])
  const query = useQuery({
    queryKey: ['rooms', debouncedQ, selectedTeamId, page],
    queryFn: () => listMessageRooms({ page, q: debouncedQ, team: selectedTeamId ?? undefined }),
    enabled: online,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const join = (room: MessageRoomSummary, mode: RoomDisplayMode) => {
    if (joiningId) return
    setJoiningId(room.id)
    window.location.assign(`/rooms/${encodeURIComponent(room.id)}?mode=${mode}`)
  }

  const remove = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteMessageRoom(deleteTarget.id)
      await queryClient.invalidateQueries({ queryKey: ['rooms'] })
    } catch {
      // The row is refreshed by the next query and remains available for retry.
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (!online) return <p className="p-6 text-center">{t('rooms.onlineRequired')}</p>
  if (query.isPending) return <p className="p-6 text-center">{t('common.load')}</p>
  if (query.isError) return <p className="p-6 text-center text-[var(--color-danger)]">{t('rooms.loadFailed')}</p>

  return (
    <>
      <ul className="flex flex-col gap-0 pb-4">
        {query.data.items.map((room) => (
          <RoomListItem
            key={room.id}
            room={room}
            joining={joiningId === room.id}
            onJoin={join}
            onDeleteRequest={setDeleteTarget}
          />
        ))}
      </ul>
      {query.data.items.length === 0 ? (
        <p className="p-8 text-center text-[var(--color-muted-foreground)]">{t('rooms.empty')}</p>
      ) : null}
      {query.data.total > 50 ? (
        <div className="flex items-center justify-center gap-3 px-4 pb-4">
          <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>{t('rooms.pagePrevious')}</Button>
          <span className="text-xs text-[var(--color-muted-foreground)]">{t('rooms.page', { page: page + 1, total: Math.ceil(query.data.total / 50) })}</span>
          <Button type="button" size="sm" variant="outline" disabled={(page + 1) * 50 >= query.data.total} onClick={() => setPage((value) => value + 1)}>{t('rooms.pageNext')}</Button>
        </div>
      ) : null}
      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rooms.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('rooms.deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]/90"
              onClick={(event) => { event.preventDefault(); void remove() }}
            >
              {deleting ? t('common.load') : t('rooms.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function RoomListItem({
  room,
  joining,
  onJoin,
  onDeleteRequest,
}: {
  room: MessageRoomSummary
  joining: boolean
  onJoin: (room: MessageRoomSummary, mode: RoomDisplayMode) => void
  onDeleteRequest: (room: MessageRoomSummary) => void
}) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const reduceMotion = useReducedMotion()
  const { data: team, isPending: teamPending, isError: teamError } = useTeamDetail(room.team_id)

  const teamLabel = useMemo(() => {
    if (teamPending) return null
    if (teamError || !team) return t('setlists.editor.teamUnavailable')
    return getTeamDisplayName(team, user?.id, t)
  }, [team, teamError, teamPending, t, user?.id])

  return (
    <li className={cn('flex items-center', HUB_LIST_ROW_BORDER_CLASS)}>
      <motion.div
        className={cn(HUB_LIST_ROW_SHELL_CLASS, 'min-w-0 flex-1')}
        role="button"
        tabIndex={0}
        aria-label={room.name}
        aria-disabled={joining}
        whileTap={reduceMotion ? undefined : { scale: 0.985 }}
        transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={() => onJoin(room, 'sheet')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onJoin(room, 'sheet')
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
          <h2 className={HUB_LIST_TITLE_CLASS}>{room.name}</h2>
          <p className={cn(HUB_LIST_SUBTITLE_CLASS, 'truncate')}>
            {t('rooms.roomSongCount', { count: room.song_count })}
            {teamLabel ? `, ${teamLabel}` : null}
          </p>
        </div>
      </motion.div>
      <HubActionsDrawer
        title={room.name}
        triggerAriaLabel={t('hub.actions.menuAria', { title: room.name })}
      >
        <HubActionItem disabled={joining} onSelect={() => onJoin(room, 'av')}>
          <OutputIcon size={16} className={HUB_ACTION_ICON_CLASS} />
          {t('rooms.joinAv')}
        </HubActionItem>
        <HubActionItem disabled={joining} onSelect={() => onJoin(room, 'slide')}>
          <ProjectorIcon size={16} className={HUB_ACTION_ICON_CLASS} />
          {t('rooms.joinSlide')}
        </HubActionItem>
        {room.can_delete ? (
          <>
            <HubActionSeparator />
            <HubActionItem
              destructive
              disabled={joining}
              onSelect={() => onDeleteRequest(room)}
            >
              <TrashIcon size={16} className="shrink-0" />
              {t('rooms.delete')}
            </HubActionItem>
          </>
        ) : null}
      </HubActionsDrawer>
    </li>
  )
}
