import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import {
  deleteMessageRoom,
  listMessageRooms,
  setRoomDebugOptionsEnabled,
  roomDebugOptionsEnabled,
  type MessageRoomSummary,
  type RoomDisplayMode,
} from '@/lib/room-message-api'

export function RoomsList() {
  const { t } = useTranslation()
  const { debouncedQ, selectedTeamId } = useHubSearch()
  const online = useOnline()
  const queryClient = useQueryClient()
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MessageRoomSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [debugEnabled, setDebugEnabled] = useState(roomDebugOptionsEnabled)
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
      <div className="flex items-center justify-end px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <input
            type="checkbox"
            checked={debugEnabled}
            onChange={(event) => {
              setDebugEnabled(event.target.checked)
              setRoomDebugOptionsEnabled(event.target.checked)
            }}
          />
          {t('rooms.debugOptions')}
        </label>
      </div>
      <ul className="flex flex-col gap-0 pb-4">
        {query.data.items.map((room) => (
          <li key={room.id} className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{room.name}</h2>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                {t('rooms.roomSongCount', { count: room.song_count })} · {new Date(room.created_at).toLocaleString()}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={joiningId === room.id} onClick={() => void join(room, 'sheet')}>
              {t('rooms.join')}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={joiningId === room.id} onClick={() => void join(room, 'av')}>
              AV
            </Button>
            {room.can_delete ? (
              <Button type="button" size="sm" variant="ghost" disabled={joiningId === room.id} onClick={() => setDeleteTarget(room)}>
                {t('rooms.delete')}
              </Button>
            ) : null}
          </li>
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
