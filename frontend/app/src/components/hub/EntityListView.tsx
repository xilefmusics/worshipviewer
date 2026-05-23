import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ArrowRightLeftIcon } from '@/components/icons/arrow-right-left-icon'
import { PencilIcon } from '@/components/icons/lucide-animated/pencil-icon'
import { ListMusicIcon } from '@/components/icons/lucide-animated/list-music-icon'
import { PlayIcon } from '@/components/icons/play-icon'
import { TrashIcon } from '@/components/icons/lucide-animated/trash-icon'
import { AddSongToSetlistDialog } from '@/components/hub/AddSongToSetlistDialog'

import type { Collection, Setlist, Song } from '@/api/list-fetch'
import { useHubScrollContainerRef } from '@/context/HubScrollContainerContext'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useChordFormatPreference } from '@/hooks/useChordFormatPreference'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useCoverImageSrc } from '@/hooks/useCoverImageSrc'
import { useDeleteHubEntity, HubDeleteConflictError } from '@/hooks/useDeleteHubEntity'
import { useInfiniteHubList } from '@/hooks/useInfiniteHubList'
import { useLongPress } from '@/hooks/useLongPress'
import { useOnline } from '@/hooks/use-online'
import { useSession } from '@/hooks/useSession'
import { useTeamDetail } from '@/hooks/useTeamDetail'
import { runCollectionExport } from '@/lib/run-collection-export'
import { runSetlistExport } from '@/lib/run-setlist-export'
import { runSongExport, type SongExportKind } from '@/lib/run-song-export'
import { duplicateCollection, duplicateSetlist } from '@/lib/duplicate-hub-entity'
import type { HubEntity } from '@/lib/hub-entity'
import { hubEntityEditSplat } from '@/lib/hub-entity-edit'
import { hubListKey, hubListRootKey } from '@/lib/hub-list-keys'
import { hubEntityToPlayerType, buildPlayerSearch } from '@/lib/player-route'
import { readPlayerDefaultMode } from '@/lib/player/player-mode-preference'
import { emptyEditorReturnSearch } from '@/lib/player/player-editor-return'
import { useHubViewMode } from '@/hooks/useHubViewMode'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { resolveCollectionsLayoutMode } from '@/lib/hub-view-mode'
import { getTeamDisplayName } from '@/lib/team-display-name'
import { cn } from '@/lib/utils'

/** Card grid: dense on laptop+ (6 → 8 cols), stays 2 cols on narrow phones. */
const hubCardGridClass =
  'grid grid-cols-2 gap-2 pb-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'

type EntityListViewProps = {
  entity: HubEntity
}

function songTitle(song: Song): string {
  const t = song.data.titles?.[0]
  return t?.trim() ? t : '—'
}

function songSubtitle(song: Song): string {
  const a = (song.data.artists ?? []).filter(Boolean).join(', ')
  return a || '\u2014'
}

const tapFeedback = { scale: 0.985 }
const tapTransition = { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const }

