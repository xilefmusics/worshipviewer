import type { components } from '@/api/schema'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { setSongLikeStatus } from '@/api/songs-like'
import { BlobSlide } from '@/components/player/BlobSlide'
import { ChordsSlide } from '@/components/player/ChordsSlide'
import { ChordsThreeColumnSlide } from '@/components/player/ChordsThreeColumnSlide'
import { PlayerBookSpread } from '@/components/player/PlayerBookSpread'
import { PlayerLikeHeartBurst } from '@/components/player/PlayerLikeHeartBurst'
import { PlayerTocSidebar } from '@/components/player/PlayerTocSidebar'
import { ChevronLeftIcon } from '@/components/icons/lucide-animated/chevron-left-icon'
import { PlayerEditMenu } from '@/components/player/PlayerEditMenu'
import { SettingsIcon } from '@/components/icons/lucide-animated/settings-icon'
import { Button } from '@/components/ui/button'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover'
import { useChordFormatPreference } from '@/hooks/useChordFormatPreference'
import { useIsPhoneWidth, useMediaQuery } from '@/hooks/useMediaQuery'
import { usePlayerLayoutPreference } from '@/hooks/usePlayerScrollPreference'
import { useOnline } from '@/hooks/use-online'
import { usePlayerIndexSearchSync } from '@/hooks/usePlayerIndexSearchSync'
import { useSetlistEvictionWatch } from '@/hooks/useSetlistEvictionWatch'
import { getChordEngine } from '@/lib/chord-engine'
import { chordFormatToRepresentation, writeChordFormatPreference } from '@/lib/chord-format'
import {
  effectiveScrollType,
  isMultiColumnScrollMode,
  isMultiColumnWithNextPreviewMode,
  layoutPreferenceToScrollType,
  nextPlayerScrollType,
  resolveFreeColumnCount,
  scrollTypeToLayoutPreference,
} from '@/lib/player/effective-scroll-type'
import {
  bookSpreadNavScrollType,
  bookSpreadRightIndex,
  shouldUseBookSpreadLayout,
} from '@/lib/player/book-spread'
import {
  layoutPreferenceForOrientation,
  scrollTypeForOrientation,
  writePlayerLayoutLandscape,
  writePlayerLayoutPortrait,
} from '@/lib/player-scroll-preference'
import {
  nextPlayerState,
  resolveInitialPlayerNav,
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
import { resolveTransposeKey } from '@/lib/player/transpose-key'
import {
  readPlayerViewState,
  clearTransposeForItem,
  clearLanguageForItem,
  setPlayerNavPosition,
  setTransposeForItem,
  setLanguageForItem,
  writePlayerViewState,
  type PlayerViewState,
} from '@/lib/player/player-view-state'
import {
  PLAYER_HEADER_ICON_SIZE,
  PLAYER_TOC_WIDTH_PX,
  playerHeaderIconButtonClass,
  playerHeaderIconClass,
} from '@/lib/player/player-chrome'
import type { PlayerMode } from '@/lib/player/player-mode'
import type { PlayerEntityType } from '@/lib/player-route'
import { buildSongEditorReturnSearch } from '@/lib/player/player-editor-return'
import { resolveSongLanguageIndex, songLanguageOptions } from '@/lib/player/song-language'
import { buildSettingsSearch } from '@/lib/settings-route'
import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'
import { languageIndexForSongLink, resolveSongDataKey } from '@/lib/setlist-song-links'
import { cn } from '@/lib/utils'

type Player = components['schemas']['Player']
type PlayerItem = Player['items'][number]
type TocItem = Player['toc'][number]

function initialLikedBySongId(player: Player): Record<string, boolean> {
  const liked: Record<string, boolean> = {}
  for (const row of player.toc) {
    if (row.id) liked[row.id] = row.liked
  }
  for (const item of player.items) {
    if (item.type === 'chords') {
      liked[item.song.id] = item.song.user_specific_addons.liked
    }
  }
  return liked
}

function mergeTocLikes(toc: TocItem[], likedBySongId: Record<string, boolean>): TocItem[] {
  return toc.map((row) => ({
    ...row,
    liked: row.id ? (likedBySongId[row.id] ?? row.liked) : row.liked,
  }))
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

type ViewportPointerZone = 'left' | 'middle' | 'right'

function viewportPointerZone(clientX: number, rect: DOMRect): ViewportPointerZone {
  const relX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5
  if (relX < 0.4) return 'left'
  if (relX > 0.6) return 'right'
  return 'middle'
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof Element &&
      target.closest('button, a, input, textarea, select, [role="button"], [role="link"]'),
  )
}

const PLAYER_CHROME_EASE = [0.25, 0.1, 0.25, 1] as const
const VIEWPORT_DOUBLE_TAP_MS = 300
const VIEWPORT_TAP_MOVE_SLOP_PX = 10
const VIEWPORT_SWIPE_MIN_PX = 48

const playerChromeHeaderClass =
  'pointer-events-auto flex shrink-0 items-center gap-2 overflow-hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 sm:px-3 sm:py-3'

type PlayerBookProps = {
  type: PlayerEntityType
  id: string
  player: Player
  initialIndex?: number
  mode?: PlayerMode
  allowNetworkFetch: boolean
  resourceTitle?: string
  deletedReconciled?: boolean
}

export function PlayerBook({
  type,
  id,
  player,
  initialIndex,
  mode = 'normal',
  allowNetworkFetch,
  resourceTitle,
  deletedReconciled,
}: PlayerBookProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnline()
  const chordFormat = useChordFormatPreference()
  const layoutPreferences = usePlayerLayoutPreference()
  const isPhoneViewport = useIsPhoneWidth()
  const isLandscapeViewport = useMediaQuery('(orientation: landscape)')
  const isSmViewport = useMediaQuery('(min-width: 640px)')
  const tocInsetPx = isSmViewport ? PLAYER_TOC_WIDTH_PX.sm : PLAYER_TOC_WIDTH_PX.base
  const sheetOrientation = isLandscapeViewport ? 'landscape' : 'portrait'
  const reduceMotion = useReducedMotion()
  const chromeTransition = reduceMotion ? { duration: 0 } : { duration: 0.22, ease: PLAYER_CHROME_EASE }
  const [keyPopoverOpen, setKeyPopoverOpen] = useState(false)
  const [languagePopoverOpen, setLanguagePopoverOpen] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchMovedRef = useRef(false)
  const suppressClickRef = useRef(false)
  const chromeToggleHandledRef = useRef(false)
  const lastViewportTapTimeRef = useRef<number | null>(null)
  const [likeBurstKey, setLikeBurstKey] = useState(0)
  const [likeBurstActive, setLikeBurstActive] = useState(false)

  const [viewState, setViewState] = useState<PlayerViewState>(() => readPlayerViewState(type, id))
  const serverLikes = useMemo(() => initialLikedBySongId(player), [player])
  const [likeState, setLikeState] = useState<{
    player: Player
    delta: Record<string, boolean>
  }>(() => ({
    player,
    delta: {},
  }))
  const likedBySongId = useMemo(
    () => ({
      ...serverLikes,
      ...(likeState.player === player ? likeState.delta : {}),
    }),
    [likeState, player, serverLikes],
  )

  useEffect(() => {
    writePlayerViewState(type, id, viewState)
  }, [type, id, viewState])

  const layoutPreference = layoutPreferenceForOrientation(sheetOrientation, layoutPreferences)
  const itemsLen = player.items.length

  const [nav, setNav] = useState<PlayerNavState>(() => {
    const saved = readPlayerViewState(type, id)
    return resolveInitialPlayerNav({
      savedItemIndex: saved.itemIndex,
      savedPageOffset: saved.pageOffset,
      initialIndex,
      serverIndex: player.index,
      itemCount: itemsLen,
    })
  })

  const currentItem = player.items[nav.index]
  const currentItemType =
    currentItem?.type === 'blob'
      ? 'blob'
      : currentItem?.type === 'chords'
        ? 'chords'
        : null

  const resolvedFreeColumnCount =
    layoutPreference.mode === 'free'
      ? resolveFreeColumnCount(layoutPreference.columnCount, {
          isPhone: isPhoneViewport,
          isLandscape: sheetOrientation === 'landscape',
        })
      : null
  const effectiveScroll = layoutPreferenceToScrollType(
    layoutPreference,
    resolvedFreeColumnCount ?? undefined,
  )
  const bookSpread = shouldUseBookSpreadLayout({
    scrollType: effectiveScroll,
    layoutPreference,
    orientation: sheetOrientation,
    isPhone: isPhoneViewport,
    itemType: currentItemType,
  })
  const freeColumnCount = bookSpread ? null : resolvedFreeColumnCount
  const navScrollType = bookSpreadNavScrollType(effectiveScroll, bookSpread)

  useEffect(() => {
    queueMicrotask(() => {
      setViewState((state) => {
        const indexMatch = state.itemIndex === nav.index
        const offsetMatch = state.pageOffset === nav.pageOffset
        if (indexMatch && offsetMatch) return state
        return setPlayerNavPosition(state, nav.index, nav.pageOffset)
      })
    })
  }, [nav.index, nav.pageOffset])

  const navConfig = useMemo(
    () => ({
      itemCount: itemsLen,
      betweenItems: player.between_items,
      scrollType: navScrollType,
      itemTypeAt: (index: number) => itemTypeAt(player.items, index),
    }),
    [itemsLen, player.between_items, navScrollType, player.items],
  )
  const displayToc = useMemo(
    () => mergeTocLikes(player.toc, likedBySongId),
    [player.toc, likedBySongId],
  )
  const tocRow = tocEntryForIndex(displayToc, nav.index)
  const showToc = displayToc.length > 0
  const showChordsControls = hasChordsItems(player.items)
  const evicted = useSetlistEvictionWatch(type === 'setlist' ? id : undefined, type === 'setlist')

  const dispatch = useCallback(
    (action: Parameters<typeof nextPlayerState>[1]) => {
      setNav((state) => nextPlayerState(state, action, navConfig))
    },
    [navConfig, setNav],
  )

  const navBlocked = evicted

  usePlayerIndexSearchSync(type, id, nav.index, mode)

  const triggerLikeBurst = useCallback(() => {
    setLikeBurstKey((key) => key + 1)
    setLikeBurstActive(true)
  }, [])

  const toggleCurrentSongLike = useCallback(() => {
    if (!online || !allowNetworkFetch || currentItem?.type !== 'chords') return
    const songId = currentItem.song.id
    const previousLiked = likedBySongId[songId] ?? currentItem.song.user_specific_addons.liked
    const nextLiked = !previousLiked
    setLikeState((state) => ({
      player,
      delta: {
        ...(state.player === player ? state.delta : {}),
        [songId]: nextLiked,
      },
    }))
    if (nextLiked) triggerLikeBurst()
    void setSongLikeStatus(queryClient, { id: songId, liked: nextLiked }).catch(() => {
      setLikeState((state) => ({
        player,
        delta: {
          ...(state.player === player ? state.delta : {}),
          [songId]: previousLiked,
        },
      }))
      toast.error(t('player.loadFailed'))
    })
  }, [allowNetworkFetch, currentItem, likedBySongId, online, player, queryClient, t, triggerLikeBurst])

  useEffect(() => {
    if (deletedReconciled) {
      toast.info(t('player.setlistDeleted'))
    }
  }, [deletedReconciled, t])

  useEffect(() => {
    const prefetchIndices = new Set<number>()
    const primary = prefetchNextItemIndex(online, nav.index, itemsLen)
    if (primary != null) prefetchIndices.add(primary)
    if (bookSpread) {
      const rightIndex = bookSpreadRightIndex(nav.index, itemsLen)
      if (rightIndex != null) prefetchIndices.add(rightIndex)
      const afterSpread = prefetchNextItemIndex(online, rightIndex ?? nav.index, itemsLen)
      if (afterSpread != null) prefetchIndices.add(afterSpread)
    } else if (isMultiColumnWithNextPreviewMode(effectiveScroll)) {
      const nextIndex = nav.index + 1
      if (nextIndex < itemsLen) prefetchIndices.add(nextIndex)
    }

    if (prefetchIndices.size === 0) return

    const controller = new AbortController()

    void (async () => {
      for (const prefetchIndex of prefetchIndices) {
        const nextItem = player.items[prefetchIndex]
        if (!nextItem) continue

        if (nextItem.type === 'blob' && allowNetworkFetch) {
          const { fetchBlobBinaryWithMime } = await import('@/api/blob-data')
          await fetchBlobBinaryWithMime(nextItem.blob_id, controller.signal)
        } else if (nextItem.type === 'chords') {
          try {
            const engine = await getChordEngine()
            const key = resolveSongDataKey(nextItem.song.data as Record<string, unknown>)
            const languageOptions = songLanguageOptions(nextItem.song.data as Record<string, unknown>)
            const slotLanguageIndex = languageIndexForSongLink(
              nextItem.song.data as Record<string, unknown>,
              nextItem.language,
            )
            const selectedLanguageIndex = resolveSongLanguageIndex(
              languageOptions,
              viewState.languageByItem?.[prefetchIndex] ?? slotLanguageIndex,
            )
            const languageIndex = selectedLanguageIndex > 0 ? selectedLanguageIndex : null
            const renderOpts = {
              key: key ?? undefined,
              language: languageIndex ?? undefined,
              representation: chordFormatToRepresentation(chordFormat),
            }
            if (isMultiColumnScrollMode(effectiveScroll)) {
              engine.renderA4SectionHtmls(nextItem.song.data, renderOpts)
            } else {
              engine.renderA4Html(nextItem.song.data, renderOpts)
            }
          } catch {
            // Prefetch is best-effort
          }
        }
      }
    })()

    return () => controller.abort()
  }, [
    nav.index,
    online,
    itemsLen,
    player.items,
    allowNetworkFetch,
    bookSpread,
    effectiveScroll,
    chordFormat,
    viewState.languageByItem,
  ])

  const backTo = hubPathForPlayerType(type)
  const localTranspose = viewState.transposeByItem[nav.index]
  const slotKey =
    currentItem?.type === 'chords'
      ? resolveSongDataKey(currentItem.song.data as Record<string, unknown>)
      : null
  const displayKey =
    currentItem?.type === 'chords'
      ? resolvePlayerItemKey(currentItem, type, slotKey, localTranspose)
      : null
  const currentLanguageOptions =
    currentItem?.type === 'chords' ? songLanguageOptions(currentItem.song.data as Record<string, unknown>) : []
  const currentLanguageIndex =
    currentItem?.type === 'chords' ? (selectedLanguageIndexForItem(currentItem, nav.index) ?? 0) : 0
  const currentLanguageLabel =
    currentLanguageOptions[currentLanguageIndex]?.label ?? `L${currentLanguageIndex + 1}`
  const showLanguageSelector = currentItem?.type === 'chords' && currentLanguageOptions.length > 1

  const playerReturnContext = useMemo(
    () => ({ playerType: type, playerId: id, playerIndex: nav.index }),
    [type, id, nav.index],
  )

  const navigateToSongEditor = useCallback(() => {
    if (currentItem?.type !== 'chords') return
    void navigate({
      to: '/songs/$songId',
      params: { songId: currentItem.song.id },
      search: buildSongEditorReturnSearch(playerReturnContext),
    })
  }, [currentItem, navigate, playerReturnContext])

  const navigateToResourceEditor = useCallback(() => {
    if (type === 'setlist') {
      void navigate({
        to: '/setlists/$setlistId',
        params: { setlistId: id },
        search: buildSongEditorReturnSearch(playerReturnContext),
      })
      return
    }
    if (type === 'collection') {
      void navigate({
        to: '/collections/$collectionId',
        params: { collectionId: id },
        search: buildSongEditorReturnSearch(playerReturnContext),
      })
    }
  }, [id, navigate, playerReturnContext, type])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = playerKeyboardAction(e.key, e.target, {
        popoverOpen: keyPopoverOpen || languagePopoverOpen,
        chromeVisible,
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
      if (action === 'escape') {
        e.preventDefault()
        if (keyPopoverOpen || languagePopoverOpen) {
          setKeyPopoverOpen(false)
          setLanguagePopoverOpen(false)
        } else void navigate({ to: backTo })
        return
      }
      if (action === 'toggleChrome') {
        e.preventDefault()
        setKeyPopoverOpen(false)
        setLanguagePopoverOpen(false)
        setChromeVisible((visible) => !visible)
        return
      }
      if (action === 'cycleScroll') {
        e.preventDefault()
        const currentScroll = scrollTypeForOrientation(sheetOrientation, layoutPreferences)
        const next = nextPlayerScrollType(effectiveScrollType(currentScroll))
        const nextLayout = scrollTypeToLayoutPreference(next)
        if (layoutPreferences.linkedOrientations) writePlayerLayoutPortrait(nextLayout)
        else if (sheetOrientation === 'landscape') writePlayerLayoutLandscape(nextLayout)
        else writePlayerLayoutPortrait(nextLayout)
        return
      }
      if (action === 'edit') {
        e.preventDefault()
        navigateToSongEditor()
        return
      }
      if (action === 'toggleChordFormat') {
        e.preventDefault()
        writeChordFormatPreference(chordFormat === 'nashville' ? 'letters' : 'nashville')
        return
      }
      if (action === 'toggleLike') {
        e.preventDefault()
        toggleCurrentSongLike()
        return
      }

      if (currentItem?.type !== 'chords') return

      if (typeof action === 'object' && action.type === 'setTransposeKey') {
        e.preventDefault()
        setViewState((state) => setTransposeForItem(state, nav.index, action.key))
        setKeyPopoverOpen(false)
        return
      }
      if (action === 'resetTranspose') {
        e.preventDefault()
        setViewState((state) => clearTransposeForItem(state, nav.index))
        setKeyPopoverOpen(false)
        return
      }
      if (action === 'transposeUp') {
        e.preventDefault()
        const nextKey = resolveTransposeKey(displayKey, 1)
        if (nextKey) {
          setViewState((state) => setTransposeForItem(state, nav.index, nextKey))
          setKeyPopoverOpen(false)
        }
        return
      }
      if (action === 'transposeDown') {
        e.preventDefault()
        const nextKey = resolveTransposeKey(displayKey, -1)
        if (nextKey) {
          setViewState((state) => setTransposeForItem(state, nav.index, nextKey))
          setKeyPopoverOpen(false)
        }
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    allowNetworkFetch,
    backTo,
    chordFormat,
    currentItem,
    dispatch,
    displayKey,
    navigateToSongEditor,
    nav.index,
    navBlocked,
    navigate,
    keyPopoverOpen,
    languagePopoverOpen,
    chromeVisible,
    layoutPreferences,
    sheetOrientation,
    toggleCurrentSongLike,
    type,
    id,
  ])

  const title = resourceTitle ?? tocRow?.title ?? ''

  function displayKeyForItem(item: PlayerItem, itemIndex: number): string | null {
    if (item.type !== 'chords') return null
    const itemSlotKey = resolveSongDataKey(item.song.data as Record<string, unknown>)
    return resolvePlayerItemKey(item, type, itemSlotKey, viewState.transposeByItem[itemIndex])
  }

  function languageOptionsForItem(item: PlayerItem) {
    if (item.type !== 'chords') return []
    return songLanguageOptions(item.song.data as Record<string, unknown>)
  }

  function selectedLanguageIndexForItem(item: PlayerItem, itemIndex: number): number | null {
    if (item.type !== 'chords') return null
    const options = languageOptionsForItem(item)
    if (options.length === 0) return null
    const slotLanguageIndex = languageIndexForSongLink(
      item.song.data as Record<string, unknown>,
      item.language,
    )
    return resolveSongLanguageIndex(options, viewState.languageByItem?.[itemIndex] ?? slotLanguageIndex)
  }

  function renderLanguageIndexForItem(item: PlayerItem, itemIndex: number): number | null {
    const selected = selectedLanguageIndexForItem(item, itemIndex)
    return selected != null && selected > 0 ? selected : null
  }

  function renderPlayerItem(item: PlayerItem, itemIndex: number, fillParent = false) {
    if (item.type === 'blob') {
      return (
        <BlobSlide
          blobId={item.blob_id}
          allowNetworkFetch={allowNetworkFetch}
          fillParent={fillParent}
        />
      )
    }

    if (freeColumnCount != null) {
      const showNextPreview =
        layoutPreference.nextSongPreview || isMultiColumnWithNextPreviewMode(effectiveScroll)
      const nextItem = showNextPreview ? player.items[itemIndex + 1] : undefined
      const nextSong = nextItem?.type === 'chords' ? nextItem.song : undefined
      return (
        <ChordsThreeColumnSlide
          song={item.song}
          displayKey={displayKeyForItem(item, itemIndex)}
          languageIndex={renderLanguageIndexForItem(item, itemIndex)}
          nextSong={nextSong}
          nextDisplayKey={
            nextItem?.type === 'chords'
              ? displayKeyForItem(nextItem, itemIndex + 1)
              : undefined
          }
          nextLanguageIndex={
            nextItem?.type === 'chords'
              ? renderLanguageIndexForItem(nextItem, itemIndex + 1)
              : undefined
          }
          chordFormat={chordFormat}
          columnCount={freeColumnCount}
          overflowStyle={layoutPreference.overflowStyle}
          expandSections={layoutPreference.expandSections}
          fillParent={fillParent}
        />
      )
    }

    return (
      <ChordsSlide
        song={item.song}
        displayKey={displayKeyForItem(item, itemIndex)}
        languageIndex={renderLanguageIndexForItem(item, itemIndex)}
        chordFormat={chordFormat}
        orientation={sheetOrientation}
        fillParent={fillParent}
      />
    )
  }

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    touchMovedRef.current = false
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = touchStartRef.current
    const touch = e.touches[0]
    if (!start || !touch || touchMovedRef.current) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (
      Math.abs(dx) > VIEWPORT_TAP_MOVE_SLOP_PX ||
      Math.abs(dy) > VIEWPORT_TAP_MOVE_SLOP_PX
    ) {
      touchMovedRef.current = true
    }
  }

  function onTouchCancel() {
    touchStartRef.current = null
    touchMovedRef.current = false
  }

  const handleViewportPointer = useCallback(
    (clientX: number, target: EventTarget | null, rect: DOMRect) => {
      if (isInteractiveTarget(target)) return false

      const now = performance.now()
      const doubleTap =
        lastViewportTapTimeRef.current != null &&
        now - lastViewportTapTimeRef.current < VIEWPORT_DOUBLE_TAP_MS
      lastViewportTapTimeRef.current = now

      const zone = viewportPointerZone(clientX, rect)

      if (chromeVisible) {
        setKeyPopoverOpen(false)
        setLanguagePopoverOpen(false)
        if (zone !== 'middle') {
          setChromeVisible(false)
          return true
        }
        setChromeVisible(false)
        if (doubleTap) toggleCurrentSongLike()
        return true
      }

      if (zone === 'left') {
        if (!navBlocked) dispatch({ type: 'prev' })
        return true
      }
      if (zone === 'right') {
        if (!navBlocked) dispatch({ type: 'next' })
        return true
      }
      setKeyPopoverOpen(false)
      setLanguagePopoverOpen(false)
      setChromeVisible(true)
      if (doubleTap) toggleCurrentSongLike()
      return true
    },
    [chromeVisible, dispatch, navBlocked, toggleCurrentSongLike],
  )

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    const touch = e.changedTouches[0]
    if (!start || !touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const isSwipe =
      Math.abs(dx) >= VIEWPORT_SWIPE_MIN_PX && Math.abs(dx) >= Math.abs(dy) * 1.2

    if (isSwipe) {
      touchMovedRef.current = false
      suppressClickRef.current = true
      if (navBlocked || chromeVisible) return
      if (dx > 0) dispatch({ type: 'prev' })
      else dispatch({ type: 'next' })
      return
    }

    if (touchMovedRef.current) {
      touchMovedRef.current = false
      suppressClickRef.current = true
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    if (handleViewportPointer(touch.clientX, e.target, rect)) {
      chromeToggleHandledRef.current = true
    }
  }

  function onMainClick(e: React.MouseEvent<HTMLElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }

    if (chromeToggleHandledRef.current) {
      chromeToggleHandledRef.current = false
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    handleViewportPointer(e.clientX, e.target, rect)
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
    <LayoutGroup>
      <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-foreground)]">
        {evicted ? (
          <p
            className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-[var(--color-danger)]/10 px-4 py-2 text-center text-xs text-[var(--color-danger)]"
            role="status"
            aria-live="polite"
          >
            {t('player.evicted')}
          </p>
        ) : null}

        <AnimatePresence initial={false}>
          {chromeVisible ? (
            <motion.header
              key="player-chrome-header"
              layout={!reduceMotion}
              className={playerChromeHeaderClass}
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={chromeTransition}
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                asChild
                className={playerHeaderIconButtonClass}
              >
                <Link to={backTo} aria-label={t(backAriaKeyForPlayerType(type))}>
                  <ChevronLeftIcon className={playerHeaderIconClass} size={PLAYER_HEADER_ICON_SIZE} />
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
                  <>
                    {showLanguageSelector ? (
                      <PopoverRoot open={languagePopoverOpen} onOpenChange={setLanguagePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className={playerHeaderIconButtonClass}
                            aria-label={t('player.language.current', {
                              language: currentLanguageLabel,
                            })}
                          >
                            <span className={cn(playerHeaderIconClass, 'text-xs font-semibold leading-none')}>
                              {currentLanguageLabel}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-48 p-2">
                          <div className="grid gap-1">
                            {currentLanguageOptions.map((option) => (
                              <Button
                                key={option.index}
                                type="button"
                                size="sm"
                                variant={currentLanguageIndex === option.index ? 'default' : 'outline'}
                                onClick={() => {
                                  setViewState((s) =>
                                    option.index === 0
                                      ? clearLanguageForItem(s, nav.index)
                                      : setLanguageForItem(s, nav.index, option.index),
                                  )
                                  setLanguagePopoverOpen(false)
                                }}
                              >
                                {option.index === 0
                                  ? t('player.language.defaultOption', { language: option.label })
                                  : option.label}
                              </Button>
                            ))}
                          </div>
                        </PopoverContent>
                      </PopoverRoot>
                    ) : null}
                    <PopoverRoot open={keyPopoverOpen} onOpenChange={setKeyPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className={playerHeaderIconButtonClass}
                          aria-label={t('player.transpose.current', {
                            key: displayKey ?? t('player.transpose.default'),
                          })}
                        >
                          <span className={cn(playerHeaderIconClass, 'text-sm font-semibold leading-none')}>
                            {displayKey ?? '♮'}
                          </span>
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
                              setKeyPopoverOpen(false)
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
                                setKeyPopoverOpen(false)
                              }}
                            >
                              {key}
                            </Button>
                          ))}
                        </div>
                      </PopoverContent>
                    </PopoverRoot>
                  </>
                ) : null}
                <PlayerEditMenu
                  playerType={type}
                  canEditSong={currentItem.type === 'chords'}
                  onEditSong={navigateToSongEditor}
                  onEditResource={navigateToResourceEditor}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  asChild
                  className={playerHeaderIconButtonClass}
                >
                  <Link
                    to="/settings"
                    search={buildSettingsSearch('player', {
                      playerType: type,
                      playerId: id,
                      playerIndex: nav.index,
                    })}
                    aria-label={t('player.openSettings')}
                  >
                    <SettingsIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
                  </Link>
                </Button>
              </div>
            </motion.header>
          ) : null}
        </AnimatePresence>

        <motion.div
          layout={!reduceMotion}
          transition={chromeTransition}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <motion.div
            role="main"
            layout={!reduceMotion}
            aria-label={t('player.mainAria', { title: title || t('player.untitled') })}
            className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            animate={{
              paddingLeft: chromeVisible && showToc ? tocInsetPx : 0,
            }}
            transition={chromeTransition}
            onClick={onMainClick}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
          >
            {likeBurstActive ? (
              <PlayerLikeHeartBurst
                key={likeBurstKey}
                onFinished={() => setLikeBurstActive(false)}
              />
            ) : null}

            <p className="sr-only" aria-live="polite">
              {t('player.itemAnnounce', {
                current: nav.index + 1,
                total: itemsLen,
                title: tocRow?.title ?? '',
              })}
            </p>

            {bookSpread ? (
              <PlayerBookSpread
                left={renderPlayerItem(currentItem, nav.index, true)}
                right={(() => {
                  const rightIndex = bookSpreadRightIndex(nav.index, itemsLen)
                  const rightItem = rightIndex == null ? null : player.items[rightIndex]
                  if (!rightItem || rightIndex == null) return undefined
                  return renderPlayerItem(rightItem, rightIndex, true)
                })()}
              />
            ) : currentItem ? (
              renderPlayerItem(
                currentItem,
                nav.index,
                isMultiColumnScrollMode(effectiveScroll),
              )
            ) : null}
          </motion.div>

          <AnimatePresence initial={false}>
            {chromeVisible && showToc ? (
              <motion.div
                key="player-chrome-toc"
                className="pointer-events-auto absolute inset-y-0 left-0 z-10 flex overflow-hidden"
                initial={reduceMotion ? false : { x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={chromeTransition}
              >
                <PlayerTocSidebar
                  toc={displayToc}
                  items={player.items}
                  currentIndex={nav.index}
                  onSelect={(idx) => dispatch({ type: 'jump', index: idx })}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>
    </LayoutGroup>
  )
}
