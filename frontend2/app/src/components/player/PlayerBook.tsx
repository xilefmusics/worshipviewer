import type { components } from '@/api/schema'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { BlobSlide } from '@/components/player/BlobSlide'
import { ChordsSlide } from '@/components/player/ChordsSlide'
import { PlayerOnlineIndicator } from '@/components/player/PlayerOnlineIndicator'
import { PlayerTocDrawer } from '@/components/player/PlayerTocDrawer'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover'
import { useChordFormatPreference } from '@/hooks/useChordFormatPreference'
import { useIsPhoneWidth } from '@/hooks/useMediaQuery'
import { useOnline } from '@/hooks/use-online'
import { useSetlistEvictionWatch } from '@/hooks/useSetlistEvictionWatch'
import { getChordEngine } from '@/lib/chord-engine'
import { writeChordFormatPreference, type ChordFormatPreference } from '@/lib/chord-format'
import { effectiveScrollType } from '@/lib/player/effective-scroll-type'
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
  setChordFormatViewState,
  clearTransposeForItem,
  setScrollTypeViewState,
  setTransposeForItem,
  toggleOrientationViewState,
  writePlayerViewState,
  type PlayerViewState,
} from '@/lib/player/player-view-state'
import type { PlayerEntityType } from '@/lib/player-route'
import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'
import { resolveSongDataKey } from '@/lib/setlist-song-links'
import { cn } from '@/lib/utils'

type Player = components['schemas']['Player']
type ScrollType = components['schemas']['ScrollType']

const SCROLL_TYPES: ScrollType[] = [
  'one_page',
  'half_page',
  'two_page',
  'book',
  'two_half_page',
]

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

function scrollTypeLabelKey(scrollType: ScrollType): string {
  return `player.scrollType.${scrollType}`
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
  const isPhone = useIsPhoneWidth()
  const globalChordFormat = useChordFormatPreference()
  const tocTriggerRef = useRef<HTMLButtonElement>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [scrollMenuOpen, setScrollMenuOpen] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const defaults = useMemo(
    () => ({
      scrollType: player.scroll_type,
      orientation: player.orientation,
      scrollTypeCacheOtherOrientation: player.scroll_type_cache_other_orientation,
    }),
    [player],
  )

  const [viewState, setViewState] = useState<PlayerViewState>(() =>
    readPlayerViewState(type, id, defaults),
  )

  useEffect(() => {
    writePlayerViewState(type, id, viewState)
  }, [type, id, viewState])

  const effectiveScroll = effectiveScrollType(viewState.scrollType, isPhone)
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

  const chordFormat: ChordFormatPreference =
    viewState.chordFormat ?? globalChordFormat

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
      const action = playerKeyboardAction(e.key, e.target, {
        tocOpen,
        popoverOpen: popoverOpen || scrollMenuOpen,
      })
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
      if (action === 'toggleToc' && showToc) {
        e.preventDefault()
        setTocOpen((o) => !o)
        return
      }
      if (action === 'toggleOrientation') {
        e.preventDefault()
        setViewState((s) => toggleOrientationViewState(s))
        return
      }
      if (action === 'openScrollMenu') {
        e.preventDefault()
        setScrollMenuOpen(true)
        return
      }
      if (action === 'escape') {
        if (tocOpen) {
          e.preventDefault()
          setTocOpen(false)
          tocTriggerRef.current?.focus()
          return
        }
        if (popoverOpen || scrollMenuOpen) {
          e.preventDefault()
          setPopoverOpen(false)
          setScrollMenuOpen(false)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, navBlocked, popoverOpen, scrollMenuOpen, showToc, tocOpen])

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

  const scrollOptions = SCROLL_TYPES.filter((mode) => {
    if (isPhone && (mode === 'two_page' || mode === 'two_half_page')) return false
    return true
  })

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (navBlocked) return
    const start = touchStartRef.current
    touchStartRef.current = null
    const touch = e.changedTouches[0]
    if (!start || !touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return

    if (dx > 0) dispatch({ type: 'prev' })
    else dispatch({ type: 'next' })
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
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-[var(--color-foreground)]">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/80 sm:px-3 sm:py-3">
        <Button type="button" variant="outline" size="sm" asChild className="shrink-0">
          <Link to={backTo}>{t('player.close')}</Link>
        </Button>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t('player.position', { current: nav.index + 1, total: itemsLen })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showToc ? (
            <Button
              ref={tocTriggerRef}
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={t('player.toc.open')}
              onClick={() => setTocOpen(true)}
            >
              <span aria-hidden>☰</span>
            </Button>
          ) : null}

          <DropdownMenu open={scrollMenuOpen} onOpenChange={setScrollMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t('player.scrollMode.current', {
                  mode: t(scrollTypeLabelKey(viewState.scrollType)),
                })}
              >
                <span aria-hidden>⇕</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {scrollOptions.map((mode) => (
                <DropdownMenuItem
                  key={mode}
                  onSelect={() => {
                    setViewState((s) => setScrollTypeViewState(s, mode))
                    setScrollMenuOpen(false)
                  }}
                >
                  {t(scrollTypeLabelKey(mode))}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t('player.orientation.current', {
              orientation: t(`player.orientation.${viewState.orientation}`),
            })}
            onClick={() => setViewState((s) => toggleOrientationViewState(s))}
          >
            <span aria-hidden>{viewState.orientation === 'portrait' ? '▯' : '▭'}</span>
          </Button>

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

          {showChordsControls ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-8 px-2 text-xs sm:inline-flex"
              aria-label={t('player.chordFormat.current', {
                format: t(`settings.chordFormat.${chordFormat}`),
              })}
              onClick={() => {
                const next: ChordFormatPreference =
                  chordFormat === 'letters' ? 'nashville' : 'letters'
                writeChordFormatPreference(next)
                setViewState((s) => setChordFormatViewState(s, next))
              }}
            >
              {t(`settings.chordFormat.${chordFormat}`)}
            </Button>
          ) : null}

          <PlayerOnlineIndicator />
        </div>
      </header>

      {evicted ? (
        <p className="bg-[var(--color-danger)]/10 px-4 py-2 text-center text-xs text-[var(--color-danger)]" role="status" aria-live="polite">
          {t('player.evicted')}
        </p>
      ) : null}

      <div
        role="main"
        aria-label={t('player.mainAria', { title: title || t('player.untitled') })}
        className="min-h-0 flex-1"
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
            orientation={viewState.orientation}
            scrollType={effectiveScroll}
            pageOffset={nav.pageOffset}
          />
        )}
      </div>

      <footer
        className={cn(
          'sticky bottom-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-[var(--color-border)]',
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

      {showToc ? (
        <PlayerTocDrawer
          open={tocOpen}
          onOpenChange={setTocOpen}
          toc={player.toc}
          currentIndex={nav.index}
          onSelect={(idx) => dispatch({ type: 'jump', index: idx })}
          triggerRef={tocTriggerRef}
        />
      ) : null}
    </div>
  )
}