export function EntityListView({ entity }: EntityListViewProps) {
  const { t } = useTranslation()
  const { debouncedQ, setQInput } = useHubSearch()
  const reduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const scrollRef = useHubScrollContainerRef()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [pullVisual, setPullVisual] = useState(0)
  const [ptrRefreshing, setPtrRefreshing] = useState(false)
  const pullStartRef = useRef<number | null>(null)
  const pullDyRef = useRef(0)

  const { viewMode: collectionsViewPreference } = useHubViewMode('collections')
  const isLandscape = useMediaQuery('(orientation: landscape)')
  const viewMode =
    entity === 'collections'
      ? resolveCollectionsLayoutMode(collectionsViewPreference, isLandscape)
      : 'list'
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    if (entity !== 'setlists' && entity !== 'collections') return
    if (entity === 'setlists' && pathname !== '/setlists') return
    if (entity === 'collections' && pathname !== '/collections') return
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [entity, pathname, scrollRef])

  const {
    data,
    error,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteHubList(entity)

  const deleteMutation = useDeleteHubEntity(entity)
  const networkOnline = useOnline()
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    label: string
    songCount?: number
  } | null>(null)

  const deleteBlocked =
    entity === 'collections' && deleteTarget != null && (deleteTarget.songCount ?? 0) > 0

  const items = useMemo(() => {
    const pages = (data?.pages ?? []) as Array<{
      items: (Collection | Song | Setlist)[]
      total: number | undefined
    }>
    const flat = pages.flatMap((p) => p.items)
    if (entity !== 'setlists') return flat
    return [...(flat as Setlist[])].sort((a, b) =>
      b.title.localeCompare(a.title, undefined, { numeric: true }),
    )
  }, [data?.pages, entity])

  const runPullRefresh = useCallback(async () => {
    await queryClient.resetQueries({ queryKey: hubListKey(entity, debouncedQ) })
    await refetch()
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [queryClient, entity, debouncedQ, refetch, scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Non-passive touchmove on the scrollport breaks wheel / trackpad scrolling in desktop Chromium.
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints === 0) return

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return
      if (el.scrollHeight <= el.clientHeight) return
      pullStartRef.current = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (pullStartRef.current == null) return
      if (el.scrollHeight <= el.clientHeight) {
        pullStartRef.current = null
        pullDyRef.current = 0
        setPullVisual(0)
        return
      }
      if (el.scrollTop > 0) {
        pullStartRef.current = null
        pullDyRef.current = 0
        setPullVisual(0)
        return
      }
      const dy = e.touches[0].clientY - pullStartRef.current
      if (dy > 0) {
        e.preventDefault()
        pullDyRef.current = Math.min(dy, 72)
        setPullVisual(pullDyRef.current)
      }
    }

    const onTouchEnd = () => {
      if (pullStartRef.current == null) return
      pullStartRef.current = null
      const d = pullDyRef.current
      pullDyRef.current = 0
      setPullVisual(0)
      if (d <= 40) return
      setPtrRefreshing(true)
      void runPullRefresh().finally(() => setPtrRefreshing(false))
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [runPullRefresh, scrollRef])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return

    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries[0]?.isIntersecting
        if (hit && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { root, rootMargin: '120px' },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length, scrollRef])

  const showSkeleton = isPending && !data

  return (
    <>
      <div className="relative flex w-full min-w-0 flex-col">
        {(ptrRefreshing || pullVisual > 0) && (
          <motion.div
            className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center text-xs text-[var(--color-muted-foreground)]"
            style={{ transform: `translateY(${Math.min(pullVisual, 48)}px)` }}
            initial={false}
            animate={{
              opacity: ptrRefreshing ? 1 : Math.min(1, 0.2 + pullVisual / 56),
            }}
            transition={{ duration: 0.12 }}
          >
            {ptrRefreshing ? t('hub.refresh.refreshing') : pullVisual > 40 ? t('hub.refresh.release') : t('hub.refresh.pull')}
          </motion.div>
        )}

        {error ? (
          <motion.div
            className="flex flex-col items-center gap-3 py-12 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <p className="text-sm text-[var(--color-muted-foreground)]">{t('hub.error.body')}</p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              {t('hub.error.retry')}
            </Button>
          </motion.div>
        ) : null}

        {!error && showSkeleton ? (
          <div
            className={cn(
              entity === 'collections' && viewMode === 'card' ? hubCardGridClass : 'flex flex-col gap-2',
            )}
          >
            {Array.from({ length: entity === 'collections' && viewMode === 'card' ? 6 : 8 }).map((_, i) =>
              entity === 'collections' && viewMode === 'card' ? (
                <div key={i} className="flex flex-col gap-2">
                  <div className="aspect-[1/1.41421356237] w-full animate-pulse rounded-lg bg-[var(--color-muted)]" />
                  <div className="h-4 w-[75%] animate-pulse rounded bg-[var(--color-muted)]" />
                </div>
              ) : (
                <div key={i} className="flex gap-3 border-b border-[var(--color-border)] py-3">
                  <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-[var(--color-muted)]" />
                  <div className="flex flex-1 flex-col gap-2 py-1">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--color-muted)]" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-muted)]" />
                  </div>
                </div>
              ),
            )}
          </div>
        ) : null}

        {!error && !showSkeleton && items.length === 0 ? (
          <motion.div
            className="flex flex-col items-center gap-3 py-16 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {debouncedQ.trim() ? (
              <>
                <p className="text-sm text-[var(--color-muted-foreground)]">{t('hub.empty.noResults')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setQInput('')}>
                  {t('hub.empty.clearSearch')}
                </Button>
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">{t(`hub.empty.none.${entity}`)}</p>
            )}
          </motion.div>
        ) : null}

        {!error && !showSkeleton && items.length > 0 && entity === 'collections' ? (
          <div
            className={cn(
              viewMode === 'card' ? hubCardGridClass : 'flex flex-col gap-0 pb-4',
            )}
          >
            {(items as Collection[]).map((c) =>
              viewMode === 'card' ? (
                <CollectionCard
                  key={c.id}
                  collection={c}
                  onDeleteRequest={setDeleteTarget}
                  networkOnline={networkOnline}
                />
              ) : (
                <CollectionRow
                  key={c.id}
                  collection={c}
                  onDeleteRequest={setDeleteTarget}
                  networkOnline={networkOnline}
                />
              ),
            )}
          </div>
        ) : null}

        {!error && !showSkeleton && items.length > 0 && entity === 'songs' ? (
          <div className="flex flex-col pb-4">
            {(items as Song[]).map((s) => (
              <SongRow key={s.id} song={s} onDeleteRequest={setDeleteTarget} networkOnline={networkOnline} />
            ))}
          </div>
        ) : null}

        {!error && !showSkeleton && items.length > 0 && entity === 'setlists' ? (
          <div className="flex flex-col pb-4">
            {(items as Setlist[]).map((sl) => (
              <SetlistRow
                key={sl.id}
                setlist={sl}
                onDeleteRequest={setDeleteTarget}
                networkOnline={networkOnline}
              />
            ))}
          </div>
        ) : null}

        {!error && !showSkeleton && items.length > 0 ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div ref={sentinelRef} className="h-1 w-full shrink-0" aria-hidden />
            {hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? t('common.load') : t('hub.loadMore')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('hub.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlocked
                ? t('hub.delete.collectionNotEmptyBody', { name: deleteTarget?.label ?? '' })
                : t('hub.delete.body', { name: deleteTarget?.label ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('hub.delete.cancel')}</AlertDialogCancel>
            {!deleteBlocked ? (
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending || !networkOnline}
                onClick={() => {
                  if (!deleteTarget) return
                  void deleteMutation
                    .mutateAsync(deleteTarget.id)
                    .then(() => setDeleteTarget(null))
                    .catch((e: unknown) => {
                      if (e instanceof HubDeleteConflictError && e.code === 'collection_not_empty') {
                        toast.error(t('hub.delete.collectionNotEmpty'))
                        return
                      }
                      const msg = e instanceof Error ? e.message : ''
                      toast.error(msg || t('hub.delete.failed'))
                    })
                }}
              >
                {t('hub.delete.confirm')}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

type DeleteTarget = { id: string; label: string; songCount?: number }
type DeleteReq = (target: DeleteTarget) => void

function dispatchContextMenuFromPointer(target: HTMLElement, clientX: number, clientY: number) {
  target.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      view: window,
    }),
  )
}

/** Primary tap / Enter opens `/player`; long-press opens the row context menu. */
function useHubListItemPlayerTap(entity: HubEntity, itemId: string) {
  const navigate = useNavigate()
  const playType = hubEntityToPlayerType(entity)
  const suppressNextClickRef = useRef(false)
  const baseLongPress = useLongPress((_e, target) => {
    suppressNextClickRef.current = true
    dispatchContextMenuFromPointer(target, _e.clientX, _e.clientY)
  })

  const openPlayer = useCallback(
    (mode?: 'normal' | 'av') => {
      void navigate({
        to: '/player',
        search: buildPlayerSearch(playType, itemId, undefined, mode ?? readPlayerDefaultMode()),
      })
    },
    [navigate, playType, itemId],
  )

  const listPointerProps = {
    onPointerDown: baseLongPress.onPointerDown,
    onPointerUp: baseLongPress.onPointerUp,
    onPointerCancel: baseLongPress.onPointerCancel,
    onPointerLeave: baseLongPress.onPointerLeave,
  }

  const onClick = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    openPlayer()
  }, [openPlayer])

  const onContextMenu = useCallback(() => {
    suppressNextClickRef.current = true
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openPlayer()
      }
    },
    [openPlayer],
  )

  return { listPointerProps, onClick, onContextMenu, onKeyDown }
}

