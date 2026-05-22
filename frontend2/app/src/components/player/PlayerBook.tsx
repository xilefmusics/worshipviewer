import type { components } from '@/api/schema'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { BlobSlide } from '@/components/player/BlobSlide'
import { ChordsSlide } from '@/components/player/ChordsSlide'
import { PlayerTocSidebar } from '@/components/player/PlayerTocSidebar'
import { ChevronLeftIcon } from '@/components/icons/lucide-animated/chevron-left-icon'
import { Button } from '@/components/ui/button'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover'
import { useChordFormatPreference } from '@/hooks/useChordFormatPreference'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePlayerScrollPreference } from '@/hooks/usePlayerScrollPreference'
import { useOnline } from '@/hooks/use-online'
import { useSetlistEvictionWatch } from '@/hooks/useSetlistEvictionWatch'
import { getChordEngine } from '@/lib/chord-engine'
import { effectiveScrollType } from '@/lib/player/effective-scroll-type'
import { scrollTypeForOrientation } from '@/lib/player-scroll-preference'
import {
  initialPlayerNavState,
  isAtEnd,
  isAtStart,
  nextPlayerState,
  type PlayerNavState,
} from '@/lib/player/next-player-state'
import {
  hasChordsItems,
  itemTypeAt,
  resolvePlayerItemKey,
  tocEntryForIndex,
} from '@/lib/player/player-helpers'
import { playerKeyboardAction } from '@/lib/player/player-keyboard'
import { prefetchNextItemIndex } from '@/lib/player/prefetch-next-item'
import {
  readPlayerViewState,
  clearTransposeForItem,
  setTransposeForItem,
  writePlayerViewState,
  type PlayerViewState,
} from '@/lib/player/player-view-state'
import type { PlayerEntityType } from '@/lib/player-route'
import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'
import { resolveSongDataKey } from '@/lib/setlist-song-links'
import { cn } from '@/lib/utils'

type Player = components['schemas']['Player']

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

function backAriaKeyForPlayerType(type: PlayerEntityType): string {
  switch (type) {
    case 'collection':
      return 'collections.editor.backToList'
    case 'song':
      return 'songs.editor.backToList'
    case 'setlist':
      return 'setlists.editor.backToList'
  }
}

function isMiddlePointer(clientX: number, clientY: number, rect: DOMRect): boolean {
  const relX = (rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5)
  const relY = (rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5)
  return relX >= 0.2 && relX <= 0.8 && relY >= 0.2 && relY <= 0.8
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof Element &&
      target.closest('button, a, input, textarea, select, [role="button"], [role="link"]'),
  )
}

type PlayerBookProps = {
  type: PlayerEntityType
  id: string
  player: Player
  allowNetworkFetch: boolean
  resourceTitle?: string
  deletedReconciled?: boolean
}

