import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchCollectionDetail } from '@/api/collections-detail'
import { fetchSetlistDetail, fetchSongForHubSlot } from '@/api/setlists-detail'
import { PlayerAv } from '@/components/player/av/PlayerAv'
import { PlayerBook } from '@/components/player/PlayerBook'
import { Button } from '@/components/ui/button'
import type { PlayerMode } from '@/lib/player/player-mode'
import type { PlayerEntityType } from '@/lib/player-route'
import { resolvePlayerForRoute } from '@/lib/offline/resolve-player'
import {
  collectionDetailKey,
  playerQueryKey,
  playerResourceTitleKey,
  setlistDetailKey,
  songDetailQueryKey,
} from '@/lib/setlist-detail-key'

export type PlayerRouteInnerProps = {
  type: PlayerEntityType
  id: string
  initialIndex?: number
  mode: PlayerMode
}

function hubPathForPlayerType(type: PlayerEntityType): '/collections' | '/songs' | '/setlists' {
  switch (type) {
    case 'collection':
      return '/collections'
    case 'song':
      return '/songs'
    case 'setlist':
      return '/setlists'
  }
}

function usePlayerResourceTitle(type: PlayerEntityType, id: string, enabled: boolean): string | undefined {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: playerResourceTitleKey(type, id),
    enabled,
    queryFn: async ({ signal }) => {
      if (type === 'setlist') {
        const detail = await fetchSetlistDetail(queryClient, { id, signal })
        queryClient.setQueryData(setlistDetailKey(id), detail)
        return detail.title
      }
      if (type === 'collection') {
        const detail = await fetchCollectionDetail(queryClient, { id, signal })
        queryClient.setQueryData(collectionDetailKey(id), detail)
        return detail.title
      }
      const song = await fetchSongForHubSlot(queryClient, { id, signal })
      if (song) queryClient.setQueryData(songDetailQueryKey(id), song)
      const songData = song?.data as { titles?: string[] } | undefined
      return songData?.titles?.[0] ?? ''
    },
    staleTime: 60_000,
  })
  return data
}

export function PlayerRouteInner({ type, id, initialIndex, mode }: PlayerRouteInnerProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: playerQueryKey(type, id),
    queryFn: ({ signal }) => resolvePlayerForRoute(type, id, signal),
    refetchOnMount: 'always',
  })

  const player =
    data && data.status === 'ready' ? data.player : undefined

  const allowNetworkFetch =
    data?.status === 'ready'
      ? data.source === 'network'
      : typeof navigator !== 'undefined' && navigator.onLine

  const resourceTitle = usePlayerResourceTitle(type, id, Boolean(player))
  const backTo = useMemo(() => hubPathForPlayerType(type), [type])

  if (isPending || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] p-6 text-[var(--color-muted-foreground)]">
        {t('common.load')}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 bg-[var(--color-bg)] p-6">
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {(error as Error)?.message ?? t('player.loadFailed')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={backTo}>{t('player.backToList')}</Link>
          </Button>
          <Button type="button" onClick={() => void refetch()}>
            {t('hub.error.retry')}
          </Button>
        </div>
      </div>
    )
  }

  if (data.status === 'error') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 bg-[var(--color-bg)] p-6">
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {data.message}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={backTo}>{t('player.backToList')}</Link>
          </Button>
          <Button type="button" onClick={() => void refetch()}>
            {t('hub.error.retry')}
          </Button>
        </div>
      </div>
    )
  }

  if (data.status === 'offline_unavailable') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 bg-[var(--color-bg)] p-6">
        <p className="text-sm text-[var(--color-muted-foreground)]">{t(data.message)}</p>
        <Button type="button" variant="outline" asChild>
          <Link to={backTo}>{t('player.backToList')}</Link>
        </Button>
      </div>
    )
  }

  if (!player) {
    return null
  }

  const sharedProps = {
    type,
    id,
    player,
    initialIndex,
    allowNetworkFetch,
    resourceTitle,
    deletedReconciled: data.deletedReconciled,
  }

  if (mode === 'av') {
    return <PlayerAv key={`${type}-${id}-av`} {...sharedProps} />
  }

  return <PlayerBook key={`${type}-${id}`} {...sharedProps} mode={mode} />
}