function HubItemContextMenu({
  entity,
  itemId,
  itemLabel,
  itemSongCount,
  onDeleteRequest,
  networkOnline,
  hubSong,
  children,
}: {
  entity: HubEntity
  itemId: string
  itemLabel: string
  itemSongCount?: number
  onDeleteRequest: DeleteReq
  networkOnline: boolean
  /** When set (songs hub), enables “Add to setlist”. */
  hubSong?: Song
  children: ReactElement
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const chordFormat = useChordFormatPreference()
  const [editHot, setEditHot] = useState(false)
  const [playHot, setPlayHot] = useState(false)
  const [addToSetlistHot, setAddToSetlistHot] = useState(false)
  const [duplicateHot, setDuplicateHot] = useState(false)
  const [deleteHot, setDeleteHot] = useState(false)
  const [addToSetlistOpen, setAddToSetlistOpen] = useState(false)

  const playType = hubEntityToPlayerType(entity)
  const showAddToSetlist = Boolean(
    entity === 'songs' && hubSong && !hubSong.not_a_song,
  )
  const showSongExport = Boolean(entity === 'songs' && hubSong)
  const showOrderedExport = entity === 'setlists' || entity === 'collections'
  const showDuplicate = showOrderedExport
  const titleSuffix = t('collections.hub.duplicateTitleSuffix')

  const onDuplicate = useCallback(async () => {
    const toastId = toast.loading(t('hub.actions.duplicate'))
    try {
      const created =
        entity === 'setlists'
          ? await duplicateSetlist(queryClient, itemId, titleSuffix)
          : await duplicateCollection(queryClient, itemId, titleSuffix)
      toast.dismiss(toastId)
      toast.success(t('hub.actions.duplicateSuccess', { title: created.title }))
      void queryClient.invalidateQueries({ queryKey: hubListRootKey })
      if (entity === 'setlists') {
        void navigate({
          to: '/setlists/$setlistId',
          params: { setlistId: created.id },
          search: emptyEditorReturnSearch(),
        })
      } else {
        void navigate({
          to: '/collections/$collectionId',
          params: { collectionId: created.id },
          search: emptyEditorReturnSearch(),
        })
      }
    } catch (e) {
      toast.dismiss(toastId)
      const detail = e instanceof Error ? e.message : String(e)
      const failedKey =
        entity === 'collections'
          ? 'collections.hub.duplicateFailed'
          : 'setlists.hub.duplicateFailed'
      toast.error(t(failedKey), { description: detail })
      console.error(`${entity} duplicate failed`, e)
    }
  }, [entity, itemId, navigate, queryClient, t, titleSuffix])

  const onOrderedExport = useCallback(
    async (kind: SongExportKind) => {
      const toastId = toast.loading(t('hub.actions.exportPreparing'))
      try {
        if (entity === 'setlists') {
          await runSetlistExport(queryClient, itemId, kind, chordFormat)
        } else if (entity === 'collections') {
          await runCollectionExport(queryClient, itemId, kind, chordFormat)
        }
        toast.dismiss(toastId)
      } catch (e) {
        toast.dismiss(toastId)
        const detail = e instanceof Error ? e.message : String(e)
        const failedKey =
          entity === 'collections'
            ? 'hub.actions.exportCollectionFailed'
            : 'hub.actions.exportSetlistFailed'
        toast.error(t(failedKey), { description: detail })
        console.error(`${entity} export failed`, e)
      }
    },
    [chordFormat, entity, itemId, queryClient, t],
  )

  const onSongExport = useCallback(
    async (kind: SongExportKind) => {
      if (!hubSong) return
      const toastId = toast.loading(t('hub.actions.exportPreparing'))
      try {
        await runSongExport(hubSong.data as Record<string, unknown>, kind, chordFormat)
        toast.dismiss(toastId)
      } catch (e) {
        toast.dismiss(toastId)
        const detail = e instanceof Error ? e.message : String(e)
        toast.error(t('hub.actions.exportFailed'), { description: detail })
        console.error('Song export failed', e)
      }
    },
    [chordFormat, hubSong, t],
  )

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            className="gap-2"
            onSelect={() => {
              if (entity === 'setlists') {
                void navigate({
                  to: '/setlists/$setlistId',
                  params: { setlistId: itemId },
                  search: emptyEditorReturnSearch(),
                })
              } else if (entity === 'collections') {
                void navigate({
                  to: '/collections/$collectionId',
                  params: { collectionId: itemId },
                  search: emptyEditorReturnSearch(),
                })
              } else if (entity === 'songs') {
                void navigate({
                  to: '/songs/$songId',
                  params: { songId: itemId },
                  search: emptyEditorReturnSearch(),
                })
              } else {
                void navigate({
                  to: '/$',
                  params: { _splat: hubEntityEditSplat(entity, itemId) },
                })
              }
            }}
            onMouseEnter={() => setEditHot(true)}
            onMouseLeave={() => setEditHot(false)}
            onFocus={() => setEditHot(true)}
            onBlur={() => setEditHot(false)}
          >
            <PencilIcon isHovered={editHot} size={16} className="shrink-0 text-[var(--color-foreground)]" />
            {t('hub.actions.edit')}
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={() => {
              void navigate({
                to: '/player',
                search: buildPlayerSearch(playType, itemId, undefined, 'normal'),
              })
            }}
            onMouseEnter={() => setPlayHot(true)}
            onMouseLeave={() => setPlayHot(false)}
            onFocus={() => setPlayHot(true)}
            onBlur={() => setPlayHot(false)}
          >
            <PlayIcon size={16} className={cn('shrink-0 text-[var(--color-foreground)]', playHot && 'opacity-90')} />
            {t('hub.actions.playNormal')}
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={() => {
              void navigate({
                to: '/player',
                search: buildPlayerSearch(playType, itemId, undefined, 'av'),
              })
            }}
          >
            <PlayIcon size={16} className="shrink-0 text-[var(--color-foreground)]" />
            {t('hub.actions.playAv')}
          </ContextMenuItem>
          {showDuplicate ? (
            <ContextMenuItem
              className="gap-2"
              disabled={!networkOnline}
              title={!networkOnline ? t('hub.actions.deleteOfflineHint') : undefined}
              onSelect={() => {
                if (!networkOnline) return
                void onDuplicate()
              }}
              onMouseEnter={() => setDuplicateHot(true)}
              onMouseLeave={() => setDuplicateHot(false)}
              onFocus={() => setDuplicateHot(true)}
              onBlur={() => setDuplicateHot(false)}
            >
              <ArrowRightLeftIcon
                size={16}
                className={cn('shrink-0 text-[var(--color-foreground)]', duplicateHot && 'opacity-90')}
              />
              {t('hub.actions.duplicate')}
            </ContextMenuItem>
          ) : null}
          {showAddToSetlist ? (
            <ContextMenuItem
              className="gap-2"
              disabled={!networkOnline}
              title={!networkOnline ? t('hub.createOfflineHint') : undefined}
              onSelect={() => {
                if (!networkOnline) return
                setAddToSetlistOpen(true)
              }}
              onMouseEnter={() => setAddToSetlistHot(true)}
              onMouseLeave={() => setAddToSetlistHot(false)}
              onFocus={() => setAddToSetlistHot(true)}
              onBlur={() => setAddToSetlistHot(false)}
            >
              <ListMusicIcon isHovered={addToSetlistHot} size={16} className="shrink-0 text-[var(--color-foreground)]" />
              {t('hub.actions.addToSetlist')}
            </ContextMenuItem>
          ) : null}
          {showSongExport ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="gap-2"
                onSelect={() => void onSongExport('chordpro')}
              >
                {t('hub.actions.export')} — {t('hub.actions.exportChordPro')}
              </ContextMenuItem>
              <ContextMenuItem
                className="gap-2"
                onSelect={() => void onSongExport('worshippro')}
              >
                {t('hub.actions.export')} — {t('hub.actions.exportWorshipPro')}
              </ContextMenuItem>
              <ContextMenuItem
                className="gap-2"
                title={t('hub.actions.exportPdfHint')}
                onSelect={() => void onSongExport('pdf')}
              >
                {t('hub.actions.export')} — {t('hub.actions.exportPdf')}
              </ContextMenuItem>
            </>
          ) : null}
          {showOrderedExport ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="gap-2"
                onSelect={() => void onOrderedExport('chordpro')}
              >
                {t('hub.actions.export')} — {t('hub.actions.exportChordPro')}
              </ContextMenuItem>
              <ContextMenuItem
                className="gap-2"
                onSelect={() => void onOrderedExport('worshippro')}
              >
                {t('hub.actions.export')} — {t('hub.actions.exportWorshipPro')}
              </ContextMenuItem>
              <ContextMenuItem
                className="gap-2"
                title={t('hub.actions.exportPdfHint')}
                onSelect={() => void onOrderedExport('pdf')}
              >
                {t('hub.actions.export')} — {t('hub.actions.exportPdf')}
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            className="gap-2 text-[var(--color-danger)] focus:text-[var(--color-danger)]"
            disabled={!networkOnline}
            title={!networkOnline ? t('hub.actions.deleteOfflineHint') : undefined}
            onSelect={() => {
              if (!networkOnline) return
              onDeleteRequest({
                id: itemId,
                label: itemLabel,
                ...(itemSongCount != null ? { songCount: itemSongCount } : {}),
              })
            }}
            onMouseEnter={() => setDeleteHot(true)}
            onMouseLeave={() => setDeleteHot(false)}
            onFocus={() => setDeleteHot(true)}
            onBlur={() => setDeleteHot(false)}
          >
            <TrashIcon isHovered={deleteHot} size={16} className="shrink-0" />
            {t('hub.actions.delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {showAddToSetlist && hubSong ? (
        <AddSongToSetlistDialog open={addToSetlistOpen} onOpenChange={setAddToSetlistOpen} song={hubSong} />
      ) : null}
    </>
  )
}