export function PlayerBook({
  type,
  id,
  player,
  allowNetworkFetch,
  resourceTitle,
  deletedReconciled,
}: PlayerBookProps) {
  const { t } = useTranslation()
  const online = useOnline()
  const chordFormat = useChordFormatPreference()
  const scrollPreferences = usePlayerScrollPreference()
  const isLandscapeViewport = useMediaQuery('(orientation: landscape)')
  const sheetOrientation = isLandscapeViewport ? 'landscape' : 'portrait'
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const chromeToggleHandledRef = useRef(false)

  const [viewState, setViewState] = useState<PlayerViewState>(() => readPlayerViewState(type, id))

  useEffect(() => {
    writePlayerViewState(type, id, viewState)
  }, [type, id, viewState])

  const effectiveScroll = effectiveScrollType(
    scrollTypeForOrientation(sheetOrientation, scrollPreferences),
  )
  const itemsLen = player.items.length

  const [nav, setNav] = useState<PlayerNavState>(() =>
    initialPlayerNavState(player.index, itemsLen),
  )

  const navConfig = useMemo(
    () => ({
      itemCount: itemsLen,
      betweenItems: player.between_items,
      scrollType: effectiveScroll,
      itemTypeAt: (index: number) => itemTypeAt(player.items, index),
    }),
    [itemsLen, player.between_items, effectiveScroll, player.items],
  )

  const currentItem = player.items[nav.index]
  const tocRow = tocEntryForIndex(player.toc, nav.index)
  const showToc = player.toc.length > 0
  const showChordsControls = hasChordsItems(player.items)
  const evicted = useSetlistEvictionWatch(type === 'setlist' ? id : undefined, type === 'setlist')

  const dispatch = useCallback(
    (action: Parameters<typeof nextPlayerState>[1]) => {
      setNav((state) => nextPlayerState(state, action, navConfig))
    },
    [navConfig],
  )

  const atStart = isAtStart(nav, navConfig)
  const atEnd = isAtEnd(nav, navConfig)
  const navBlocked = evicted

  useEffect(() => {
    if (deletedReconciled) {
      toast.info(t('player.setlistDeleted'))
    }
  }, [deletedReconciled, t])

  useEffect(() => {
    const prefetchIndex = prefetchNextItemIndex(online, nav.index, itemsLen)
    if (prefetchIndex == null) return

    const controller = new AbortController()
    const nextItem = player.items[prefetchIndex]
    if (!nextItem) return () => controller.abort()

    void (async () => {
      if (nextItem.type === 'blob' && allowNetworkFetch) {
        const { fetchBlobBinaryWithMime } = await import('@/api/blob-data')
        await fetchBlobBinaryWithMime(nextItem.blob_id, controller.signal)
      } else if (nextItem.type === 'chords') {
        try {
          const engine = await getChordEngine()
          const key = resolveSongDataKey(nextItem.song.data as Record<string, unknown>)
          engine.renderA4Html(nextItem.song.data, { key: key ?? undefined })
        } catch {
          // Prefetch is best-effort
        }
      }
    })()

    return () => controller.abort()
  }, [nav.index, online, itemsLen, player.items, allowNetworkFetch])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = playerKeyboardAction(e.key, e.target, { popoverOpen })
      if (!action) return

      if (action === 'prev') {
        e.preventDefault()
        if (!navBlocked) dispatch({ type: 'prev' })
        return
      }
      if (action === 'next') {
        e.preventDefault()
        if (!navBlocked) dispatch({ type: 'next' })
        return
      }
      if (action === 'home') {
        e.preventDefault()
        if (!navBlocked) dispatch({ type: 'home' })
        return
      }
      if (action === 'end') {
        e.preventDefault()
        if (!navBlocked) dispatch({ type: 'end' })
        return
      }
      if (action === 'escape' && popoverOpen) {
        e.preventDefault()
        setPopoverOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, navBlocked, popoverOpen])

  const backTo = hubPathForPlayerType(type)
  const title = resourceTitle ?? tocRow?.title ?? ''

  const localTranspose = viewState.transposeByItem[nav.index]
  const slotKey =
    currentItem?.type === 'chords'
      ? resolveSongDataKey(currentItem.song.data as Record<string, unknown>)
      : null
  const displayKey =
    currentItem?.type === 'chords'
      ? resolvePlayerItemKey(currentItem, type, slotKey, localTranspose)
      : null

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function toggleChromeAt(clientX: number, clientY: number, target: EventTarget | null, rect: DOMRect) {
    if (isInteractiveTarget(target)) return
    if (!isMiddlePointer(clientX, clientY, rect)) return
    setChromeVisible((visible) => !visible)
    return true
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    const touch = e.changedTouches[0]
    if (!start || !touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const isSwipe = Math.abs(dx) >= 48 && Math.abs(dx) >= Math.abs(dy) * 1.2

    if (isSwipe) {
      if (navBlocked) return
      if (dx > 0) dispatch({ type: 'prev' })
      else dispatch({ type: 'next' })
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    if (toggleChromeAt(touch.clientX, touch.clientY, e.target, rect)) {
      chromeToggleHandledRef.current = true
    }
  }

  function onMainClick(e: React.MouseEvent<HTMLElement>) {
    if (chromeToggleHandledRef.current) {
      chromeToggleHandledRef.current = false
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    toggleChromeAt(e.clientX, e.clientY, e.target, rect)
  }

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
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-foreground)]">
      {chromeVisible ? (
      <header className="z-10 flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/80 sm:px-3 sm:py-3">
        <Button type="button" variant="outline" size="icon" asChild className="shrink-0">
          <Link to={backTo} aria-label={t(backAriaKeyForPlayerType(type))}>
            <ChevronLeftIcon className="text-[var(--color-foreground)]" size={20} />
          </Link>
        </Button>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t('player.position', { current: nav.index + 1, total: itemsLen })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showChordsControls && currentItem.type === 'chords' ? (
            <PopoverRoot open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  aria-label={t('player.transpose.current', {
                    key: displayKey ?? t('player.transpose.default'),
                  })}
                >
                  {displayKey ?? t('player.transpose.default')}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <div className="grid grid-cols-4 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={localTranspose === undefined ? 'default' : 'outline'}
                    className="col-span-4"
                    onClick={() => {
                      setViewState((s) => clearTransposeForItem(s, nav.index))
                      setPopoverOpen(false)
                    }}
                  >
                    {t('player.transpose.default')}
                  </Button>
                  {MUSICAL_KEYS.map((key) => (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={displayKey === key ? 'default' : 'outline'}
                      onClick={() => {
                        setViewState((s) => setTransposeForItem(s, nav.index, key))
                        setPopoverOpen(false)
                      }}
                    >
                      {key}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </PopoverRoot>
          ) : null}
        </div>
      </header>
      ) : null}

      {evicted ? (
        <p className="shrink-0 bg-[var(--color-danger)]/10 px-4 py-2 text-center text-xs text-[var(--color-danger)]" role="status" aria-live="polite">
          {t('player.evicted')}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {chromeVisible && showToc ? (
          <PlayerTocSidebar
            toc={player.toc}
            currentIndex={nav.index}
            onSelect={(idx) => dispatch({ type: 'jump', index: idx })}
          />
        ) : null}

        <div
          role="main"
          aria-label={t('player.mainAria', { title: title || t('player.untitled') })}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          onClick={onMainClick}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <p className="sr-only" aria-live="polite">
            {t('player.itemAnnounce', {
              current: nav.index + 1,
              total: itemsLen,
              title: tocRow?.title ?? '',
            })}
          </p>

          {currentItem.type === 'blob' ? (
            <BlobSlide blobId={currentItem.blob_id} allowNetworkFetch={allowNetworkFetch} />
          ) : (
            <ChordsSlide
              song={currentItem.song}
              displayKey={displayKey}
              chordFormat={chordFormat}
              orientation={sheetOrientation}
            />
          )}
        </div>
      </div>

      {chromeVisible ? (
      <footer
        className={cn(
          'z-10 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-[var(--color-border)]',
          'bg-[var(--color-surface)]/95 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/80',
        )}
      >
        <Button
          type="button"
          variant="outline"
          disabled={atStart || navBlocked}
          onClick={() => dispatch({ type: 'prev' })}
          aria-keyshortcuts="ArrowLeft"
        >
          {t('player.prev')}
        </Button>
        <p className="min-w-0 truncate px-2 text-center text-xs text-[var(--color-muted-foreground)]">
          {tocRow ? `${tocRow.nr} · ${tocRow.title}` : ''}
        </p>
        <Button
          type="button"
          variant="outline"
          className="justify-self-end"
          disabled={atEnd || navBlocked}
          onClick={() => dispatch({ type: 'next' })}
          aria-keyshortcuts="ArrowRight"
        >
          {t('player.next')}
        </Button>
      </footer>
      ) : null}
    </div>
  )
}
