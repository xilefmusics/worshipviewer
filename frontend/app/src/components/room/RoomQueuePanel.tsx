import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchSongsPage, type Song } from '@/api/list-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOnline } from '@/hooks/use-online'
import {
  addRoomQueueItem,
  promoteRoomQueueItem,
  type RoomQueueItem,
  type RoomSongPool,
} from '@/lib/room'
import { PLAYER_TOC_WIDTH_CLASS } from '@/lib/player/player-chrome'
import { cn } from '@/lib/utils'

function songTitle(song: Song): string {
  return song.data.titles?.find((title) => title.trim()) ?? song.id
}

type Props = {
  roomId: string
  queue: RoomQueueItem[]
  revision: number
  votedQueueIds: string[]
  canAdd: boolean
  canManage: boolean
  onVote: (queueId: string, upvoted: boolean) => void
  songPool?: RoomSongPool
  open?: boolean
  className?: string
}

export function RoomQueuePanel({
  roomId,
  queue,
  revision,
  votedQueueIds,
  canAdd,
  canManage,
  onVote,
  open = false,
  className,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const [search, setSearch] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingVote, setPendingVote] = useState<{ id: string; revision: number } | null>(null)
  const searchQuery = useQuery({
    queryKey: ['room-queue-song-search', roomId, search.trim(), open],
    enabled: canAdd && open && online && search.trim().length > 1,
    queryFn: ({ signal }) => fetchSongsPage(queryClient, { page: 0, q: search.trim(), signal }),
    staleTime: 30_000,
  })
  const queuedSongIds = new Set(queue.map((item) => item.song_id))
  const votedIds = new Set(votedQueueIds)

  const runMutation = async (id: string, action: () => Promise<void>, successKey: string) => {
    setPendingId(id)
    try {
      await action()
      toast.success(t(successKey))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('rooms.queue.failed'))
    } finally {
      setPendingId(null)
    }
  }

  const vote = (item: RoomQueueItem) => {
    if (pendingVote?.revision === revision) return
    setPendingVote({ id: item.id, revision })
    onVote(item.id, !votedIds.has(item.id))
  }

  return (
    <nav
      className={cn(
        'flex h-full min-h-0 min-w-0 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]',
        PLAYER_TOC_WIDTH_CLASS,
        className,
      )}
      aria-label={t('rooms.queue.title')}
    >
      <ul
        className="player-outline-list player-outline-list--fill"
        role="listbox"
        aria-label={t('rooms.queue.title')}
      >
        {queue.length === 0 ? (
          <li className="px-4 py-4 text-center text-xs text-[var(--color-muted-foreground)]">
            {t('rooms.queue.empty')}
          </li>
        ) : (
          queue.map((item, index) => {
            const upvoted = votedIds.has(item.id)
            return (
              <li key={item.id} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  role="option"
                  aria-label={t('rooms.queue.activate', { title: item.title, position: index + 1 })}
                  className="player-outline-list__item min-w-0 flex-1"
                  onClick={() => {
                    if (canManage) {
                      void runMutation(item.id, () => promoteRoomQueueItem(roomId, item.id, revision), 'rooms.queue.promoted')
                    }
                  }}
                >
                  {index + 1}. {item.title}
                </button>
                <button
                  type="button"
                  aria-pressed={upvoted}
                  aria-label={t(upvoted ? 'rooms.queue.removeUpvote' : 'rooms.queue.upvote', { title: item.title })}
                  disabled={(pendingVote?.id === item.id && pendingVote.revision === revision) || !online}
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs tabular-nums transition-colors',
                    upvoted
                      ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                  )}
                  onClick={() => vote(item)}
                >
                  <span aria-hidden>▲</span>
                  <span>{item.upvotes}</span>
                </button>
              </li>
            )
          })
        )}
      </ul>

      {canAdd && open ? (
        <div className="relative shrink-0 border-t border-[var(--color-border)] p-2">
          {searchQuery.isFetching ? (
            <p className="mb-2 px-2 text-xs text-[var(--color-muted-foreground)]">{t('common.load')}</p>
          ) : null}
          {searchQuery.error ? (
            <p className="mb-2 px-2 text-xs text-[var(--color-destructive)]">
              {t('rooms.queue.failed')}
            </p>
          ) : null}
          {searchQuery.data?.items.length ? (
            <ul className="mb-2 max-h-48 space-y-1 overflow-y-auto">
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
                      onClick={() => void runMutation(song.id, () => addRoomQueueItem(roomId, song.id, revision), 'rooms.queue.added')}
                    >
                      {duplicate ? t('rooms.queue.queued') : t('rooms.queue.add')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          ) : null}
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('rooms.queue.searchPlaceholder')}
            aria-label={t('rooms.queue.searchAria')}
          />
        </div>
      ) : null}
    </nav>
  )
}
