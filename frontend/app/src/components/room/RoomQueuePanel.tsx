import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchSongsPage, type Song } from '@/api/list-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TocSidebar } from '@/components/player/TocSidebar'
import { useOnline } from '@/hooks/use-online'
import {
  addRoomQueueItem,
  fetchRoomQueueLikes,
  promoteRoomQueueItem,
  type RoomQueueItem,
} from '@/lib/room'
import type { TocDisplayMode } from '@/lib/player/toc-display'
import type { components } from '@/api/schema'
import { cn } from '@/lib/utils'

type Props = {
  roomId: string
  queue: RoomQueueItem[]
  revision: number
  votedQueueIds: string[]
  canAdd: boolean
  canManage: boolean
  onVote: (queueId: string, upvoted: boolean) => void
  open?: boolean
  currentSongId?: string | null
  className?: string
}

type PlayerItem = components['schemas']['PlayerItem']
type TocItem = components['schemas']['TocItem']
type QueueDisplaySong = { id: string; song: Song; liked: boolean; title: string; played: boolean }

function songTitle(song: Song): string {
  return song.data.titles?.find((title) => title.trim()) ?? song.id
}

function tocForSong(song: Song, index: number): TocItem {
  return {
    idx: index,
    nr: String(index + 1),
    title: songTitle(song),
    id: song.id,
    liked: song.user_specific_addons.liked,
  }
}