const CollectionCard = memo(function CollectionCard({
  collection,
  onDeleteRequest,
  networkOnline,
}: {
  collection: Collection
  onDeleteRequest: DeleteReq
  networkOnline: boolean
}) {
  const reduceMotion = useReducedMotion()
  const { listPointerProps, onClick, onContextMenu, onKeyDown } = useHubListItemPlayerTap(
    'collections',
    collection.id,
  )
  const { src: coverSrc, onImageError: onCoverError } = useCoverImageSrc(collection.cover)

  return (
    <HubItemContextMenu
      entity="collections"
      itemId={collection.id}
      itemLabel={collection.title}
      itemSongCount={collection.songs.length}
      onDeleteRequest={onDeleteRequest}
      networkOnline={networkOnline}
    >
      <motion.div
        className="flex cursor-pointer flex-col gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:gap-2"
        {...listPointerProps}
        onClick={onClick}
        onContextMenu={onContextMenu}
        role="button"
        tabIndex={0}
        whileTap={reduceMotion ? undefined : tapFeedback}
        transition={tapTransition}
        onKeyDown={onKeyDown}
      >
        <div className="relative aspect-[1/1.41421356237] w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              draggable={false}
              className="pointer-events-none size-full object-cover"
              loading="lazy"
              onError={onCoverError}
            />
          ) : null}
        </div>
        <p className="line-clamp-2 text-xs font-medium leading-snug text-[var(--color-foreground)] sm:text-sm xl:text-[0.6875rem] xl:leading-tight">
          {collection.title}
        </p>
      </motion.div>
    </HubItemContextMenu>
  )
})

