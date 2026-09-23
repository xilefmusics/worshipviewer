import type { components } from '@/api/schema'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { useHideChordsPreference } from '@/hooks/useHideChordsPreference'
import { useChordSongFontScale } from '@/hooks/useChordSongFontScale'
import { useComfortableKeysPreference } from '@/hooks/useComfortableKeysPreference'
import { usePlayerInstrumentPreference } from '@/hooks/usePlayerInstrumentPreference'
import { useIsPhoneWidth, useMediaQuery } from '@/hooks/useMediaQuery'
import { usePlayerLayoutPreference } from '@/hooks/usePlayerScrollPreference'
import { useOnline } from '@/hooks/use-online'
import { usePlayerIndexSearchSync } from '@/hooks/usePlayerIndexSearchSync'
import { useResolvedSongWithFlow } from '@/lib/player/apply-song-flow'
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
import {
  CAPO_FRET_MAX,
  CAPO_FRET_MIN,
  capoFretForKeys,
  resolvePlayerKeyState,
  type PlayerKeyState,
} from '@/lib/player/capo'
import { playerKeyboardAction } from '@/lib/player/player-keyboard'
import { prefetchNextItemIndex } from '@/lib/player/prefetch-next-item'
import {
  formatPlayedKeyOffset,
  stepMusicalKey,
  TRANSPOSE_OFFSETS,
  transposeOffsetBetweenKeys,
} from '@/lib/player/transpose-key'
import {
  readPlayerViewState,
  clearTransposeForItem,
  clearCapoForItem,
  clearPlayerKeyForItem,
  clearLanguageForItem,
  setPlayerNavPosition,
  setPlayerKeyForItem,
  setTransposeOffsetForItem,
  setCapoForItem,
  setTransposeForItem,
  setLanguageForItem,
  writePlayerViewState,
  type PlayerViewState,
} from '@/lib/player/player-view-state'
import {
  PLAYER_HEADER_ICON_SIZE,
  PLAYER_TOC_WIDTH_CLASS,
  PLAYER_TOC_WIDTH_PX,
  playerHeaderIconButtonClass,
  playerHeaderIconClass,
} from '@/lib/player/player-chrome'
import type { PlayerMode } from '@/lib/player/player-mode'
import type { PlayerEntityType } from '@/lib/player-route'
import { buildSongEditorReturnSearch } from '@/lib/player/player-editor-return'
import { resolveSongLanguageIndex, songLanguageOptions } from '@/lib/player/song-language'
import { renderChordSections } from '@/lib/player/chord-section-render'
import { buildSettingsSearch } from '@/lib/settings-route'
import { writeChordSongFontScale } from '@/lib/player/chord-song-font-scale-preference'
import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'
import { languageIndexForSongLink, normalizeCapoShapeKey, resolveSongDataKey } from '@/lib/setlist-song-links'
import { cn } from '@/lib/utils'
import type { ChordFormatPreference } from '@/lib/chord-format'
import type { PlayerOverflowStyle } from '@/lib/player/effective-scroll-type'
import type { ChordSongData, SongFlowItem } from '@/ports/chord-engine'

type Player = components['schemas']['Player']
type Song = components['schemas']['Song']
type Orientation = components['schemas']['Orientation']
type PlayerItem = Player['items'][number]
type TocItem = Player['toc'][number]

const EMPTY_PLAYER_KEY_STATE: PlayerKeyState = {
  soundingKey: null,
  displayKey: null,
  capoShapeKey: null,
  capoFret: null,
}

type PlayerKeySelection = {
  baseKey: string | null
  selectedKey: string | null
  soundingKey: string | null
  transposeOffset: number
  hasKeyOverride: boolean
}

const EMPTY_PLAYER_KEY_SELECTION: PlayerKeySelection = {
  baseKey: null,
  selectedKey: null,
  soundingKey: null,
  transposeOffset: 0,
  hasKeyOverride: false,
}

function transposeOffsetForSelectedKeyChange(
  showTransposeControls: boolean,
  transposeOffset: number,
  soundingKey: string | null,
  nextSelectedKey: string,
): number {
  if (!showTransposeControls || transposeOffset === 0) return 0
  return transposeOffsetBetweenKeys(nextSelectedKey, soundingKey) ?? 0
}

