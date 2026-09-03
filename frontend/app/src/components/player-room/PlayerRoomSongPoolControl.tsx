import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchCollectionsPage, fetchSetlistsPage, type Collection, type Setlist } from '@/api/list-fetch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOnline } from '@/hooks/use-online'
import { getNextPageIndex } from '@/lib/list-pagination'
import {
  updatePlayerRoomSongPool,
  type PlayerRoomSongPool,
  type PlayerRoomSongPoolSelection,
} from '@/lib/player-room'

type Props = {
  roomId: string
  revision: number
  songPool?: PlayerRoomSongPool
  isHost: boolean
  className?: string
}

function selectionValue(pool: PlayerRoomSongPool): string {
  return pool.type === 'open' ? 'open' : `${pool.type}:${pool.id}`
}

function poolLabel(pool: PlayerRoomSongPool, t: (key: string, options?: Record<string, unknown>) => string): string {
  return pool.type === 'open' ? t('playerRooms.songPool.open') : pool.title
}

export function PlayerRoomSongPoolControl({ roomId, revision, songPool, isHost, className }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const currentPool = songPool ?? { type: 'open' as const }
  const [pending, setPending] = useState(false)
  const collectionsQuery = useInfiniteQuery({
    queryKey: ['player-room-song-pool-collections'],
    enabled: isHost && online,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: ({ pageParam, signal }) => fetchCollectionsPage(queryClient, { page: pageParam as number, q: '', signal }),
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
  const setlistsQuery = useInfiniteQuery({
    queryKey: ['player-room-song-pool-setlists'],
    enabled: isHost && online,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: ({ pageParam, signal }) => fetchSetlistsPage(queryClient, { page: pageParam as number, q: '', signal }),
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
  const {
    data: collectionsData,
    error: collectionsError,
    fetchNextPage: fetchNextCollectionsPage,
    hasNextPage: hasNextCollectionsPage,
    isFetchingNextPage: isFetchingNextCollectionsPage,
    isPending: isCollectionsPending,
  } = collectionsQuery
  const {
    data: setlistsData,
    error: setlistsError,
    fetchNextPage: fetchNextSetlistsPage,
    hasNextPage: hasNextSetlistsPage,
    isFetchingNextPage: isFetchingNextSetlistsPage,
    isPending: isSetlistsPending,
  } = setlistsQuery

  useEffect(() => {
    if (hasNextCollectionsPage && !isFetchingNextCollectionsPage) void fetchNextCollectionsPage()
  }, [fetchNextCollectionsPage, hasNextCollectionsPage, isFetchingNextCollectionsPage])

  useEffect(() => {
    if (hasNextSetlistsPage && !isFetchingNextSetlistsPage) void fetchNextSetlistsPage()
  }, [fetchNextSetlistsPage, hasNextSetlistsPage, isFetchingNextSetlistsPage])

  const collections = useMemo(
    () => (collectionsData?.pages ?? []).flatMap((page) => page.items) as Collection[],
    [collectionsData?.pages],
  )
  const setlists = useMemo(
    () => (setlistsData?.pages ?? []).flatMap((page) => page.items) as Setlist[],
    [setlistsData?.pages],
  )

  if (!isHost) {
    return (
      <div className={className}>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {t('playerRooms.songPool.label')}
        </p>
        <p className="mt-1 truncate text-sm">{poolLabel(currentPool, t)}</p>
      </div>
    )
  }

  const changePool = async (value: string) => {
    const [type, ...idParts] = value.split(':')
    let next: PlayerRoomSongPoolSelection
    if (type === 'collection' || type === 'setlist') {
      const id = idParts.join(':')
      if (!id) return
      next = { type, id } as PlayerRoomSongPoolSelection
    } else {
      next = { type: 'open' }
    }
    setPending(true)
    try {
      await updatePlayerRoomSongPool(roomId, next, revision)
      toast.success(t('playerRooms.songPool.updated'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('playerRooms.songPool.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={className}>
      <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]" htmlFor="player-room-song-pool">
        {t('playerRooms.songPool.label')}
      </label>
      <Select value={selectionValue(currentPool)} onValueChange={(value) => void changePool(value)} disabled={pending || !online}>
        <SelectTrigger id="player-room-song-pool" className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">{t('playerRooms.songPool.open')}</SelectItem>
          {collections.length ? (
            collections.map((collection) => (
              <SelectItem key={`collection:${collection.id}`} value={`collection:${collection.id}`}>
                {t('playerRooms.songPool.collectionOption', { title: collection.title })}
              </SelectItem>
            ))
          ) : null}
          {setlists.length ? (
            setlists.map((setlist) => (
              <SelectItem key={`setlist:${setlist.id}`} value={`setlist:${setlist.id}`}>
                {t('playerRooms.songPool.setlistOption', { title: setlist.title })}
              </SelectItem>
            ))
          ) : null}
        </SelectContent>
      </Select>
      {(isCollectionsPending || isSetlistsPending || isFetchingNextCollectionsPage || isFetchingNextSetlistsPage) ? (
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{t('common.load')}</p>
      ) : null}
      {collectionsError || setlistsError ? (
        <p className="mt-1 text-xs text-[var(--color-destructive)]">{t('playerRooms.songPool.loadFailed')}</p>
      ) : null}
    </div>
  )
}