const CollectionRow = memo(function CollectionRow({
  collection,
  onDeleteRequest,
  networkOnline,
}: {
  collection: Collection
  onDeleteRequest: DeleteReq
  networkOnline: boolean
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const { listPointerProps, onClick, onContextMenu, onKeyDown } = useHubListItemPlayerTap(
    'collections',
    collection.id,
  )
  const { src: coverSrc, onImageError: onCoverError } = useCoverImageSrc(collection.cover)

  return (
    <HubItemContextMenu
      entity="collections"
      itemId={collection.id}
      itemLabel={collection.title}
      itemSongCount={collection.songs.length}
      onDeleteRequest={onDeleteRequest}
      networkOnline={networkOnline}
    >
      <motion.div
        className="flex cursor-pointer gap-3 border-b border-[var(--color-border)] py-3 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        {...listPointerProps}
        onClick={onClick}
        onContextMenu={onContextMenu}
        role="button"
        tabIndex={0}
        whileTap={reduceMotion ? undefined : tapFeedback}
        transition={tapTransition}
        onKeyDown={onKeyDown}
      >
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              draggable={false}
              className="pointer-events-none size-full object-cover"
              loading="lazy"
              onError={onCoverError}
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 py-1">
          <p className="truncate font-medium text-[var(--color-foreground)]">{collection.title}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t('hub.meta.songsCount', { count: collection.songs.length })}
          </p>
        </div>
      </motion.div>
    </HubItemContextMenu>
  )
})

