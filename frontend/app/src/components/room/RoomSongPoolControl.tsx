import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchCollectionsPage, fetchSetlistsPage, type Collection, type Setlist } from '@/api/list-fetch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOnline } from '@/hooks/use-online'
import { getNextPageIndex } from '@/lib/list-pagination'
import {
  updateRoomSongPool,
  type RoomSongPool,
  type RoomSongPoolSelection,
} from '@/lib/room'

type Props = {
  roomId: string
  revision: number
  songPool?: RoomSongPool
  open?: boolean
  isHost: boolean
  className?: string
}

function poolLabel(pool: RoomSongPool | null, t: (key: string, options?: Record<string, unknown>) => string): string {
  return pool?.title ?? t('rooms.songPool.none')
}

export function RoomSongPoolControl({ roomId, revision, songPool, open = false, isHost, className }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const currentPool = songPool ?? null
  const [poolType, setPoolType] = useState<'collection' | 'setlist' | ''>(songPool?.type ?? '')
  const [pending, setPending] = useState(false)
  const collectionsQuery = useInfiniteQuery({
    queryKey: ['room-song-pool-collections'],
    enabled: isHost && online,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: ({ pageParam, signal }) => fetchCollectionsPage(queryClient, { page: pageParam as number, q: '', signal }),
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
  const setlistsQuery = useInfiniteQuery({
    queryKey: ['room-song-pool-setlists'],
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
          {t('rooms.songPool.label')}
        </p>
        <p className="mt-1 truncate text-sm">{poolLabel(currentPool, t)}</p>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          {open ? t('rooms.songPool.openDescription') : t('rooms.songPool.restrictedDescription')}
        </p>
      </div>
    )
  }

  const changePool = async (value: string) => {
    if (!value || !poolType) return
    const next: RoomSongPoolSelection = { type: poolType, id: value }
    setPending(true)
    try {
      await updateRoomSongPool(roomId, next, open, revision)
      toast.success(t('rooms.songPool.updated'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('rooms.songPool.failed'))
    } finally {
      setPending(false)
    }
  }

  const changeOpen = async (nextOpen: boolean) => {
    setPending(true)
    try {
      await updateRoomSongPool(
        roomId,
        currentPool ? { type: currentPool.type, id: currentPool.id } : null,
        nextOpen,
        revision,
      )
      toast.success(t('rooms.songPool.updated'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('rooms.songPool.failed'))
    } finally {
      setPending(false)
    }
  }

  const availableItems = poolType === 'collection' ? collections : poolType === 'setlist' ? setlists : []
  const selectedId = currentPool?.type === poolType ? currentPool.id : undefined

  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {t('rooms.songPool.label')}
      </p>
      <Select value={poolType} onValueChange={(value) => setPoolType(value as 'collection' | 'setlist')} disabled={pending || !online}>
        <SelectTrigger id="room-song-pool-type" className="mt-1">
          <SelectValue placeholder={t('rooms.songPool.selectType')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="collection">{t('rooms.songPool.collectionType')}</SelectItem>
          <SelectItem value="setlist">{t('rooms.songPool.setlistType')}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={selectedId} onValueChange={(value) => void changePool(value)} disabled={pending || !online || !poolType}>
        <SelectTrigger id="room-song-pool" className="mt-1">
          <SelectValue placeholder={t('rooms.songPool.select')} />
        </SelectTrigger>
        <SelectContent>
          {availableItems.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="mt-3 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-[var(--color-primary)]"
          checked={open}
          disabled={pending || !online}
          onChange={(event) => void changeOpen(event.target.checked)}
        />
        <span>{t('rooms.songPool.open')}</span>
      </label>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        {open ? t('rooms.songPool.openDescription') : t('rooms.songPool.restrictedDescription')}
      </p>
      {(isCollectionsPending || isSetlistsPending || isFetchingNextCollectionsPage || isFetchingNextSetlistsPage) ? (
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{t('common.load')}</p>
      ) : null}
      {collectionsError || setlistsError ? (
        <p className="mt-1 text-xs text-[var(--color-destructive)]">{t('rooms.songPool.loadFailed')}</p>
      ) : null}
    </div>
  )
}