function itemForQueue(queueItem: RoomQueueItem, liked: boolean): PlayerItem {
  return {
    type: 'chords',
    song: { ...queueItem.song.song, user_specific_addons: { ...queueItem.song.song.user_specific_addons, liked } },
    language: queueItem.song.language,
    flow: queueItem.song.flow,
  }
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
  currentSongId,
  className,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const [search, setSearch] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingVote, setPendingVote] = useState<{ id: string; revision: number } | null>(null)
  const [mode, setMode] = useState<TocDisplayMode>('order')
  const [activeLanguageIds, setActiveLanguageIds] = useState<Set<string>>(new Set())
  const [activeTagIds, setActiveTagIds] = useState<Set<string>>(new Set())
  const searchQuery = useQuery({
    queryKey: ['room-queue-song-search', roomId, search.trim(), open],
    enabled: canAdd && open && online && search.trim().length > 1,
    queryFn: ({ signal }) => fetchSongsPage(queryClient, { page: 0, q: search.trim(), signal }),
    staleTime: 30_000,
  })
  const queueLikesQuery = useQuery({
    queryKey: ['room-queue-liked-song-ids', roomId, queue.map((item) => item.song_id).join(',')],
    enabled: canAdd && online && queue.length > 0,
    staleTime: 30_000,
    queryFn: ({ signal }) => fetchRoomQueueLikes(roomId, { signal }),
  })
  const likedSongIds = useMemo(() => new Set(queueLikesQuery.data?.song_ids ?? []), [queueLikesQuery.data?.song_ids])
  const queuedBySongId = useMemo(() => new Map(queue.map((item) => [item.song_id, item])), [queue])
  const queuedSongIds = useMemo(() => new Set(queue.map((item) => item.song_id)), [queue])
  const visibleSongs = useMemo(() => queue.map((item): QueueDisplaySong => ({
      id: item.song_id,
      song: item.song.song,
      liked: likedSongIds.has(item.song_id),
      title: item.title,
      played: item.played === true,
    })), [likedSongIds, queue])
  const toc = useMemo(() => visibleSongs.map((song, index) => tocForSong({ ...song.song, user_specific_addons: { ...song.song.user_specific_addons, liked: song.liked } }, index)), [visibleSongs])
  const items = useMemo(() => visibleSongs.map((song) => itemForQueue(queuedBySongId.get(song.id)!, song.liked)), [queuedBySongId, visibleSongs])
  const votedIds = useMemo(() => new Set(votedQueueIds), [votedQueueIds])

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

  const footer = canAdd && open ? (
    <div className="relative shrink-0 border-t border-[var(--color-border)] p-2">
      {searchQuery.isFetching ? <p className="mb-2 px-2 text-xs text-[var(--color-muted-foreground)]">{t('common.load')}</p> : null}
      {searchQuery.error ? <p className="mb-2 px-2 text-xs text-[var(--color-destructive)]">{t('rooms.queue.failed')}</p> : null}
      {searchQuery.data?.items.length ? (
        <ul className="mb-2 max-h-48 space-y-1 overflow-y-auto">
          {searchQuery.data.items.filter((song) => !song.not_a_song).map((song) => {
            const duplicate = queuedSongIds.has(song.id)
            return (
              <li key={song.id} className="flex items-center gap-2 rounded-md bg-[var(--color-muted)] px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs">{songTitle(song)}</span>
                <Button type="button" size="sm" variant="outline" disabled={duplicate || pendingId === song.id} onClick={() => void runMutation(song.id, () => addRoomQueueItem(roomId, song.id, revision), 'rooms.queue.added')}>
                  {duplicate ? t('rooms.queue.queued') : t('rooms.queue.add')}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('rooms.queue.searchPlaceholder')} aria-label={t('rooms.queue.searchAria')} />
    </div>
  ) : null

  return (
    <TocSidebar
      toc={toc}
      items={items}
      mode={mode}
      onModeChange={setMode}
      displayModes={canAdd ? undefined : ['order', 'alphabetical']}
      activeLanguageIds={activeLanguageIds}
      onLanguageIdsChange={(ids) => setActiveLanguageIds(new Set(ids))}
      activeTagIds={activeTagIds}
      onTagIdsChange={(ids) => setActiveTagIds(new Set(ids))}
      onSelect={(sourceIdx) => {
        if (!canManage) return
        const songId = toc[sourceIdx]?.id
        if (!songId) return
        const queued = queuedBySongId.get(songId)
        if (queued) void runMutation(songId, () => promoteRoomQueueItem(roomId, queued.id, revision), 'rooms.queue.promoted')
      }}
      currentLanguageIndex={null}
      isEntryActive={(entry) => toc[entry.sourceIdx]?.id === currentSongId}
      getRowAriaLabel={(entry) => t('rooms.queue.activate', { title: entry.title, position: entry.sourceIdx + 1 })}
      renderSeparatorBefore={(entry, previousEntry, visibleEntries) => {
        if (mode !== 'order' || visibleSongs[entry.sourceIdx]?.played !== true) return null
        const hasUpcoming = visibleEntries.some((row) => visibleSongs[row.sourceIdx]?.played !== true)
        const hasPlayed = visibleEntries.some((row) => visibleSongs[row.sourceIdx]?.played === true)
        if (!hasUpcoming || !hasPlayed || visibleSongs[previousEntry?.sourceIdx ?? -1]?.played === true) return null
        return (
          <li
            role="separator"
            aria-label={t('rooms.queue.alreadyPlayed')}
            className="mx-2 my-2 flex items-center gap-2 px-2 text-xs text-[var(--color-muted-foreground)]"
          >
            <span aria-hidden className="h-px flex-1 bg-[var(--color-border)]" />
            <span>{t('rooms.queue.alreadyPlayed')}</span>
            <span aria-hidden className="h-px flex-1 bg-[var(--color-border)]" />
          </li>
        )
      }}
      renderRowSuffix={(entry) => {
        const queued = queuedBySongId.get(toc[entry.sourceIdx]?.id ?? '')
        if (!queued) return null
        const upvoted = votedIds.has(queued.id)
        return (
          <button
            type="button"
            aria-pressed={upvoted}
            aria-label={t(upvoted ? 'rooms.queue.removeUpvote' : 'rooms.queue.upvote', { title: entry.title })}
            disabled={(pendingVote?.id === queued.id && pendingVote.revision === revision) || !online}
            className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs tabular-nums transition-colors', upvoted ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]')}
            onClick={() => vote(queued)}
          >
            <span aria-hidden>▲</span><span>{queued.upvotes}</span>
          </button>
        )
      }}
      emptyMessage={mode === 'order' && queue.length === 0 ? t('rooms.queue.empty') : undefined}
      footer={footer}
      className={className}
      ariaLabel={t('rooms.queue.title')}
    />
  )
}