const SongRow = memo(function SongRow({
  song,
  onDeleteRequest,
  networkOnline,
}: {
  song: Song
  onDeleteRequest: DeleteReq
  networkOnline: boolean
}) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const reduceMotion = useReducedMotion()
  const { listPointerProps, onClick, onContextMenu, onKeyDown } = useHubListItemPlayerTap('songs', song.id)
  const title = songTitle(song)
  const sub = songSubtitle(song)
  const { data: ownerTeam, isPending: ownerTeamPending, isError: ownerTeamError } =
    useTeamDetail(song.owner)

  const ownerLabel = useMemo(() => {
    if (ownerTeamPending) return null
    if (ownerTeamError || !ownerTeam) return t('setlists.editor.teamUnavailable')
    return getTeamDisplayName(ownerTeam, user?.id, t)
  }, [ownerTeam, ownerTeamError, ownerTeamPending, t, user?.id])

  return (
    <HubItemContextMenu
      entity="songs"
      itemId={song.id}
      itemLabel={title}
      onDeleteRequest={onDeleteRequest}
      networkOnline={networkOnline}
      hubSong={song}
    >
      <motion.div
        className="flex cursor-pointer gap-3 border-b border-[var(--color-border)] py-3 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        {...listPointerProps}
        onClick={onClick}
        onContextMenu={onContextMenu}
        role="button"
        tabIndex={0}
        whileTap={reduceMotion ? undefined : tapFeedback}
        transition={tapTransition}
        onKeyDown={onKeyDown}
      >
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <p className="truncate font-medium text-[var(--color-foreground)]">{title}</p>
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted-foreground)]">{sub}</p>
            {ownerLabel ? (
              <p
                className="max-w-[min(12rem,45%)] shrink-0 truncate text-right text-xs text-[var(--color-muted-foreground)]"
                title={ownerLabel}
              >
                {ownerLabel}
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>
    </HubItemContextMenu>
  )
})

