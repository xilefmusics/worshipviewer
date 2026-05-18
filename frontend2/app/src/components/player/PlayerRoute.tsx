import type { components } from '@/api/schema'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchBlobBinaryWithMime } from '@/api/blob-data'
import { Button } from '@/components/ui/button'
import type { PlayerEntityType } from '@/lib/player-route'
import { resolveSongDataKey } from '@/lib/setlist-song-links'
import { resolvePlayerForRoute } from '@/lib/offline/resolve-player'
import { getCachedBlob } from '@/lib/offline/setlist-player-cache'
import { cn } from '@/lib/utils'

type Player = components['schemas']['Player']
type PlayerItem = components['schemas']['PlayerItem']

function hubPathForPlayerType(type: PlayerEntityType): '/collections' | '/songs' | '/setlists' {
  switch (type) {
    case 'collection':
      return '/collections'
    case 'song':
      return '/songs'
    case 'setlist':
      return '/setlists'
    default:
      return '/setlists'
  }
}

function EmergencyChordsSlide({ song }: { song: components['schemas']['Song'] }) {
  const d = song.data
  const title = d.titles[0] ?? '—'
  const keyLabel = resolveSongDataKey(d as Record<string, unknown>)
  return (
    <div className="flex min-h-0 flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-lg font-semibold text-[var(--color-foreground)]">{title}</h1>
        {d.subtitle ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">{d.subtitle}</p>
        ) : null}
        {keyLabel ? (
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Key: {keyLabel}</p>
        ) : null}
      </header>
      <div className="min-h-0 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-[0.8125rem] leading-relaxed text-[var(--color-foreground)]">
          {JSON.stringify(d.sections, null, 2)}
        </pre>
      </div>
    </div>
  )
}

type BlobSlideProps = {
  blobId: string
  allowNetworkFetch: boolean
}

function BlobSlide({ blobId, allowNetworkFetch }: BlobSlideProps) {
  const { t } = useTranslation()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mime, setMime] = useState<string | null>(null)

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    void (async () => {
      setError(null)
      const cached = await getCachedBlob(blobId)
      if (cached) {
        const blob = new Blob([cached.bytes], { type: cached.mime ?? 'application/octet-stream' })
        const u = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        revoked = u
        setMime(cached.mime)
        setObjectUrl(u)
        return
      }
      if (!allowNetworkFetch) {
        setError(t('player.blobOffline'))
        return
      }
      const meta = await fetchBlobBinaryWithMime(blobId)
      if (cancelled) return
      if (!meta) {
        setError(t('player.blobMissing'))
        return
      }
      const blob = new Blob([meta.buffer], { type: meta.mime ?? 'application/octet-stream' })
      const u = URL.createObjectURL(blob)
      revoked = u
      setMime(meta.mime)
      setObjectUrl(u)
    })()

    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [blobId, allowNetworkFetch, t])

  if (error) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--color-danger)]" role="alert">
        {error}
      </p>
    )
  }

  if (!objectUrl) {
    return <p className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">{t('common.load')}</p>
  }

  if (mime?.includes('pdf')) {
    return (
      <embed
        title=""
        src={objectUrl}
        className="min-h-[70vh] w-full flex-1 border-0 bg-[var(--color-bg)]"
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4">
      <img
        src={objectUrl}
        alt=""
        className="max-h-[min(85vh,calc(100dvh-8rem))] max-w-full object-contain"
        draggable={false}
      />
    </div>
  )
}

function PlayerItemSlide({
  item,
  allowNetworkFetch,
}: {
  item: PlayerItem
  allowNetworkFetch: boolean
}) {
  if (item.type === 'blob') {
    return <BlobSlide blobId={item.blob_id} allowNetworkFetch={allowNetworkFetch} />
  }
  return <EmergencyChordsSlide song={item.song} />
}

export type PlayerRouteInnerProps = {
  type: PlayerEntityType
  id: string
}

type PlayerBookProps = {
  type: PlayerEntityType
  player: Player
  allowNetworkFetch: boolean
}

function PlayerBook({ type, player, allowNetworkFetch }: PlayerBookProps) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(player.index, 0), Math.max(player.items.length - 1, 0)),
  )

  const itemsLen = player.items.length
  const currentItem = player.items[index]

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(itemsLen - 1, i + 1))
  }, [itemsLen])

  const backTo = useMemo(() => hubPathForPlayerType(type), [type])

  if (itemsLen === 0 || !currentItem) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 bg-[var(--color-bg)] p-6">
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('player.empty')}</p>
        <Button type="button" variant="outline" asChild>
          <Link to={backTo}>{t('player.backToList')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-[var(--color-foreground)]">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/80">
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to={backTo}>{t('player.close')}</Link>
        </Button>
        <span className="min-w-0 truncate text-center text-xs text-[var(--color-muted-foreground)]">
          {t('player.position', { current: index + 1, total: itemsLen })}
        </span>
        <div className="w-[4.5rem] shrink-0" aria-hidden />
      </header>

      <div className="min-h-0 flex-1">
        <PlayerItemSlide item={currentItem} allowNetworkFetch={Boolean(allowNetworkFetch)} />
      </div>

      <footer
        className={cn(
          'sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-[var(--color-border)]',
          'bg-[var(--color-surface)]/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/80',
        )}
      >
        <Button type="button" variant="outline" disabled={index <= 0} onClick={goPrev}>
          {t('player.prev')}
        </Button>
        <Button type="button" variant="outline" disabled={index >= itemsLen - 1} onClick={goNext}>
          {t('player.next')}
        </Button>
      </footer>
    </div>
  )
}

export function PlayerRouteInner({ type, id }: PlayerRouteInnerProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['player', type, id],
    queryFn: ({ signal }) => resolvePlayerForRoute(type, id, signal),
  })

  const player: Player | undefined =
    data && data.status === 'ready' ? data.player : undefined

  const allowNetworkFetch =
    data?.status === 'ready'
      ? data.source === 'network'
      : typeof navigator !== 'undefined' && navigator.onLine

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

  return (
    <PlayerBook
      key={`${type}-${id}`}
      type={type}
      player={player}
      allowNetworkFetch={allowNetworkFetch}
    />
  )
}
