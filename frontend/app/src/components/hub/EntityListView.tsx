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
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DownloadIcon } from '@/components/icons/lucide-animated/download-icon'
import { FileStackIcon } from '@/components/icons/lucide-animated/file-stack-icon'
import { FileTextIcon } from '@/components/icons/lucide-animated/file-text-icon'
import { FolderXIcon } from '@/components/icons/lucide-animated/folder-x-icon'
import { ListMusicIcon } from '@/components/icons/lucide-animated/list-music-icon'
import { OutputIcon } from '@/components/icons/lucide-animated/output-icon'
import { PencilIcon } from '@/components/icons/lucide-animated/pencil-icon'
import { PrinterIcon } from '@/components/icons/lucide-animated/printer-icon'
import { ProjectorIcon } from '@/components/icons/lucide-animated/projector-icon'
import { RoomIcon } from '@/components/icons/lucide-animated/room-icon'
import { TrashIcon } from '@/components/icons/lucide-animated/trash-icon'
import { TocSortLikedIcon } from '@/components/icons/toc-sort-icons'
import { AddSongToSetlistDialog } from '@/components/hub/AddSongToSetlistDialog'
import {
  HUB_ACTION_ICON_CLASS,
  HubActionItem,
  HubActionSeparator,
  HubActionsDrawer,
} from '@/components/hub/HubActionsDrawer'
import { OfflineCachedIndicator } from '@/components/hub/OfflineCachedIndicator'
import { SetlistItemCounts } from '@/components/hub/SetlistItemCounts'
import { CreateRoomDialog, type RoomSource } from '@/components/room/CreateRoomDialog'
import {
  HUB_LIST_AVATAR_CLASS,
  HUB_LIST_ROW_BORDER_CLASS,
  HUB_LIST_ROW_INSET_LAST_CLASS,
  HUB_LIST_ROW_SHELL_CLASS,
  HUB_LIST_ROW_TEXT_COLUMN_CLASS,
  HUB_LIST_SUBTITLE_CLASS,
  HUB_LIST_TITLE_CLASS,
} from '@/components/hub/hub-list-styles'

import type { Collection, Setlist, Song } from '@/api/list-fetch'
import { setSongLikeStatus } from '@/api/songs-like'
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
import { useChordFormatPreference } from '@/hooks/useChordFormatPreference'
import { useHideChordsPreference } from '@/hooks/useHideChordsPreference'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useCoverImageSrc } from '@/hooks/useCoverImageSrc'
import { useDeleteHubEntity, HubDeleteConflictError } from '@/hooks/useDeleteHubEntity'
import { useInfiniteHubList } from '@/hooks/useInfiniteHubList'
import { downloadPlayerForOffline, removeOfflinePlayerCopy } from '@/lib/offline/download-player-offline'
import { useOnline } from '@/hooks/use-online'
import { useSession } from '@/hooks/useSession'
import { useTeamDetail } from '@/hooks/useTeamDetail'
import { observeElementIntersection } from '@/lib/browser-apis'
import { exportPdfHintTitle } from '@/lib/export-pdf-hint'
import { runCollectionExport } from '@/lib/run-collection-export'
import { runSetlistExport } from '@/lib/run-setlist-export'
import { runSongExport, type SongExportKind } from '@/lib/run-song-export'
import type { HubEntity } from '@/lib/hub-entity'
import { hubEntityEditSplat } from '@/lib/hub-entity-edit'
import { hubListKey } from '@/lib/hub-list-keys'
import { useHubListsUpdatedAt } from '@/hooks/useHubListsUpdatedAt'
import { hubEntityToPlayerType, buildPlayerSearch } from '@/lib/player-route'
import { readPlayerDefaultMode } from '@/lib/player/player-mode-preference'
import { emptyEditorReturnSearch } from '@/lib/player/player-editor-return'
import { useHubViewMode } from '@/hooks/useHubViewMode'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useWritableTeams } from '@/hooks/useWritableTeams'
import { resolveCollectionsLayoutMode } from '@/lib/hub-view-mode'
import { getTeamDisplayName } from '@/lib/team-display-name'
import { roomSourceType } from '@/lib/room-source'
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