const SetlistRow = memo(function SetlistRow({
  setlist,
  onDeleteRequest,
  networkOnline,
}: {
  setlist: Setlist
  onDeleteRequest: DeleteReq
  networkOnline: boolean
}) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const reduceMotion = useReducedMotion()
  const { listPointerProps, onClick, onContextMenu, onKeyDown } = useHubListItemPlayerTap('setlists', setlist.id)
  const { data: ownerTeam, isPending: ownerTeamPending, isError: ownerTeamError } =
    useTeamDetail(setlist.owner)

  const ownerLabel = useMemo(() => {
    if (ownerTeamPending) return null
    if (ownerTeamError || !ownerTeam) return t('setlists.editor.teamUnavailable')
    return getTeamDisplayName(ownerTeam, user?.id, t)
  }, [ownerTeam, ownerTeamError, ownerTeamPending, t, user?.id])

  return (
    <HubItemContextMenu
      entity="setlists"
      itemId={setlist.id}
      itemLabel={setlist.title}
      onDeleteRequest={onDeleteRequest}
      networkOnline={networkOnline}
    >
      <motion.div
        className="flex cursor-pointer gap-3 border-b border-[var(--color-border)] py-3 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        {...listPointerProps}
        onClick={onClick}
        onContextMenu={onContextMenu}
        role="button"
        tabIndex={0}
        whileTap={reduceMotion ? undefined : tapFeedback}
        transition={tapTransition}
        onKeyDown={onKeyDown}
      >
        <div className="min-w-0 flex-1 py-1">
          <p className="truncate font-medium text-[var(--color-foreground)]">{setlist.title}</p>
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted-foreground)]">
              {t('hub.meta.songsCount', { count: setlist.songs.length })}
            </p>
            {ownerLabel ? (
              <p
                className="max-w-[min(12rem,45%)] shrink-0 truncate text-right text-xs text-[var(--color-muted-foreground)]"
                title={ownerLabel}
              >
                {ownerLabel}
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>
    </HubItemContextMenu>
  )
})
