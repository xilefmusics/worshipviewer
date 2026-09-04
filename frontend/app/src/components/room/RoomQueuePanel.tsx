import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchSongsPage, type Song } from '@/api/list-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TocSidebar } from '@/components/player/TocSidebar'
import { useOnline } from '@/hooks/use-online'
import { getNextPageIndex } from '@/lib/list-pagination'
import {
  activateRoomPoolSong,
  addRoomQueueItem,
  fetchRoomPoolSongs,
  promoteRoomQueueItem,
  type RoomQueueItem,
  type RoomSongPool,
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
  songPool?: RoomSongPool
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

function itemForSong(song: Song): PlayerItem {
  return { type: 'chords', song: { ...song }, language: null, flow: null }
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
  songPool,
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
  const poolQuery = useInfiniteQuery({
    queryKey: ['room-song-pool-songs', roomId, songPool?.type, songPool?.id],
    enabled: canAdd && online && songPool != null,
    initialPageParam: 0,
    staleTime: 30_000,
    queryFn: ({ pageParam, signal }) => fetchRoomPoolSongs(roomId, { page: pageParam as number, q: '', signal }),
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = poolQuery

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const poolSongs = useMemo(() => (poolQuery.data?.pages ?? []).flatMap((page) => page.items), [poolQuery.data?.pages])
  const likedBySongId = useMemo(() => new Map(poolSongs.map((song) => [song.id, song.user_specific_addons.liked])), [poolSongs])
  const queuedBySongId = useMemo(() => new Map(queue.map((item) => [item.song_id, item])), [queue])
  const queuedSongIds = useMemo(() => new Set(queue.map((item) => item.song_id)), [queue])
  const orderSongs = useMemo(() => {
    const queuedSongs: QueueDisplaySong[] = queue.map((item) => ({
      id: item.song_id,
      song: item.song.song,
      liked: likedBySongId.get(item.song_id) ?? false,
      title: item.title,
      played: item.played === true,
    }))
    const seen = new Set(queuedSongs.map((song) => song.id))
    const poolOnly: QueueDisplaySong[] = []
    for (const song of poolSongs) {
      if (seen.has(song.id)) continue
      seen.add(song.id)
      poolOnly.push({ id: song.id, song, liked: song.user_specific_addons.liked, title: songTitle(song), played: false })
    }
    return [
      ...queuedSongs.filter((song) => !song.played),
      ...poolOnly,
      ...queuedSongs.filter((song) => song.played),
    ]
  }, [likedBySongId, poolSongs, queue])
  const poolModeSongs = useMemo(
    () => poolSongs.map((song) => ({
      id: song.id,
      song,
      liked: song.user_specific_addons.liked,
      title: songTitle(song),
      played: queuedBySongId.get(song.id)?.played === true,
    })),
    [poolSongs, queuedBySongId],
  )
  const visibleSongs = mode === 'order' ? orderSongs : poolModeSongs
  const toc = useMemo(() => visibleSongs.map((song, index) => tocForSong({ ...song.song, user_specific_addons: { ...song.song.user_specific_addons, liked: song.liked } }, index)), [visibleSongs])
  const items = useMemo(() => visibleSongs.map((song) => {
    const queued = queuedBySongId.get(song.id)
    return queued ? itemForQueue(queued, song.liked) : itemForSong({ ...song.song, user_specific_addons: { ...song.song.user_specific_addons, liked: song.liked } })
  }), [queuedBySongId, visibleSongs])
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

  const showPoolStatus = poolQuery.isFetching || Boolean(poolQuery.error)
  const footer = canAdd && (open || showPoolStatus) ? (
    <div className="relative shrink-0 border-t border-[var(--color-border)] p-2">
      {poolQuery.isFetching || searchQuery.isFetching ? <p className="mb-2 px-2 text-xs text-[var(--color-muted-foreground)]">{t('common.load')}</p> : null}
      {poolQuery.error || searchQuery.error ? <p className="mb-2 px-2 text-xs text-[var(--color-destructive)]">{t('rooms.queue.failed')}</p> : null}
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
      activeLanguageIds={activeLanguageIds}
      onLanguageIdsChange={(ids) => setActiveLanguageIds(new Set(ids))}
      activeTagIds={activeTagIds}
      onTagIdsChange={(ids) => setActiveTagIds(new Set(ids))}
      onSelect={(sourceIdx) => {
        if (!canManage) return
        const songId = toc[sourceIdx]?.id
        if (!songId) return
        const queued = queuedBySongId.get(songId)
        void runMutation(songId, () => queued
          ? promoteRoomQueueItem(roomId, queued.id, revision)
          : activateRoomPoolSong(roomId, songId, revision), 'rooms.queue.promoted')
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
      emptyMessage={mode === 'order' && !songPool && queue.length === 0 ? t('rooms.queue.empty') : undefined}
      footer={footer}
      className={className}
      ariaLabel={t('rooms.queue.title')}
    />
  )
}