function initialLikedBySongId(player: Player): Record<string, boolean> {
  const liked: Record<string, boolean> = {}
  for (const item of player.items) {
    if (item.type === 'chords') {
      liked[item.song.id] = item.song.user_specific_addons.liked
    }
  }
  // The TOC is assembled with the current user's like set. Some player item
  // payloads still carry a stale/default user-specific addon, so TOC values
  // must win when both representations contain the same song.
  for (const row of player.toc) {
    if (row.id) liked[row.id] = row.liked
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

function isChordSurfaceTarget(target: EventTarget | null): boolean {
  return Boolean(target instanceof Element && target.closest('[data-player-chord-surface]'))
}

function touchDistance(touches: React.TouchList): number | null {
  const first = touches[0]
  const second = touches[1]
  if (!first || !second) return null
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
}

function pointerDistance(pointers: Map<number, { x: number; y: number }>): number | null {
  const [first, second] = [...pointers.values()]
  if (!first || !second) return null
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function gestureTimestamp(): number {
  return performance.now()
}

function swipePreviewNavStates(
  nav: PlayerNavState,
  config: Parameters<typeof nextPlayerState>[2],
) {
  return {
    previous: nextPlayerState(nav, { type: 'prev' }, config),
    next: nextPlayerState(nav, { type: 'next' }, config),
  }
}

type ResolvedBookChordsProps = {
  song: Song
  flow: SongFlowItem[] | null | undefined
  displayKey: string | null
  soundingKey?: string | null
  selectedKey?: string | null
  capoFret?: number | null
  showTransposeControls?: boolean
  transposeOffset?: number | null
  languageIndex: number | null
  chordFormat: ChordFormatPreference
  sheetOrientation: Orientation
  fillParent?: boolean
  nextSong?: Song | null
  nextFlow?: SongFlowItem[] | null
  nextDisplayKey?: string | null
  nextSoundingKey?: string | null
  nextSelectedKey?: string | null
  nextCapoFret?: number | null
  nextTransposeOffset?: number | null
  nextLanguageIndex?: number | null
  freeColumnCount: 1 | 2 | 3 | null
  overflowStyle?: PlayerOverflowStyle
  expandSections?: boolean
  fontScale?: number
}

export function ResolvedBookChords({
  song,
  flow,
  displayKey,
  soundingKey = displayKey,
  selectedKey,
  capoFret = null,
  showTransposeControls = false,
  transposeOffset = null,
  languageIndex,
  chordFormat,
  sheetOrientation,
  fillParent = false,
  nextSong,
  nextFlow,
  nextDisplayKey,
  nextSoundingKey,
  nextSelectedKey,
  nextCapoFret,
  nextTransposeOffset,
  nextLanguageIndex,
  freeColumnCount,
  overflowStyle,
  expandSections,
  fontScale = 1,
}: ResolvedBookChordsProps) {
  const resolveFlowOnMainThread = freeColumnCount == null
  const resolvedSong = useResolvedSongWithFlow(song, flow, resolveFlowOnMainThread)
  const resolvedSelectedKey = selectedKey ?? soundingKey

  if (freeColumnCount != null) {
    return (
      <ChordsThreeColumnSlide
        song={song}
        flow={flow}
        displayKey={displayKey}
        soundingKey={soundingKey}
        selectedKey={resolvedSelectedKey}
        capoFret={capoFret}
        showTransposeControls={showTransposeControls}
        transposeOffset={transposeOffset}
        languageIndex={languageIndex}
        nextSong={nextSong}
        nextFlow={nextFlow}
        nextDisplayKey={nextDisplayKey}
        nextSoundingKey={nextSoundingKey}
        nextSelectedKey={nextSelectedKey}
        nextCapoFret={nextCapoFret}
        nextTransposeOffset={nextTransposeOffset}
        nextLanguageIndex={nextLanguageIndex}
        chordFormat={chordFormat}
        columnCount={freeColumnCount}
        overflowStyle={overflowStyle}
        expandSections={expandSections}
        fillParent={fillParent}
        fontScale={fontScale}
      />
    )
  }

  return (
    <ChordsSlide
      song={resolvedSong}
      displayKey={displayKey}
      soundingKey={soundingKey}
      selectedKey={resolvedSelectedKey}
      capoFret={capoFret}
      showTransposeControls={showTransposeControls}
      transposeOffset={transposeOffset}
      languageIndex={languageIndex}
      chordFormat={chordFormat}
      orientation={sheetOrientation}
      fillParent={fillParent}
      fontScale={fontScale}
      overflowStyle={overflowStyle}
    />
  )
}

const PLAYER_CHROME_EASE = [0.25, 0.1, 0.25, 1] as const
const VIEWPORT_DOUBLE_TAP_MS = 300
const VIEWPORT_TAP_MOVE_SLOP_PX = 10
const VIEWPORT_SWIPE_MIN_PX = 48
const VIEWPORT_EDGE_SWIPE_WIDTH_PX = 24
const TOUCH_CLICK_SUPPRESSION_MS = 750
const PLAYER_SWIPE_TRANSITION = 'transform 220ms cubic-bezier(0.25, 0.1, 0.25, 1)'

type ViewportSwipeDirection = -1 | 1

const playerChromeHeaderClass =
  'pointer-events-auto flex shrink-0 items-center gap-2 overflow-hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 sm:px-3 sm:py-3'

type PlayerBookProps = {
  type: PlayerEntityType
  id: string
  player: Player
  initialIndex?: number
  mode?: PlayerMode
  allowNetworkFetch: boolean
  embedded?: boolean
  enableEmbeddedSwipeNavigation?: boolean
  backToOverride?: '/rooms'
  backAriaKeyOverride?: string
  resourceTitle?: string
  deletedReconciled?: boolean
  roomMusicalState?: { item_index: number; started: boolean; language: string | null; transposition: string | null }
  roomStateRevision?: number
  canControlRoomMusicalState?: boolean
  onRoomMusicalStateChange?: (state: { item_index: number; started: boolean; language: string | null; transposition: string | null }) => void
  onRoomQueueNext?: () => void
  allowLibraryActions?: boolean
  tocSidebar?: ReactNode
  roomSidebar?: ReactNode
}

export function PlayerBook({
  type,
  id,
  player,
  initialIndex,
  mode = 'sheet',
  allowNetworkFetch,
  embedded = false,
  enableEmbeddedSwipeNavigation = false,
  backToOverride,
  backAriaKeyOverride,
  resourceTitle,
  deletedReconciled,
  roomMusicalState,
  roomStateRevision,
  canControlRoomMusicalState = false,
  onRoomMusicalStateChange,
  onRoomQueueNext,
  allowLibraryActions = true,
  tocSidebar,
  roomSidebar,
}: PlayerBookProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnline()
  const chordFormat = useChordFormatPreference()
  const hideChords = useHideChordsPreference()
  const chordSongFontScale = useChordSongFontScale()
  const comfortableKeys = useComfortableKeysPreference()
  const playerInstrument = usePlayerInstrumentPreference()
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
  const [chromeVisible, setChromeVisible] = useState(() => tocSidebar != null || roomSidebar != null)

  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const tocTouchStartRef = useRef<{ x: number; y: number } | null>(null)
  const tocOverlayRef = useRef<HTMLDivElement | null>(null)
  const tocSwipeOffsetRef = useRef(0)
  const tocSwipeSettlingRef = useRef(false)
  const pinchStartRef = useRef<{ distance: number; fontScale: number } | null>(null)
  const touchMovedRef = useRef(false)
  const pointerGestureActiveRef = useRef(false)
  const suppressTouchFallbackRef = useRef(false)
  const activePointerPositionsRef = useRef(new Map<number, { x: number; y: number }>())
  const suppressClicksUntilRef = useRef(0)
  const lastMiddleViewportTapTimeRef = useRef<number | null>(null)
  const pendingChromeOpenRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swipeTrackOffsetRef = useRef(0)
  const swipeTrackVisibleRef = useRef(false)
  const swipeTrackSettlingRef = useRef(false)
  const swipeSettleDirectionRef = useRef<ViewportSwipeDirection | null>(null)
  const [swipeTrackOffset, setSwipeTrackOffset] = useState(0)
  const [swipeTrackVisible, setSwipeTrackVisible] = useState(false)
  const [swipeTrackSettling, setSwipeTrackSettling] = useState(false)
  const [tocSwipeOffset, setTocSwipeOffset] = useState(0)
  const [tocSwipeSettling, setTocSwipeSettling] = useState(false)
  const [likeBurstKey, setLikeBurstKey] = useState(0)
  const [likeBurstActive, setLikeBurstActive] = useState(false)
  const [likeBurstLiked, setLikeBurstLiked] = useState(true)
  const [viewState, setViewState] = useState<PlayerViewState>(() => readPlayerViewState(type, id))
  const serverLikes = useMemo(() => initialLikedBySongId(player), [player])
  const likeScope = `${type}:${id}`
  const [likeState, setLikeState] = useState<{
    scope: string
    delta: Record<string, boolean>
  }>(() => ({
    scope: likeScope,
    delta: {},
  }))
  const likedBySongId = useMemo(
    () => ({
      ...serverLikes,
      ...(likeState.scope === likeScope ? likeState.delta : {}),
    }),
    [likeScope, likeState, serverLikes],
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
  const { previous: previousSwipeNav, next: nextSwipeNav } = swipePreviewNavStates(nav, navConfig)
  const displayToc = useMemo(
    () => mergeTocLikes(player.toc, likedBySongId),
    [player.toc, likedBySongId],
  )
  const tocRow = tocEntryForIndex(displayToc, nav.index)
  const showToc = !embedded && (tocSidebar != null || displayToc.length > 0)
  const fullscreenToc = isPhoneViewport && chromeVisible && showToc
  const showChordsControls = hasChordsItems(player.items)
  const navBlocked = Boolean(roomMusicalState && !canControlRoomMusicalState)
  const canSwipeNavigate = !embedded || enableEmbeddedSwipeNavigation

  const dispatch = useCallback(
    (action: Parameters<typeof nextPlayerState>[1]) => {
      if (navBlocked) return
      const next = nextPlayerState(nav, action, navConfig)
      if (
        action.type === 'next' &&
        onRoomQueueNext &&
        next.index === nav.index &&
        next.pageOffset === nav.pageOffset
      ) {
        onRoomQueueNext()
        return
      }
      setNav(next)
    },
    [nav, navBlocked, navConfig, onRoomQueueNext, setNav],
  )

  function setSwipeTrackOffsetValue(offset: number) {
    swipeTrackOffsetRef.current = offset
    setSwipeTrackOffset(offset)
  }

  function setSwipeTrackVisibleValue(visible: boolean) {
    swipeTrackVisibleRef.current = visible
    setSwipeTrackVisible(visible)
  }

  function resetSwipeTrack() {
    swipeSettleDirectionRef.current = null
    swipeTrackSettlingRef.current = false
    setSwipeTrackSettling(false)
    setSwipeTrackOffsetValue(0)
    setSwipeTrackVisibleValue(false)
  }

  function settleSwipeTrack(direction: ViewportSwipeDirection | null, currentTarget: HTMLDivElement) {
    const action = direction == null ? null : direction > 0 ? { type: 'prev' as const } : { type: 'next' as const }
    const next = action == null ? nav : nextPlayerState(nav, action, navConfig)
    const hasTarget =
      action != null &&
      (next.index !== nav.index || next.pageOffset !== nav.pageOffset) &&
      !navBlocked &&
      canSwipeNavigate &&
      !chromeVisible
    const width = currentTarget.getBoundingClientRect().width || currentTarget.clientWidth

    if (!hasTarget) {
      if (!swipeTrackVisibleRef.current) return
      if (reduceMotion || width <= 0) {
        resetSwipeTrack()
        return
      }
      swipeSettleDirectionRef.current = null
      swipeTrackSettlingRef.current = true
      setSwipeTrackSettling(true)
      setSwipeTrackOffsetValue(0)
      return
    }

    if (reduceMotion || width <= 0) {
      resetSwipeTrack()
      dispatch(action)
      return
    }

    const startFromCenter = !swipeTrackVisibleRef.current
    swipeSettleDirectionRef.current = direction
    swipeTrackSettlingRef.current = true
    setSwipeTrackVisibleValue(true)
    if (startFromCenter) {
      // Give the three-panel track one paint at the centered position before
      // enabling the transition. This makes click navigation use the same
      // visible snap as a completed drag instead of allowing the browser to
      // collapse the mount and movement into one frame.
      setSwipeTrackSettling(false)
      setSwipeTrackOffsetValue(0)
      requestAnimationFrame(() => {
        if (
          !swipeTrackSettlingRef.current ||
          swipeSettleDirectionRef.current !== direction
        ) {
          return
        }
        setSwipeTrackSettling(true)
        requestAnimationFrame(() => {
          if (
            !swipeTrackSettlingRef.current ||
            swipeSettleDirectionRef.current !== direction
          ) {
            return
          }
          setSwipeTrackOffsetValue((direction ?? 0) * width)
        })
      })
    } else {
      setSwipeTrackSettling(true)
      setSwipeTrackOffsetValue((direction ?? 0) * width)
    }
  }

  function onSwipeTrackTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (
      e.target !== e.currentTarget ||
      e.propertyName !== 'transform' ||
      !swipeTrackSettlingRef.current
    ) return
    const direction = swipeSettleDirectionRef.current
    resetSwipeTrack()
    if (direction == null || navBlocked) return
    dispatch({ type: direction > 0 ? 'prev' : 'next' })
  }

  usePlayerIndexSearchSync(type, id, nav.index, mode)

  const triggerLikeBurst = useCallback((liked: boolean) => {
    setLikeBurstKey((key) => key + 1)
    setLikeBurstLiked(liked)
    setLikeBurstActive(true)
  }, [])

  const toggleCurrentSongLike = useCallback(() => {
    if (!online || !allowNetworkFetch || !allowLibraryActions || currentItem?.type !== 'chords') return
    const songId = currentItem.song.id
    const previousLiked = likedBySongId[songId] ?? currentItem.song.user_specific_addons.liked
    const nextLiked = !previousLiked
    setLikeState((state) => ({
      scope: likeScope,
      delta: {
        ...(state.scope === likeScope ? state.delta : {}),
        [songId]: nextLiked,
      },
    }))
    triggerLikeBurst(nextLiked)
    void setSongLikeStatus(queryClient, { id: songId, liked: nextLiked })
      .then(() => {
        setLikeState((state) => {
          if (state.scope !== likeScope || state.delta[songId] !== nextLiked) return state
          const delta = { ...state.delta }
          delete delta[songId]
          return { ...state, delta }
        })
      })
      .catch(() => {
        setLikeState((state) => {
          if (state.scope !== likeScope || state.delta[songId] !== nextLiked) return state
          return {
            ...state,
            delta: { ...state.delta, [songId]: previousLiked },
          }
        })
        toast.error(t('player.loadFailed'))
      })
  }, [allowLibraryActions, allowNetworkFetch, currentItem, likedBySongId, likeScope, online, queryClient, t, triggerLikeBurst])

  const cancelPendingChromeOpen = useCallback(() => {
    if (pendingChromeOpenRef.current != null) {
      clearTimeout(pendingChromeOpenRef.current)
      pendingChromeOpenRef.current = null
    }
  }, [])

  useEffect(() => () => cancelPendingChromeOpen(), [cancelPendingChromeOpen])

  useEffect(() => {
    if (deletedReconciled) {
      toast.info(t('player.setlistDeleted'))
    }
  }, [deletedReconciled, t])

  // The helper declarations below close over every reactive value listed in this dependency array.
  /* eslint-disable react-hooks/exhaustive-deps */
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
            if (freeColumnCount != null) {
              const languageIndex = renderLanguageIndexForItem(nextItem, prefetchIndex)
              const key = keyStateForItem(nextItem, prefetchIndex).displayKey
              await renderChordSections({
                songData: nextItem.song.data as ChordSongData,
                flow: nextItem.flow,
                key,
                language: languageIndex,
                representation: chordFormatToRepresentation(chordFormat),
                hideChords,
                expandSections: layoutPreference.expandSections,
              })
            } else {
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
              const renderOptions = {
                key: key ?? undefined,
                language: languageIndex ?? undefined,
                representation: chordFormatToRepresentation(chordFormat),
              }
              if (isMultiColumnScrollMode(effectiveScroll)) {
                engine.renderA4SectionHtmls(nextItem.song.data as ChordSongData, renderOptions)
              } else {
                engine.renderA4Html(nextItem.song.data as ChordSongData, renderOptions)
              }
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
    viewState.capoByItem,
    viewState.selectedKeyByItem,
    viewState.transposeByItem,
    viewState.transposeOffsetByItem,
    hideChords,
    layoutPreference.expandSections,
    playerInstrument,
    roomMusicalState,
    canControlRoomMusicalState,
    type,
    freeColumnCount,
  ])
  /* eslint-enable react-hooks/exhaustive-deps */

  const backTo = backToOverride ?? hubPathForPlayerType(type)
  const localCapoShape = viewState.capoByItem?.[nav.index]
  const currentKeySelection =
    currentItem?.type === 'chords'
      ? keySelectionForItem(currentItem, nav.index)
      : EMPTY_PLAYER_KEY_SELECTION
  const currentKeyState =
    currentItem?.type === 'chords' ? keyStateForItem(currentItem, nav.index) : EMPTY_PLAYER_KEY_STATE
  const { soundingKey, capoShapeKey } = currentKeyState
  const showCapoControls =
    !roomMusicalState &&
    playerInstrument === 'guitar' &&
    currentItem?.type === 'chords' &&
    soundingKey != null &&
    MUSICAL_KEYS.includes(soundingKey as (typeof MUSICAL_KEYS)[number])
  const showTransposeControls =
    (playerInstrument === 'keyboard' || Boolean(roomMusicalState)) && currentItem?.type === 'chords'
  const { selectedKey, transposeOffset } = currentKeySelection
  const transposeOptions = TRANSPOSE_OFFSETS.map((offset) => ({
    offset,
    key: selectedKey == null ? null : stepMusicalKey(selectedKey, offset),
  })).filter(
    (option): option is { offset: (typeof TRANSPOSE_OFFSETS)[number]; key: string } =>
      option.key != null &&
      (option.offset === 0 || comfortableKeys.includes(option.key as (typeof MUSICAL_KEYS)[number])),
  ).sort((left, right) => Number(left.offset !== 0) - Number(right.offset !== 0))
  const capoShapeOptions = Array.from(
    new Set(
      capoShapeKey != null && !comfortableKeys.includes(capoShapeKey)
        ? [capoShapeKey, ...comfortableKeys]
        : comfortableKeys,
    ),
  ).filter((key) => {
    const fret = capoFretForKeys(soundingKey, key)
    return fret != null && fret >= CAPO_FRET_MIN && fret <= CAPO_FRET_MAX
  })
  const currentLanguageOptions = useMemo(() => currentItem?.type === 'chords' ? songLanguageOptions(currentItem.song.data as Record<string, unknown>) : [], [currentItem])
  const currentLanguageIndex =
    currentItem?.type === 'chords'
      ? selectedLanguageIndexForItem(currentItem, nav.index)
      : null
  const currentLanguageLabel =
    currentLanguageOptions[currentLanguageIndex ?? 0]?.label ??
    `L${(currentLanguageIndex ?? 0) + 1}`
  const showLanguageSelector = currentItem?.type === 'chords' && currentLanguageOptions.length > 1

  useEffect(() => {
    if (!roomMusicalState || canControlRoomMusicalState) return
    const roomItem = player.items[roomMusicalState.item_index]
    const roomLanguageOptions =
      roomItem?.type === 'chords'
        ? songLanguageOptions(roomItem.song.data as Record<string, unknown>)
        : []
    queueMicrotask(() => {
      setNav((state) => {
        if (state.index === roomMusicalState.item_index) return state
        return nextPlayerState(state, { type: 'jump', index: roomMusicalState.item_index }, navConfig)
      })
      if (roomItem?.type !== 'chords') return
      const languageIndex =
        roomMusicalState.language == null
          ? 0
          : roomLanguageOptions.findIndex((option) => option.label === roomMusicalState.language)
      setViewState((state) => {
        const targetLanguage = languageIndex > 0 ? languageIndex : undefined
        const targetTranspose = roomMusicalState.transposition ?? undefined
        if (
          state.languageByItem?.[roomMusicalState.item_index] === targetLanguage &&
          state.transposeByItem[roomMusicalState.item_index] === targetTranspose
        ) {
          return state
        }
        let next =
          languageIndex > 0
            ? setLanguageForItem(state, roomMusicalState.item_index, languageIndex)
            : clearLanguageForItem(state, roomMusicalState.item_index)
        next = roomMusicalState.transposition
          ? setTransposeForItem(next, roomMusicalState.item_index, roomMusicalState.transposition)
          : clearTransposeForItem(next, roomMusicalState.item_index)
        return next
      })
    })
  }, [
    roomMusicalState,
    roomStateRevision,
    canControlRoomMusicalState,
    nav.index,
    navConfig,
    player.items,
  ])

  const lastRoomStateRef = useRef('')
  useEffect(() => {
    if (!canControlRoomMusicalState || !onRoomMusicalStateChange) return
    const stateWithoutStarted = { item_index: nav.index, language: currentItem?.type === 'chords' && currentLanguageOptions.length > 0 ? currentLanguageLabel : null, transposition: currentItem?.type === 'chords' ? soundingKey : null }
    const serialized = JSON.stringify(stateWithoutStarted)
    if (serialized === lastRoomStateRef.current) return
    const wasPreviouslySynced = lastRoomStateRef.current !== ''
    lastRoomStateRef.current = serialized
    onRoomMusicalStateChange({ ...stateWithoutStarted, started: roomMusicalState?.started === true || wasPreviouslySynced })
  }, [canControlRoomMusicalState, currentItem, currentLanguageLabel, currentLanguageOptions.length, nav.index, onRoomMusicalStateChange, roomMusicalState?.started, soundingKey])

  function handleTocSelect(sourceIdx: number, languageIndex: number | null) {
    if (navBlocked) return
    if (languageIndex != null) {
      setViewState((state) => setLanguageForItem(state, sourceIdx, languageIndex))
    }
    dispatch({ type: 'jump', index: sourceIdx })
    if (fullscreenToc && tocOverlayRef.current) {
      settleTocSwipe(true, tocOverlayRef.current)
    }
  }

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
        cancelPendingChromeOpen()
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

      if (!roomMusicalState && playerInstrument === 'guitar') {
        if (action === 'resetTranspose') {
          e.preventDefault()
          setViewState((state) => clearCapoForItem(state, nav.index))
          setKeyPopoverOpen(false)
        }
        return
      }

      if (typeof action === 'object' && action.type === 'setTransposeKey') {
        e.preventDefault()
        const nextTransposeOffset = transposeOffsetForSelectedKeyChange(
          showTransposeControls,
          transposeOffset,
          currentKeySelection.soundingKey,
          action.key,
        )
        setViewState((state) =>
          setTransposeOffsetForItem(
            setPlayerKeyForItem(state, nav.index, action.key),
            nav.index,
            nextTransposeOffset,
          ),
        )
        setKeyPopoverOpen(false)
        return
      }
      if (action === 'resetTranspose') {
        e.preventDefault()
        setViewState((state) => clearCapoForItem(clearPlayerKeyForItem(state, nav.index), nav.index))
        setKeyPopoverOpen(false)
        return
      }
      if (action === 'transposeUp') {
        e.preventDefault()
        const currentOffsetIndex = TRANSPOSE_OFFSETS.indexOf(
          transposeOffset as (typeof TRANSPOSE_OFFSETS)[number],
        )
        const nextOffset = TRANSPOSE_OFFSETS[(currentOffsetIndex + 1) % TRANSPOSE_OFFSETS.length]
        setViewState((state) => setTransposeOffsetForItem(state, nav.index, nextOffset))
        setKeyPopoverOpen(false)
        return
      }
      if (action === 'transposeDown') {
        e.preventDefault()
        const currentOffsetIndex = TRANSPOSE_OFFSETS.indexOf(
          transposeOffset as (typeof TRANSPOSE_OFFSETS)[number],
        )
        const nextOffset =
          TRANSPOSE_OFFSETS[(currentOffsetIndex - 1 + TRANSPOSE_OFFSETS.length) % TRANSPOSE_OFFSETS.length]
        setViewState((state) => setTransposeOffsetForItem(state, nav.index, nextOffset))
        setKeyPopoverOpen(false)
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
    transposeOffset,
    currentKeySelection.soundingKey,
    showTransposeControls,
    navigateToSongEditor,
    nav.index,
    navBlocked,
    navigate,
    keyPopoverOpen,
    languagePopoverOpen,
    chromeVisible,
    playerInstrument,
    roomMusicalState,
    layoutPreferences,
    sheetOrientation,
    cancelPendingChromeOpen,
    toggleCurrentSongLike,
    type,
    id,
  ])

  const title = resourceTitle ?? tocRow?.title ?? ''

  function baseKeyForItem(item: Extract<PlayerItem, { type: 'chords' }>): string | null {
    const itemSlotKey = resolveSongDataKey(item.song.data as Record<string, unknown>)
    return resolvePlayerItemKey(item, type, itemSlotKey, undefined)
  }

  function keySelectionForItem(
    item: Extract<PlayerItem, { type: 'chords' }>,
    itemIndex: number,
  ): PlayerKeySelection {
    const baseKey = baseKeyForItem(item)
    const legacyKey = viewState.transposeByItem[itemIndex]
    const selectedKeyOverride = viewState.selectedKeyByItem?.[itemIndex]
    const isRoomFollower = Boolean(roomMusicalState && !canControlRoomMusicalState)
    const selectedKeyCandidate = isRoomFollower
      ? legacyKey
      : selectedKeyOverride ?? legacyKey ?? baseKey
    const selectedKey = MUSICAL_KEYS.includes(selectedKeyCandidate as (typeof MUSICAL_KEYS)[number])
      ? selectedKeyCandidate
      : baseKey
    const configuredOffset = viewState.transposeOffsetByItem?.[itemIndex]
    const transposeOffset =
      !isRoomFollower &&
      typeof configuredOffset === 'number' &&
      Number.isInteger(configuredOffset) &&
      configuredOffset >= TRANSPOSE_OFFSETS[0] &&
      configuredOffset <= TRANSPOSE_OFFSETS[TRANSPOSE_OFFSETS.length - 1]
        ? configuredOffset
        : 0
    const soundingKey = selectedKey == null ? null : stepMusicalKey(selectedKey, transposeOffset)
    return {
      baseKey,
      selectedKey,
      soundingKey,
      transposeOffset,
      hasKeyOverride: !isRoomFollower && (selectedKeyOverride != null || legacyKey != null),
    }
  }

  function keyStateForItem(item: Extract<PlayerItem, { type: 'chords' }>, itemIndex: number): PlayerKeyState {
    const keySelection = keySelectionForItem(item, itemIndex)
    const savedCapoShape = type === 'setlist' ? normalizeCapoShapeKey(item.capo_shape) : null
    const localCapoShape = viewState.capoByItem?.[itemIndex]
    const capoShape =
      roomMusicalState || playerInstrument !== 'guitar'
        ? null
        : localCapoShape ?? savedCapoShape
    return resolvePlayerKeyState(keySelection.baseKey, keySelection.soundingKey, capoShape)
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

  function renderPlayerItem(
    item: PlayerItem,
    itemIndex: number,
    fillParent = false,
    columnCount = freeColumnCount,
  ) {
    if (item.type === 'blob') {
      return (
        <BlobSlide
          blobId={item.blob_id}
          allowNetworkFetch={allowNetworkFetch}
          fillParent={fillParent}
        />
      )
    }
    if (item.type !== 'chords') return null

    const showNextPreview =
      layoutPreference.nextSongPreview || isMultiColumnWithNextPreviewMode(effectiveScroll)
    const nextItem = showNextPreview ? player.items[itemIndex + 1] : undefined
    const nextSong = nextItem?.type === 'chords' ? nextItem.song : undefined
    const nextFlow = nextItem?.type === 'chords' ? nextItem.flow : undefined
    const keySelection = keySelectionForItem(item, itemIndex)
    const keyState = keyStateForItem(item, itemIndex)
    const nextKeySelection =
      nextItem?.type === 'chords' ? keySelectionForItem(nextItem, itemIndex + 1) : null
    const nextKeyState = nextItem?.type === 'chords' ? keyStateForItem(nextItem, itemIndex + 1) : null
    return (
      <ResolvedBookChords
        song={item.song}
        flow={item.flow}
        displayKey={keyState.displayKey}
        soundingKey={keyState.soundingKey}
        selectedKey={keySelection.selectedKey}
        capoFret={keyState.capoFret}
        showTransposeControls={showTransposeControls}
        transposeOffset={keySelection.transposeOffset}
        languageIndex={renderLanguageIndexForItem(item, itemIndex)}
        chordFormat={chordFormat}
        sheetOrientation={sheetOrientation}
        fillParent={fillParent}
        nextSong={nextSong}
        nextFlow={nextFlow}
        nextDisplayKey={nextKeyState?.displayKey}
        nextSoundingKey={nextKeyState?.soundingKey}
        nextSelectedKey={nextKeySelection?.selectedKey}
        nextCapoFret={nextKeyState?.capoFret}
        nextTransposeOffset={nextKeySelection?.transposeOffset}
        nextLanguageIndex={
          nextItem?.type === 'chords' ? renderLanguageIndexForItem(nextItem, itemIndex + 1) : undefined
        }
        freeColumnCount={columnCount}
        overflowStyle={layoutPreference.overflowStyle}
        expandSections={layoutPreference.expandSections}
        fontScale={chordSongFontScale}
      />
    )
  }

  function renderPlayerNavContent(targetNav: PlayerNavState) {
    const item = player.items[targetNav.index]
    if (!item) return null

    const targetItemType = item.type === 'blob' ? 'blob' : item.type === 'chords' ? 'chords' : null
    const targetBookSpread = shouldUseBookSpreadLayout({
      scrollType: effectiveScroll,
      layoutPreference,
      orientation: sheetOrientation,
      isPhone: isPhoneViewport,
      itemType: targetItemType,
    })
    const targetColumnCount = targetBookSpread ? null : resolvedFreeColumnCount

    if (targetBookSpread) {
      const rightIndex = bookSpreadRightIndex(targetNav.index, itemsLen)
      const rightItem = rightIndex == null ? null : player.items[rightIndex]
      return (
        <PlayerBookSpread
          left={renderPlayerItem(item, targetNav.index, true, targetColumnCount)}
          right={
            rightItem && rightIndex != null
              ? renderPlayerItem(rightItem, rightIndex, true, targetColumnCount)
              : undefined
          }
        />
      )
    }

    return renderPlayerItem(item, targetNav.index, isMultiColumnScrollMode(effectiveScroll), targetColumnCount)
  }

  function updateSwipeTrack(
    clientX: number,
    clientY: number,
    currentTarget: HTMLDivElement,
    preventDefault: () => void,
  ) {
    const start = touchStartRef.current
    const rect = currentTarget.getBoundingClientRect()
    const relativeStartX = start ? start.x - rect.left : 0
    const startsAtLeftEdge = relativeStartX <= VIEWPORT_EDGE_SWIPE_WIDTH_PX
    const startsAtRightEdge =
      rect.width > 0 && relativeStartX >= rect.width - VIEWPORT_EDGE_SWIPE_WIDTH_PX
    if (
      !start ||
      !canSwipeNavigate ||
      navBlocked ||
      chromeVisible ||
      swipeTrackSettlingRef.current ||
      startsAtLeftEdge ||
      (embedded && startsAtRightEdge)
    ) {
      return
    }

    const dx = clientX - start.x
    const dy = clientY - start.y
    if (Math.abs(dx) <= VIEWPORT_TAP_MOVE_SLOP_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return

    const direction: ViewportSwipeDirection = dx > 0 ? 1 : -1
    const action = direction > 0 ? { type: 'prev' as const } : { type: 'next' as const }
    const next = nextPlayerState(nav, action, navConfig)
    if (next.index === nav.index && next.pageOffset === nav.pageOffset) return

    const width = currentTarget.getBoundingClientRect().width || currentTarget.clientWidth
    const boundedOffset = width > 0 ? Math.max(-width, Math.min(width, dx)) : dx
    setSwipeTrackVisibleValue(true)
    setSwipeTrackOffsetValue(boundedOffset)
    touchMovedRef.current = true
    preventDefault()
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
    if (swipeTrackSettlingRef.current) return

    pointerGestureActiveRef.current = true
    suppressTouchFallbackRef.current = true
    activePointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId)

    if (activePointerPositionsRef.current.size >= 2) {
      touchStartRef.current = null
      touchMovedRef.current = true
      cancelPendingChromeOpen()
      if (!isChordSurfaceTarget(e.target)) {
        pinchStartRef.current = null
        return
      }
      const distance = pointerDistance(activePointerPositionsRef.current)
      if (distance == null || distance <= 0) return
      e.preventDefault()
      pinchStartRef.current = { distance, fontScale: chordSongFontScale }
      return
    }

    touchStartRef.current = { x: e.clientX, y: e.clientY }
    touchMovedRef.current = false
    if (
      !embedded &&
      e.clientX <= VIEWPORT_EDGE_SWIPE_WIDTH_PX
    ) {
      e.preventDefault()
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerGestureActiveRef.current) return
    activePointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const pinchStart = pinchStartRef.current
    if (pinchStart) {
      const distance = pointerDistance(activePointerPositionsRef.current)
      if (distance == null) return
      e.preventDefault()
      writeChordSongFontScale(pinchStart.fontScale * (distance / pinchStart.distance))
      return
    }

    const start = touchStartRef.current
    if (!start || activePointerPositionsRef.current.size >= 2) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (
      Math.abs(dx) > VIEWPORT_TAP_MOVE_SLOP_PX ||
      Math.abs(dy) > VIEWPORT_TAP_MOVE_SLOP_PX
    ) {
      touchMovedRef.current = true
    }
    updateSwipeTrack(e.clientX, e.clientY, e.currentTarget, () => e.preventDefault())
  }

  function finishViewportGesture(
    clientX: number,
    clientY: number,
    target: EventTarget | null,
    currentTarget: HTMLDivElement,
    preventDefault: () => void,
    now: number,
  ) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return

    const dx = clientX - start.x
    const dy = clientY - start.y
    const isSwipe =
      Math.abs(dx) >= VIEWPORT_SWIPE_MIN_PX && Math.abs(dx) >= Math.abs(dy) * 1.2

    if (isSwipe) {
      touchMovedRef.current = false
      suppressClicksUntilRef.current = now + TOUCH_CLICK_SUPPRESSION_MS
      const rect = currentTarget.getBoundingClientRect()
      const relativeStartX = start.x - rect.left
      const startsAtLeftEdge = relativeStartX <= VIEWPORT_EDGE_SWIPE_WIDTH_PX
      const startsAtRightEdge =
        rect.width > 0 && relativeStartX >= rect.width - VIEWPORT_EDGE_SWIPE_WIDTH_PX

      if (embedded && enableEmbeddedSwipeNavigation && (startsAtLeftEdge || startsAtRightEdge)) {
        // Leave the room shell's edge gesture untouched: the shell owns the
        // queue and participant panels on mobile.
        return
      }

      const edgeSwipe = !embedded && startsAtLeftEdge

      if (edgeSwipe) {
        preventDefault()
        if (dx > 0) {
          cancelPendingChromeOpen()
          setKeyPopoverOpen(false)
          setLanguagePopoverOpen(false)
          if (showToc) setChromeVisible(true)
        }
        return
      }

      if (!canSwipeNavigate || navBlocked || chromeVisible) {
        settleSwipeTrack(null, currentTarget)
        return
      }
      settleSwipeTrack(dx > 0 ? 1 : -1, currentTarget)
      return
    }

    if (swipeTrackVisibleRef.current) {
      touchMovedRef.current = false
      suppressClicksUntilRef.current = now + TOUCH_CLICK_SUPPRESSION_MS
      settleSwipeTrack(null, currentTarget)
      return
    }

    if (touchMovedRef.current) {
      touchMovedRef.current = false
      suppressClicksUntilRef.current = now + TOUCH_CLICK_SUPPRESSION_MS
      return
    }

    if (handleViewportPointer(clientX, target, currentTarget)) {
      suppressClicksUntilRef.current = now + TOUCH_CLICK_SUPPRESSION_MS
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerGestureActiveRef.current) return
    activePointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinchStartRef.current) {
      activePointerPositionsRef.current.delete(e.pointerId)
      if (activePointerPositionsRef.current.size < 2) {
        pinchStartRef.current = null
        touchStartRef.current = null
        touchMovedRef.current = false
        suppressClicksUntilRef.current = gestureTimestamp() + TOUCH_CLICK_SUPPRESSION_MS
      }
      e.preventDefault()
      return
    }

    activePointerPositionsRef.current.delete(e.pointerId)
    if (activePointerPositionsRef.current.size > 0) return
    pointerGestureActiveRef.current = false
    finishViewportGesture(
      e.clientX,
      e.clientY,
      e.target,
      e.currentTarget,
      () => e.preventDefault(),
      gestureTimestamp(),
    )
    if (e.currentTarget.releasePointerCapture) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
    activePointerPositionsRef.current.delete(e.pointerId)
    pointerGestureActiveRef.current = activePointerPositionsRef.current.size > 0
    if (!pointerGestureActiveRef.current) {
      if (swipeTrackVisibleRef.current) settleSwipeTrack(null, e.currentTarget)
      suppressTouchFallbackRef.current = false
      touchStartRef.current = null
      pinchStartRef.current = null
      touchMovedRef.current = false
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (suppressTouchFallbackRef.current) return
    if (swipeTrackSettlingRef.current) return
    if (e.touches.length >= 2) {
      touchStartRef.current = null
      touchMovedRef.current = true
      cancelPendingChromeOpen()
      if (!isChordSurfaceTarget(e.target)) {
        pinchStartRef.current = null
        return
      }
      const distance = touchDistance(e.touches)
      if (distance == null || distance <= 0) return
      e.preventDefault()
      pinchStartRef.current = { distance, fontScale: chordSongFontScale }
      return
    }

    const touch = e.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    touchMovedRef.current = false

    if (
      !embedded &&
      touch.clientX <= VIEWPORT_EDGE_SWIPE_WIDTH_PX
    ) {
      // Safari's history gesture starts before touchend. Preventing the
      // default at the beginning is the best available web-page mitigation.
      e.preventDefault()
    }
  }

  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (suppressTouchFallbackRef.current) return
    const pinchStart = pinchStartRef.current
    if (pinchStart) {
      const distance = touchDistance(e.touches)
      if (distance == null) return
      e.preventDefault()
      writeChordSongFontScale(pinchStart.fontScale * (distance / pinchStart.distance))
      return
    }

    const start = touchStartRef.current
    const touch = e.touches[0]
    if (!start || !touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (
      Math.abs(dx) > VIEWPORT_TAP_MOVE_SLOP_PX ||
      Math.abs(dy) > VIEWPORT_TAP_MOVE_SLOP_PX
    ) {
      touchMovedRef.current = true
    }
    updateSwipeTrack(touch.clientX, touch.clientY, e.currentTarget, () => e.preventDefault())
  }

  function onTouchCancel(e: React.TouchEvent<HTMLDivElement>) {
    if (suppressTouchFallbackRef.current) {
      suppressTouchFallbackRef.current = false
      return
    }
    if (swipeTrackVisibleRef.current) {
      settleSwipeTrack(null, e.currentTarget)
    }
    touchStartRef.current = null
    pinchStartRef.current = null
    touchMovedRef.current = false
  }

  function handleViewportPointer(
    clientX: number,
    target: EventTarget | null,
    currentTarget: HTMLDivElement,
  ) {
      if (isInteractiveTarget(target)) return false

      const rect = currentTarget.getBoundingClientRect()
      const zone = viewportPointerZone(clientX, rect)
      const now = performance.now()
      const doubleTap =
        zone === 'middle' &&
        lastMiddleViewportTapTimeRef.current != null &&
        now - lastMiddleViewportTapTimeRef.current < VIEWPORT_DOUBLE_TAP_MS

      if (zone === 'middle') {
        lastMiddleViewportTapTimeRef.current = now
      }

      if (chromeVisible) {
        setKeyPopoverOpen(false)
        setLanguagePopoverOpen(false)
        if (zone !== 'middle') {
          cancelPendingChromeOpen()
          setChromeVisible(false)
          return true
        }
        if (doubleTap) {
          cancelPendingChromeOpen()
          toggleCurrentSongLike()
          return true
        }
        cancelPendingChromeOpen()
        setChromeVisible(false)
        return true
      }

      if (zone === 'left') {
        cancelPendingChromeOpen()
        if (!navBlocked) {
          if (embedded) dispatch({ type: 'prev' })
          else settleSwipeTrack(1, currentTarget)
        }
        return true
      }
      if (zone === 'right') {
        cancelPendingChromeOpen()
        if (!navBlocked) {
          if (embedded) dispatch({ type: 'next' })
          else settleSwipeTrack(-1, currentTarget)
        }
        return true
      }

      if (doubleTap) {
        cancelPendingChromeOpen()
        toggleCurrentSongLike()
        return true
      }

      cancelPendingChromeOpen()
      pendingChromeOpenRef.current = setTimeout(() => {
        pendingChromeOpenRef.current = null
        setKeyPopoverOpen(false)
        setLanguagePopoverOpen(false)
        setChromeVisible(true)
      }, VIEWPORT_DOUBLE_TAP_MS)
      return true
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (suppressTouchFallbackRef.current) {
      suppressTouchFallbackRef.current = false
      return
    }
    if (pinchStartRef.current) {
      pinchStartRef.current = null
      touchStartRef.current = null
      touchMovedRef.current = false
      suppressClicksUntilRef.current = performance.now() + TOUCH_CLICK_SUPPRESSION_MS
      e.preventDefault()
      return
    }

    const touch = e.changedTouches[0]
    if (!touch) return
    finishViewportGesture(
      touch.clientX,
      touch.clientY,
      e.target,
      e.currentTarget,
      () => e.preventDefault(),
      gestureTimestamp(),
    )
  }

  function onMainClick(e: React.MouseEvent<HTMLDivElement>) {
    if (performance.now() < suppressClicksUntilRef.current) {
      return
    }
    suppressClicksUntilRef.current = 0
    if (e.detail > 1) return

    handleViewportPointer(e.clientX, e.target, e.currentTarget)
  }

  function onMainDoubleClick(e: React.MouseEvent<HTMLElement>) {
    if (isInteractiveTarget(e.target)) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (viewportPointerZone(e.clientX, rect) !== 'middle') return
    e.preventDefault()
    cancelPendingChromeOpen()
    lastMiddleViewportTapTimeRef.current = performance.now()
    toggleCurrentSongLike()
  }

  function setTocSwipeOffsetValue(offset: number) {
    tocSwipeOffsetRef.current = offset
    setTocSwipeOffset(offset)
  }

  function resetTocSwipe() {
    tocSwipeSettlingRef.current = false
    setTocSwipeSettling(false)
    setTocSwipeOffsetValue(0)
  }

  function settleTocSwipe(
    dismiss: boolean,
    currentTarget: HTMLDivElement,
  ) {
    const width = currentTarget.getBoundingClientRect().width || currentTarget.clientWidth
    if (reduceMotion || width <= 0) {
      resetTocSwipe()
      if (dismiss) {
        cancelPendingChromeOpen()
        setKeyPopoverOpen(false)
        setLanguagePopoverOpen(false)
        setChromeVisible(false)
      }
      return
    }

    if (!dismiss && tocSwipeOffsetRef.current === 0) return

    tocSwipeSettlingRef.current = true
    setTocSwipeSettling(true)
    // Let the outer TOC panel and header exit while the tracked inner panel
    // returns to rest; animating it fully offscreen first creates a second exit.
    setTocSwipeOffsetValue(0)
    if (dismiss) {
      cancelPendingChromeOpen()
      setKeyPopoverOpen(false)
      setLanguagePopoverOpen(false)
      setChromeVisible(false)
    }
  }

  function onTocSwipeTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (
      e.target !== e.currentTarget ||
      e.propertyName !== 'transform' ||
      !tocSwipeSettlingRef.current
    ) return

    resetTocSwipe()
  }

  function onTocTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (tocSwipeSettlingRef.current) return
    if (!isPhoneViewport || e.touches.length !== 1) {
      tocTouchStartRef.current = null
      return
    }

    const touch = e.touches[0]
    if (!touch) return
    tocTouchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function onTocTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    const start = tocTouchStartRef.current
    const touch = e.touches.length === 1 ? e.touches[0] : undefined
    if (!start || !touch) {
      tocTouchStartRef.current = null
      return
    }

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) <= VIEWPORT_TAP_MOVE_SLOP_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return

    const width = e.currentTarget.getBoundingClientRect().width || e.currentTarget.clientWidth
    const boundedOffset = width > 0 ? Math.max(-width, Math.min(0, dx)) : Math.min(0, dx)
    setTocSwipeOffsetValue(boundedOffset)
    e.preventDefault()
  }

  function onTocTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = tocTouchStartRef.current
    tocTouchStartRef.current = null
    const touch = e.changedTouches[0]
    if (!start || !touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const isDismissSwipe =
      dx <= -VIEWPORT_SWIPE_MIN_PX && Math.abs(dx) >= Math.abs(dy) * 1.2
    if (isDismissSwipe || tocSwipeOffsetRef.current !== 0) {
      if (isDismissSwipe) e.preventDefault()
      settleTocSwipe(isDismissSwipe, e.currentTarget)
    }
  }

  function onTocTouchCancel(e: React.TouchEvent<HTMLDivElement>) {
    tocTouchStartRef.current = null
    settleTocSwipe(false, e.currentTarget)
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
        <AnimatePresence initial={false}>
          {chromeVisible ? (
            <motion.header
              key="player-chrome-header"
              className={playerChromeHeaderClass}
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? undefined : {
                height: 0,
                opacity: 0,
                transition: {
                  height: { duration: 0.1, delay: 0.12, ease: PLAYER_CHROME_EASE },
                  opacity: { duration: 0.12, ease: PLAYER_CHROME_EASE },
                },
              }}
              transition={chromeTransition}
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                asChild
                className={playerHeaderIconButtonClass}
              >
                <Link to={backTo} aria-label={t(backAriaKeyOverride ?? backAriaKeyForPlayerType(type))}>
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
                            disabled={navBlocked}
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
                          aria-label={t('player.key.current', {
                            key: selectedKey ?? t('player.transpose.default'),
                          })}
                          disabled={navBlocked}
                        >
                          <span className={cn(playerHeaderIconClass, 'text-sm font-semibold leading-none')}>
                            {selectedKey ?? '♮'}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 p-2">
                        <p className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">
                          {t('player.key.title')}
                        </p>
                        <div className="grid grid-cols-4 gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              !currentKeySelection.hasKeyOverride && transposeOffset === 0
                                ? 'default'
                                : 'outline'
                            }
                            className="col-span-4"
                            onClick={() => {
                              setViewState((s) => clearPlayerKeyForItem(s, nav.index))
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
                              variant={selectedKey === key ? 'default' : 'outline'}
                              data-testid={`key-option-${key}`}
                              onClick={() => {
                                const nextTransposeOffset = transposeOffsetForSelectedKeyChange(
                                  showTransposeControls,
                                  transposeOffset,
                                  currentKeySelection.soundingKey,
                                  key,
                                )
                                setViewState((s) =>
                                  setTransposeOffsetForItem(
                                    setPlayerKeyForItem(s, nav.index, key),
                                    nav.index,
                                    nextTransposeOffset,
                                  ),
                                )
                                setKeyPopoverOpen(false)
                              }}
                            >
                              {key}
                            </Button>
                          ))}
                        </div>
                        {showTransposeControls ? (
                          <div className="mt-2 border-t border-[var(--color-border)] pt-2">
                            <p className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">
                              {t('player.transpose.title')}
                            </p>
                            <div className="grid grid-cols-2 gap-1">
                              {transposeOptions.map(({ offset, key }) => (
                                <Button
                                  key={offset}
                                  type="button"
                                  size="sm"
                                  variant={transposeOffset === offset ? 'default' : 'outline'}
                                  className={offset === 0 ? 'col-span-2' : undefined}
                                  data-testid={`transpose-offset-${offset}`}
                                  onClick={() => {
                                    setViewState((s) => setTransposeOffsetForItem(s, nav.index, offset))
                                    setKeyPopoverOpen(false)
                                  }}
                                >
                                  {offset === 0
                                    ? t('player.transpose.default')
                                    : `${key} (${formatPlayedKeyOffset(offset)})`}
                                </Button>
                              ))}
                            </div>
                          </div>
                        ) : showCapoControls ? (
                          <div className="mt-2 border-t border-[var(--color-border)] pt-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
                                {t('player.capo.title')}
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                asChild
                                className="size-6 shrink-0"
                              >
                                <Link
                                  to="/settings"
                                  search={buildSettingsSearch('player', {
                                    playerType: type,
                                    playerId: id,
                                    playerIndex: nav.index,
                                  })}
                                  hash="comfortable-keys"
                                  aria-label={t('player.capo.configureComfortableKeys')}
                                >
                                  <SettingsIcon size={16} />
                                </Link>
                              </Button>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mb-1 w-full"
                              disabled={localCapoShape == null}
                              onClick={() => {
                                setViewState((s) => clearCapoForItem(s, nav.index))
                                setKeyPopoverOpen(false)
                              }}
                            >
                              {t('player.capo.reset')}
                            </Button>
                            <div className="grid grid-cols-2 gap-1">
                              {capoShapeOptions.map((key) => {
                                const fret = capoFretForKeys(soundingKey, key)
                                return (
                                  <Button
                                    key={key}
                                    type="button"
                                    size="sm"
                                    variant={capoShapeKey === key ? 'default' : 'outline'}
                                    className="min-w-[7rem]"
                                    aria-label={t('player.capo.playIn', { key, fret })}
                                    data-testid={`capo-shape-${key}`}
                                    onClick={() => {
                                      setViewState((s) => setCapoForItem(s, nav.index, key))
                                      setKeyPopoverOpen(false)
                                    }}
                                  >
                                    {t('player.capo.shape', { key, fret })}
                                  </Button>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                      </PopoverContent>
                    </PopoverRoot>
                  </>
                ) : null}
                {allowLibraryActions ? <PlayerEditMenu
                  playerType={type}
                  canEditSong={currentItem.type === 'chords'}
                  onEditSong={navigateToSongEditor}
                  onEditResource={navigateToResourceEditor}
                /> : null}
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
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <motion.div
            role="main"
            aria-label={t('player.mainAria', { title: title || t('player.untitled') })}
            className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            style={
              !embedded
                ? { touchAction: 'pan-y', overscrollBehaviorX: 'none' }
                : undefined
            }
            animate={{
              paddingLeft: chromeVisible && showToc && !isPhoneViewport ? tocInsetPx : 0,
              paddingRight: chromeVisible && roomSidebar ? tocInsetPx : 0,
            }}
            transition={chromeTransition}
            onClick={onMainClick}
            onDoubleClick={onMainDoubleClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
          >
            {likeBurstActive ? (
              <PlayerLikeHeartBurst
                key={likeBurstKey}
                liked={likeBurstLiked}
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

            {swipeTrackVisible ? (
              <div
                data-testid="player-swipe-track"
                className="flex h-full min-h-0 w-[300%] shrink-0"
                style={{
                  transform: `translate3d(calc(-33.333333% + ${swipeTrackOffset}px), 0, 0)`,
                  transition: swipeTrackSettling && !reduceMotion ? PLAYER_SWIPE_TRANSITION : 'none',
                }}
                onTransitionEnd={onSwipeTrackTransitionEnd}
              >
                <div className="h-full min-h-0 w-1/3 shrink-0 overflow-hidden">
                  {renderPlayerNavContent(previousSwipeNav)}
                </div>
                <div className="h-full min-h-0 w-1/3 shrink-0 overflow-hidden">
                  {renderPlayerNavContent(nav)}
                </div>
                <div className="h-full min-h-0 w-1/3 shrink-0 overflow-hidden">
                  {renderPlayerNavContent(nextSwipeNav)}
                </div>
              </div>
            ) : (
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {renderPlayerNavContent(nav)}
              </div>
            )}
          </motion.div>

          <AnimatePresence initial={false} onExitComplete={resetTocSwipe}>
            {chromeVisible && showToc ? (
              <motion.div
                key="player-chrome-toc"
                ref={tocOverlayRef}
                className={cn(
                  'pointer-events-auto absolute inset-y-0 left-0 z-10 flex overflow-hidden',
                  isPhoneViewport ? 'w-full' : tocSidebar ? PLAYER_TOC_WIDTH_CLASS : undefined,
                )}
                style={isPhoneViewport ? { touchAction: 'pan-y', overscrollBehaviorX: 'none' } : undefined}
                initial={reduceMotion ? false : { x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={chromeTransition}
                onTouchStart={onTocTouchStart}
                onTouchMove={onTocTouchMove}
                onTouchEnd={onTocTouchEnd}
                onTouchCancel={onTocTouchCancel}
              >
                <div
                  data-testid="player-toc-swipe-track"
                  className="h-full min-w-0 w-full"
                  style={{
                    transform: `translate3d(${tocSwipeOffset}px, 0, 0)`,
                    transition: tocSwipeSettling && !reduceMotion ? PLAYER_SWIPE_TRANSITION : 'none',
                  }}
                  onTransitionEnd={onTocSwipeTransitionEnd}
                >
                  {tocSidebar ?? (
                    <PlayerTocSidebar
                      toc={displayToc}
                      items={player.items}
                      currentSourceIdx={nav.index}
                      currentLanguageIndex={currentLanguageIndex}
                      onSelect={handleTocSelect}
                      className={isPhoneViewport ? 'w-full border-r-0' : undefined}
                    />
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {chromeVisible && roomSidebar ? (
              <motion.div
                key="room-sidebar"
                className="pointer-events-auto absolute inset-y-0 right-0 z-10 flex overflow-hidden"
                initial={reduceMotion ? false : { x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={chromeTransition}
              >
                {roomSidebar}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>
    </LayoutGroup>
  )
}