function songSubtitle(song: Song, unknownArtist: string): string {
  const a = (song.data.artists ?? []).filter(Boolean).join(', ')
  return a || unknownArtist
}

const tapFeedback = { scale: 0.985 }
const tapTransition = { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] as const }

export function EntityListView({ entity }: EntityListViewProps) {
  const { t } = useTranslation()
  const { debouncedQ, selectedTeamId, setQInput } = useHubSearch()
  const reduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const scrollRef = useHubScrollContainerRef()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [pullVisual, setPullVisual] = useState(0)
  const [ptrRefreshing, setPtrRefreshing] = useState(false)
  const [roomSource, setRoomSource] = useState<RoomSource | null>(null)
  const pullStartRef = useRef<number | null>(null)
  const pullDyRef = useRef(0)

  const { viewMode: collectionsViewPreference } = useHubViewMode('collections')
  const { teams: writableRoomTeams, user: roomUser } = useWritableTeams('roomCreate')
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
  const listsUpdatedAt = useHubListsUpdatedAt(!networkOnline, entity, Boolean(data))

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
    if (!networkOnline) {
      toast.info(t('hub.refresh.offlineBlocked'))
      return
    }
    await queryClient.resetQueries({ queryKey: hubListKey(entity, debouncedQ, selectedTeamId) })
    await refetch()
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [queryClient, entity, debouncedQ, selectedTeamId, refetch, scrollRef, networkOnline, t])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Non-passive touchmove on the scrollport breaks wheel / trackpad scrolling in desktop Chromium.
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints === 0) return

    let touchMoveListener: ((e: TouchEvent) => void) | null = null

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return
      if (el.scrollHeight <= el.clientHeight) return
      pullStartRef.current = e.touches[0].clientY

      if (touchMoveListener) return
      touchMoveListener = (moveEvent: TouchEvent) => {
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
        const dy = moveEvent.touches[0].clientY - pullStartRef.current
        if (dy > 0) {
          moveEvent.preventDefault()
          pullDyRef.current = Math.min(dy, 72)
          setPullVisual(pullDyRef.current)
        }
      }
      el.addEventListener('touchmove', touchMoveListener, { passive: false })
    }

    const onTouchEnd = () => {
      if (touchMoveListener) {
        el.removeEventListener('touchmove', touchMoveListener)
        touchMoveListener = null
      }
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
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    return () => {
      if (touchMoveListener) {
        el.removeEventListener('touchmove', touchMoveListener)
      }
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [runPullRefresh, scrollRef])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return

    return observeElementIntersection(
      sentinel,
      (entries) => {
        const hit = entries[0]?.isIntersecting
        if (hit && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { root, rootMargin: '120px' },
    )
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length, scrollRef])

  const showSkeleton = isPending && !data

  return (
    <>
      <div className="relative flex w-full min-w-0 flex-col">
        {!networkOnline && listsUpdatedAt ? (
          <p className="mb-2 text-center text-xs text-[var(--color-muted-foreground)]">
            {t('hub.offline.lastUpdated', {
              when: new Date(listsUpdatedAt).toLocaleString(),
            })}
          </p>
        ) : null}
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
              entity === 'collections' && viewMode === 'card' ? hubCardGridClass : 'flex flex-col gap-0',
            )}
          >
            {Array.from({ length: entity === 'collections' && viewMode === 'card' ? 6 : 8 }).map((_, i) =>
              entity === 'collections' && viewMode === 'card' ? (
                <div key={i} className="flex flex-col gap-2">
                  <div className="aspect-[1/1.41421356237] w-full animate-pulse rounded-lg bg-[var(--color-muted)]" />
                  <div className="h-4 w-[75%] animate-pulse rounded bg-[var(--color-muted)]" />
                </div>
              ) : (
                <div
                  key={i}
                  className={cn(
                    HUB_LIST_ROW_SHELL_CLASS,
                    HUB_LIST_ROW_INSET_LAST_CLASS,
                    entity === 'collections' && viewMode !== 'card' ? undefined : HUB_LIST_ROW_BORDER_CLASS,
                  )}
                >
                  {entity === 'collections' && viewMode !== 'card' ? (
                    <div className={cn(HUB_LIST_AVATAR_CLASS, 'animate-pulse border-0')} />
                  ) : null}
                  <div
                    className={cn(
                      entity === 'collections' && viewMode !== 'card'
                        ? HUB_LIST_ROW_TEXT_COLUMN_CLASS
                        : 'flex flex-1 flex-col gap-1.5 py-0.5',
                      entity === 'collections' && viewMode !== 'card' ? undefined : HUB_LIST_ROW_BORDER_CLASS,
                    )}
                  >
                    <div className="h-[1.0625rem] w-2/3 animate-pulse rounded bg-[var(--color-muted)]" />
                    <div className="h-[0.9375rem] w-1/2 animate-pulse rounded bg-[var(--color-muted)]" />
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
            ) : selectedTeamId ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {t(`hub.empty.filtered.${entity}`)}
              </p>
            ) : !networkOnline ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">{t('hub.empty.offlineNone')}</p>
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
                  onCreateRoomRequest={(source) => setRoomSource(source)}
                />
              ) : (
                <CollectionRow
                  key={c.id}
                  collection={c}
                  onDeleteRequest={setDeleteTarget}
                  networkOnline={networkOnline}
                  onCreateRoomRequest={(source) => setRoomSource(source)}
                />
              ),
            )}
          </div>
        ) : null}

        {!error && !showSkeleton && items.length > 0 && entity === 'songs' ? (
          <div className="flex flex-col pb-4">
            {(items as Song[]).map((s) => (
              <SongRow
                key={s.id}
                song={s}
                onDeleteRequest={setDeleteTarget}
                networkOnline={networkOnline}
                onCreateRoomRequest={(source) => setRoomSource(source)}
              />
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
                onCreateRoomRequest={(source) => setRoomSource(source)}
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
      <CreateRoomDialog
        key={roomSource ? `${roomSource.type}:${roomSource.id}` : 'independent'}
        open={roomSource != null}
        onOpenChange={(open) => {
          if (!open) setRoomSource(null)
        }}
        teams={writableRoomTeams}
        userId={roomUser?.id}
        source={roomSource}
        onCreated={(roomId) => {
          window.location.assign(`/rooms/${encodeURIComponent(roomId)}`)
        }}
      />
    </>
  )
}

type DeleteTarget = { id: string; label: string; songCount?: number }
type DeleteReq = (target: DeleteTarget) => void

/** Primary tap / Enter opens `/player`. */
function useHubListItemPlayerTap(entity: HubEntity, itemId: string) {
  const navigate = useNavigate()
  const playType = hubEntityToPlayerType(entity)

  const onClick = useCallback(() => {
    void navigate({
      to: '/player',
      search: buildPlayerSearch({
        type: playType,
        id: itemId,
        mode: readPlayerDefaultMode(),
      }),
    })
  }, [navigate, playType, itemId])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
    [onClick],
  )

  return { onClick, onKeyDown }
}

type HubActionHot =
  | 'edit'
  | 'showSheets'
  | 'controlAvSlides'
  | 'createRoom'
  | 'saveOffline'
  | 'removeOffline'
  | 'like'
  | 'addToSetlist'
  | 'exportChordpro'
  | 'exportWorshipPro'
  | 'exportSongBeamer'
  | 'exportProPresenter'
  | 'exportPdf'
  | 'delete'

function HubItemActionsMenu({
  entity,
  itemId,
  itemLabel,
  itemSongCount,
  onDeleteRequest,
  networkOnline,
  hubSong,
  onCreateRoomRequest,
  variant = 'row',
}: {
  entity: HubEntity
  itemId: string
  itemLabel: string
  itemSongCount?: number
  onDeleteRequest: DeleteReq
  networkOnline: boolean
  /** When set (songs hub), enables “Add to setlist”. */
  hubSong?: Song
  onCreateRoomRequest: (source: RoomSource) => void
  variant?: 'row' | 'card'
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const chordFormat = useChordFormatPreference()
  const hideChords = useHideChordsPreference()
  const [itemHot, setItemHot] = useState<HubActionHot | null>(null)
  const [addToSetlistOpen, setAddToSetlistOpen] = useState(false)
  const [likeOverride, setLikeOverride] = useState<{ songId: string; liked: boolean } | null>(null)
  const [likePending, setLikePending] = useState(false)
  const hover = (key: HubActionHot) => (hot: boolean) => setItemHot(hot ? key : null)

  const playType = hubEntityToPlayerType(entity)
  const [playerCached, setPlayerCached] = useState(false)
  const playerCacheRevision = useRef(0)
  useEffect(() => {
    let cancelled = false
    const revision = playerCacheRevision.current
    void import('@/lib/offline/player-mirror-cache').then(({ isPlayerMirrored }) =>
      isPlayerMirrored(playType, itemId).then((v) => {
        if (!cancelled && revision === playerCacheRevision.current) setPlayerCached(v)
      }),
    )
    return () => {
      cancelled = true
    }
  }, [playType, itemId])
  const showAddToSetlist = Boolean(
    entity === 'songs' && hubSong && !hubSong.not_a_song,
  )
  const showLike = showAddToSetlist
  const serverSongLiked = hubSong?.user_specific_addons.liked ?? false
  const songLiked = likeOverride?.songId === itemId ? likeOverride.liked : serverSongLiked
  const showSongExport = Boolean(entity === 'songs' && hubSong)
  const showOrderedExport = entity === 'setlists' || entity === 'collections'
  const hubExportPdfHint = useMemo(
    () =>
      exportPdfHintTitle(
        t('hub.actions.exportPdfHint'),
        t('hub.actions.exportPdfHintSafariHeaders'),
      ),
    [t],
  )

  const onLikeToggle = useCallback(() => {
    if (!hubSong || !showLike || !networkOnline || likePending) return
    const nextLiked = !songLiked
    setLikeOverride({ songId: itemId, liked: nextLiked })
    setLikePending(true)
    void setSongLikeStatus(queryClient, { id: itemId, liked: nextLiked })
      .catch((error: unknown) => {
        setLikeOverride({ songId: itemId, liked: songLiked })
        const detail = error instanceof Error ? error.message : String(error)
        toast.error(t('hub.actions.likeFailed'), { description: detail })
      })
      .finally(() => setLikePending(false))
  }, [hubSong, itemId, likePending, networkOnline, queryClient, showLike, songLiked, t])

  const onOrderedExport = useCallback(
    async (kind: SongExportKind) => {
      const toastId = toast.loading(t('hub.actions.exportPreparing'))
      try {
        if (entity === 'setlists') {
          await runSetlistExport(queryClient, itemId, kind, chordFormat, hideChords)
        } else if (entity === 'collections') {
          await runCollectionExport(queryClient, itemId, kind, chordFormat, hideChords)
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
    [chordFormat, entity, hideChords, itemId, queryClient, t],
  )

  const onSongExport = useCallback(
    async (kind: SongExportKind) => {
      if (!hubSong) return
      const toastId = toast.loading(t('hub.actions.exportPreparing'))
      try {
        await runSongExport(hubSong.data as Record<string, unknown>, kind, chordFormat, undefined, hideChords)
        toast.dismiss(toastId)
      } catch (e) {
        toast.dismiss(toastId)
        const detail = e instanceof Error ? e.message : String(e)
        toast.error(t('hub.actions.exportFailed'), { description: detail })
        console.error('Song export failed', e)
      }
    },
    [chordFormat, hideChords, hubSong, t],
  )

  const onSaveOffline = useCallback(async () => {
    if (!networkOnline) return
    const toastId = toast.loading(t('hub.actions.saveOffline'))
    const result = await downloadPlayerForOffline(playType, itemId, { title: itemLabel })
    toast.dismiss(toastId)
    if ('ok' in result && result.ok) {
      playerCacheRevision.current += 1
      setPlayerCached(true)
      if (result.evicted) {
        toast.success(t('hub.actions.saveOfflineSuccess'), {
          description: t('offlinePlayer.storageEvicted'),
        })
      } else {
        toast.success(t('hub.actions.saveOfflineSuccess'))
      }
    } else if ('error' in result && result.error === 'offline') {
      toast.info(t('hub.refresh.offlineBlocked'))
    } else {
      toast.error(t('hub.actions.saveOfflineFailed'), {
        description: 'message' in result ? result.message : undefined,
      })
    }
  }, [itemId, itemLabel, networkOnline, playType, t])

  const onRemoveOffline = useCallback(async () => {
    await removeOfflinePlayerCopy(playType, itemId)
    playerCacheRevision.current += 1
    setPlayerCached(false)
    toast.success(t('hub.actions.removeOfflineSuccess'))
  }, [itemId, playType, t])

  return (
    <>
      <div className="flex items-center gap-1">
        <OfflineCachedIndicator visible={playerCached} />
        <HubActionsDrawer
          title={itemLabel}
          triggerAriaLabel={t('hub.actions.menuAria', { title: itemLabel })}
          triggerClassName={
            variant === 'card'
              ? 'size-8 rounded-full bg-[var(--color-surface)]/80 text-[var(--color-foreground)] shadow-sm backdrop-blur-sm hover:bg-[var(--color-surface)]'
              : undefined
          }
        >
            <div role="group" aria-label={t('hub.actions.general')}>
              <div className="px-2 pb-1 text-xs font-semibold text-[var(--color-muted-foreground)]">
                {t('hub.actions.general')}
              </div>
            <HubActionItem
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
              onHoverChange={hover('edit')}
            >
              <PencilIcon isHovered={itemHot === 'edit'} size={16} className={HUB_ACTION_ICON_CLASS} />
              {t('hub.actions.edit')}
            </HubActionItem>
            <HubActionItem
              onSelect={() => {
                void navigate({
                  to: '/player',
                  search: buildPlayerSearch({ type: playType, id: itemId, mode: 'sheet' }),
                })
              }}
              onHoverChange={hover('showSheets')}
            >
              <FileTextIcon isHovered={itemHot === 'showSheets'} size={16} className={HUB_ACTION_ICON_CLASS} />
              {t('hub.actions.showSheets')}
            </HubActionItem>
            <HubActionItem
              onSelect={() => {
                void navigate({
                  to: '/player',
                  search: buildPlayerSearch({ type: playType, id: itemId, mode: 'av' }),
                })
              }}
              onHoverChange={hover('controlAvSlides')}
            >
              <OutputIcon isHovered={itemHot === 'controlAvSlides'} size={16} className={HUB_ACTION_ICON_CLASS} />
              {t('hub.actions.controlAvSlides')}
            </HubActionItem>
            <HubActionItem
              disabled={!networkOnline}
              title={!networkOnline ? t('hub.createOfflineHint') : undefined}
              onSelect={() => {
                if (!networkOnline) return
                onCreateRoomRequest({
                  type: roomSourceType(entity),
                  id: itemId,
                  title: itemLabel,
                })
              }}
              onHoverChange={hover('createRoom')}
            >
              <RoomIcon isHovered={itemHot === 'createRoom'} size={16} className={HUB_ACTION_ICON_CLASS} />
              {t('rooms.createTitle')}
            </HubActionItem>
            {playerCached ? (
              <HubActionItem onSelect={() => void onRemoveOffline()} onHoverChange={hover('removeOffline')}>
                <FolderXIcon isHovered={itemHot === 'removeOffline'} size={16} className={HUB_ACTION_ICON_CLASS} />
                {t('hub.actions.removeOffline')}
              </HubActionItem>
            ) : (
              <HubActionItem
                disabled={!networkOnline}
                title={!networkOnline ? t('hub.createOfflineHint') : undefined}
                onSelect={() => void onSaveOffline()}
                onHoverChange={hover('saveOffline')}
              >
                <DownloadIcon isHovered={itemHot === 'saveOffline'} size={16} className={HUB_ACTION_ICON_CLASS} />
                {t('hub.actions.saveOffline')}
              </HubActionItem>
            )}
            {showLike ? (
              <HubActionItem
                disabled={!networkOnline || likePending}
                title={!networkOnline ? t('hub.createOfflineHint') : undefined}
                onSelect={() => onLikeToggle()}
                onHoverChange={hover('like')}
              >
                <TocSortLikedIcon
                  isHovered={itemHot === 'like'}
                  size={16}
                  className={cn(HUB_ACTION_ICON_CLASS, songLiked && 'text-[var(--color-danger)]')}
                />
                {t(songLiked ? 'hub.actions.unlike' : 'hub.actions.like')}
              </HubActionItem>
            ) : null}
            {showAddToSetlist ? (
              <HubActionItem
                disabled={!networkOnline}
                title={!networkOnline ? t('hub.createOfflineHint') : undefined}
                onSelect={() => {
                  if (!networkOnline) return
                  setAddToSetlistOpen(true)
                }}
                onHoverChange={hover('addToSetlist')}
              >
                <ListMusicIcon isHovered={itemHot === 'addToSetlist'} size={16} className={HUB_ACTION_ICON_CLASS} />
                {t('hub.actions.addToSetlist')}
              </HubActionItem>
            ) : null}
            </div>
            {showSongExport || showOrderedExport ? (
              <>
                <HubActionSeparator />
                <div role="group" aria-label={t('hub.actions.export')}>
                  <div className="px-2 pb-1 pt-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
                    {t('hub.actions.export')}
                  </div>
                  <HubActionItem
                    onSelect={() => void (showSongExport ? onSongExport('chordpro') : onOrderedExport('chordpro'))}
                    onHoverChange={hover('exportChordpro')}
                  >
                    <FileTextIcon isHovered={itemHot === 'exportChordpro'} size={16} className={HUB_ACTION_ICON_CLASS} />
                    {t('hub.actions.exportChordPro')}
                  </HubActionItem>
                  <HubActionItem
                    onSelect={() => void (showSongExport ? onSongExport('worshippro') : onOrderedExport('worshippro'))}
                    onHoverChange={hover('exportWorshipPro')}
                  >
                    <FileStackIcon isHovered={itemHot === 'exportWorshipPro'} size={16} className={HUB_ACTION_ICON_CLASS} />
                    {t('hub.actions.exportWorshipPro')}
                  </HubActionItem>
                  <HubActionItem
                    onSelect={() => void (showSongExport ? onSongExport('songbeamer') : onOrderedExport('songbeamer'))}
                    onHoverChange={hover('exportSongBeamer')}
                  >
                    <ProjectorIcon isHovered={itemHot === 'exportSongBeamer'} size={16} className={HUB_ACTION_ICON_CLASS} />
                    {t('hub.actions.exportSongBeamer')}
                  </HubActionItem>
                  <HubActionItem
                    onSelect={() => void (showSongExport ? onSongExport('propresenter') : onOrderedExport('propresenter'))}
                    onHoverChange={hover('exportProPresenter')}
                  >
                    <OutputIcon isHovered={itemHot === 'exportProPresenter'} size={16} className={HUB_ACTION_ICON_CLASS} />
                    {t('hub.actions.exportProPresenter')}
                  </HubActionItem>
                  <HubActionItem
                    title={hubExportPdfHint}
                    onSelect={() => void (showSongExport ? onSongExport('pdf') : onOrderedExport('pdf'))}
                    onHoverChange={hover('exportPdf')}
                  >
                    <PrinterIcon isHovered={itemHot === 'exportPdf'} size={16} className={HUB_ACTION_ICON_CLASS} />
                    {t('hub.actions.exportPdf')}
                  </HubActionItem>
                </div>
              </>
            ) : null}
            <HubActionSeparator />
            <HubActionItem
              destructive
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
              onHoverChange={hover('delete')}
            >
              <TrashIcon isHovered={itemHot === 'delete'} size={16} className="shrink-0" />
              {t('hub.actions.delete')}
            </HubActionItem>
        </HubActionsDrawer>
      </div>
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
  onCreateRoomRequest,
}: {
  collection: Collection
  onDeleteRequest: DeleteReq
  networkOnline: boolean
  onCreateRoomRequest: (source: RoomSource) => void
}) {
  const reduceMotion = useReducedMotion()
  const { onClick, onKeyDown } = useHubListItemPlayerTap('collections', collection.id)
  const { src: coverSrc, onImageError: onCoverError } = useCoverImageSrc(collection.cover)

  return (
    <div className="relative">
      <motion.div
        className="flex cursor-pointer flex-col gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:gap-2"
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={collection.title}
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
      <div className="absolute right-1 top-1 z-10">
        <HubItemActionsMenu
          entity="collections"
          itemId={collection.id}
          itemLabel={collection.title}
          itemSongCount={collection.songs.length}
          onDeleteRequest={onDeleteRequest}
          networkOnline={networkOnline}
          onCreateRoomRequest={onCreateRoomRequest}
          variant="card"
        />
      </div>
    </div>
  )
})

const CollectionRow = memo(function CollectionRow({
  collection,
  onDeleteRequest,
  networkOnline,
  onCreateRoomRequest,
}: {
  collection: Collection
  onDeleteRequest: DeleteReq
  networkOnline: boolean
  onCreateRoomRequest: (source: RoomSource) => void
}) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const reduceMotion = useReducedMotion()
  const { onClick, onKeyDown } = useHubListItemPlayerTap('collections', collection.id)
  const { src: coverSrc, onImageError: onCoverError } = useCoverImageSrc(collection.cover)
  const { data: ownerTeam, isPending: ownerTeamPending, isError: ownerTeamError } =
    useTeamDetail(collection.owner)

  const ownerLabel = useMemo(() => {
    if (ownerTeamPending) return null
    if (ownerTeamError || !ownerTeam) return t('setlists.editor.teamUnavailable')
    return getTeamDisplayName(ownerTeam, user?.id, t)
  }, [ownerTeam, ownerTeamError, ownerTeamPending, t, user?.id])

  const songsCount = t('hub.meta.songsCount', { count: collection.songs.length })
  const subtitle = ownerLabel ? `${songsCount}, ${ownerLabel}` : songsCount

  return (
    <div className={cn(HUB_LIST_ROW_SHELL_CLASS, HUB_LIST_ROW_INSET_LAST_CLASS, 'cursor-default')}>
      <div className={HUB_LIST_AVATAR_CLASS}>
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
      <div className={cn(HUB_LIST_ROW_TEXT_COLUMN_CLASS, 'flex-row items-center gap-1')}>
        <motion.div
          className="min-w-0 flex-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          onClick={onClick}
          role="button"
          tabIndex={0}
          aria-label={collection.title}
          whileTap={reduceMotion ? undefined : tapFeedback}
          transition={tapTransition}
          onKeyDown={onKeyDown}
        >
          <p className={HUB_LIST_TITLE_CLASS}>{collection.title}</p>
          <p className={cn(HUB_LIST_SUBTITLE_CLASS, 'truncate')} title={subtitle}>
            {subtitle}
          </p>
        </motion.div>
        <HubItemActionsMenu
          entity="collections"
          itemId={collection.id}
          itemLabel={collection.title}
          itemSongCount={collection.songs.length}
          onDeleteRequest={onDeleteRequest}
          networkOnline={networkOnline}
          onCreateRoomRequest={onCreateRoomRequest}
        />
      </div>
    </div>
  )
})

const SongRow = memo(function SongRow({
  song,
  onDeleteRequest,
  networkOnline,
  onCreateRoomRequest,
}: {
  song: Song
  onDeleteRequest: DeleteReq
  networkOnline: boolean
  onCreateRoomRequest: (source: RoomSource) => void
}) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const reduceMotion = useReducedMotion()
  const { onClick, onKeyDown } = useHubListItemPlayerTap('songs', song.id)
  const title = songTitle(song)
  const sub = songSubtitle(song, t('hub.meta.unknownArtist'))
  const { data: ownerTeam, isPending: ownerTeamPending, isError: ownerTeamError } =
    useTeamDetail(song.owner)

  const ownerLabel = useMemo(() => {
    if (ownerTeamPending) return null
    if (ownerTeamError || !ownerTeam) return t('setlists.editor.teamUnavailable')
    return getTeamDisplayName(ownerTeam, user?.id, t)
  }, [ownerTeam, ownerTeamError, ownerTeamPending, t, user?.id])

  const subtitle = ownerLabel ? `${sub}, ${ownerLabel}` : sub

  return (
    <div className={cn('flex items-center', HUB_LIST_ROW_BORDER_CLASS)}>
      <motion.div
        className={cn(HUB_LIST_ROW_SHELL_CLASS, 'min-w-0 flex-1')}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={title}
        whileTap={reduceMotion ? undefined : tapFeedback}
        transition={tapTransition}
        onKeyDown={onKeyDown}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
          <p className={HUB_LIST_TITLE_CLASS}>{title}</p>
          <p className={cn(HUB_LIST_SUBTITLE_CLASS, 'truncate')} title={subtitle}>
            {subtitle}
          </p>
        </div>
      </motion.div>
      <HubItemActionsMenu
        entity="songs"
        itemId={song.id}
        itemLabel={title}
        onDeleteRequest={onDeleteRequest}
        networkOnline={networkOnline}
        hubSong={song}
        onCreateRoomRequest={onCreateRoomRequest}
      />
    </div>
  )
})

const SetlistRow = memo(function SetlistRow({
  setlist,
  onDeleteRequest,
  networkOnline,
  onCreateRoomRequest,
}: {
  setlist: Setlist
  onDeleteRequest: DeleteReq
  networkOnline: boolean
  onCreateRoomRequest: (source: RoomSource) => void
}) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const reduceMotion = useReducedMotion()
  const { onClick, onKeyDown } = useHubListItemPlayerTap('setlists', setlist.id)
  const { data: ownerTeam, isPending: ownerTeamPending, isError: ownerTeamError } =
    useTeamDetail(setlist.owner)

  const ownerLabel = useMemo(() => {
    if (ownerTeamPending) return null
    if (ownerTeamError || !ownerTeam) return t('setlists.editor.teamUnavailable')
    return getTeamDisplayName(ownerTeam, user?.id, t)
  }, [ownerTeam, ownerTeamError, ownerTeamPending, t, user?.id])

  return (
    <div className={cn('flex items-center', HUB_LIST_ROW_BORDER_CLASS)}>
      <motion.div
        className={cn(HUB_LIST_ROW_SHELL_CLASS, 'min-w-0 flex-1')}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={setlist.title}
        whileTap={reduceMotion ? undefined : tapFeedback}
        transition={tapTransition}
        onKeyDown={onKeyDown}
      >
        <div className="min-w-0 flex-1 flex flex-col justify-center py-0.5">
          <p className={HUB_LIST_TITLE_CLASS}>{setlist.title}</p>
          <p className={cn(HUB_LIST_SUBTITLE_CLASS, 'truncate')}>
            <SetlistItemCounts items={setlist.items} />
            {ownerLabel ? `, ${ownerLabel}` : null}
          </p>
        </div>
      </motion.div>
      <HubItemActionsMenu
        entity="setlists"
        itemId={setlist.id}
        itemLabel={setlist.title}
        onDeleteRequest={onDeleteRequest}
        networkOnline={networkOnline}
        onCreateRoomRequest={onCreateRoomRequest}
      />
    </div>
  )
})
