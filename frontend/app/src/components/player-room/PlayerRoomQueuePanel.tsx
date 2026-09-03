import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchSongsPage, type Song } from '@/api/list-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOnline } from '@/hooks/use-online'
import {
  addPlayerRoomQueueItem,
  promotePlayerRoomQueueItem,
  removePlayerRoomQueueItem,
  reorderPlayerRoomQueue,
  fetchPlayerRoomPoolSongs,
  type PlayerRoomSongPool,
  type PlayerRoomQueueItem,
} from '@/lib/player-room'
import { cn } from '@/lib/utils'

function songTitle(song: Song): string {
  return song.data.titles?.find((title) => title.trim()) ?? song.id
}

type Props = {
  roomId: string
  queue: PlayerRoomQueueItem[]
  revision: number
  canAdd: boolean
  canManage: boolean
  songPool?: PlayerRoomSongPool
  className?: string
}

export function PlayerRoomQueuePanel({
  roomId,
  queue,
  revision,
  canAdd,
  canManage,
  songPool,
  className,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const [search, setSearch] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const searchQuery = useQuery({
    queryKey: ['player-room-queue-song-search', roomId, search.trim(), songPool],
    enabled: canAdd && online && search.trim().length > 1,
    queryFn: ({ signal }) => songPool && songPool.type !== 'open'
      ? fetchPlayerRoomPoolSongs(roomId, { page: 0, q: search.trim(), signal })
      : fetchSongsPage(queryClient, { page: 0, q: search.trim(), signal }),
    staleTime: 30_000,
  })
  const queuedSongIds = new Set(queue.map((item) => item.song_id))

  const runMutation = async (id: string, action: () => Promise<void>, successKey: string) => {
    setPendingId(id)
    try {
      await action()
      toast.success(t(successKey))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('playerRooms.queue.failed'))
    } finally {
      setPendingId(null)
    }
  }

  const move = (index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= queue.length) return
    const ids = queue.map((item) => item.id)
    const moved = ids[index]!
    ids[index] = ids[target]!
    ids[target] = moved
    void runMutation(`reorder-${index}`, () => reorderPlayerRoomQueue(roomId, ids, revision), 'playerRooms.queue.updated')
  }

  return (
    <section
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      )}
      aria-label={t('playerRooms.queue.title')}
    >
      <header className="shrink-0 border-b border-[var(--color-border)] p-3">
        <h2 className="text-sm font-semibold">{t('playerRooms.queue.title')}</h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          {songPool && songPool.type !== 'open'
            ? t('playerRooms.queue.restrictedDescription', { title: songPool.title })
            : t('playerRooms.queue.description')}
        </p>
        {canAdd ? (
          <div className="mt-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('playerRooms.queue.searchPlaceholder')}
              aria-label={t('playerRooms.queue.searchAria')}
            />
            {searchQuery.isFetching ? (
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{t('common.load')}</p>
            ) : null}
            {searchQuery.error ? (
              <p className="mt-2 text-xs text-[var(--color-destructive)]">
                {searchQuery.error instanceof Error && searchQuery.error.message === 'song_pool_unavailable'
                  ? t('playerRooms.songPool.unavailable')
                  : t('playerRooms.queue.failed')}
              </p>
            ) : null}
            {searchQuery.data?.items.length ? (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {searchQuery.data.items.filter((song) => !song.not_a_song).map((song) => {
                  const duplicate = queuedSongIds.has(song.id)
                  return (
                    <li key={song.id} className="flex items-center gap-2 rounded-md bg-[var(--color-muted)] px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs">{songTitle(song)}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={duplicate || pendingId === song.id}
                        onClick={() => void runMutation(song.id, () => addPlayerRoomQueueItem(roomId, song.id, revision), 'playerRooms.queue.added')}
                      >
                        {duplicate ? t('playerRooms.queue.queued') : t('playerRooms.queue.add')}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {queue.length === 0 ? (
          <p className="p-2 text-sm text-[var(--color-muted-foreground)]">{t('playerRooms.queue.empty')}</p>
        ) : (
          <ol className="space-y-1">
            {queue.map((item, index) => (
              <li key={item.id} className="rounded-md border border-[var(--color-border)] p-2">
                <div className="flex items-start gap-2">
                  <span className="w-5 shrink-0 text-xs tabular-nums text-[var(--color-muted-foreground)]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {t('playerRooms.queue.addedBy', { name: item.added_by })}
                    </p>
                  </div>
                </div>
                {canManage ? (
                  <div className="mt-2 flex flex-wrap gap-1 pl-7">
                    <Button type="button" size="sm" disabled={pendingId === item.id} onClick={() => void runMutation(item.id, () => promotePlayerRoomQueueItem(roomId, item.id, revision), 'playerRooms.queue.promoted')}>
                      {t('playerRooms.queue.playNext')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={index === 0 || pendingId != null} onClick={() => move(index, -1)}>
                      ↑
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={index === queue.length - 1 || pendingId != null} onClick={() => move(index, 1)}>
                      ↓
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={pendingId === item.id} onClick={() => void runMutation(item.id, () => removePlayerRoomQueueItem(roomId, item.id, revision), 'playerRooms.queue.removed')}>
                      {t('playerRooms.queue.remove')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
