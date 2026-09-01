import type { components } from '@/api/schema'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { AvMediaTransportPanel } from '@/components/player/av/AvMediaTransportPanel'
import { AvSpotifyPanel } from '@/components/player/av/AvSpotifyPanel'
import { AvOutlinePanel } from '@/components/player/av/AvOutlinePanel'
import { AvSectionShortcuts } from '@/components/player/av/AvSectionShortcuts'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import { AvSlidesPanel } from '@/components/player/av/AvSlidesPanel'
import { UsersIcon } from '@/components/icons/lucide-animated/users-icon'
import { LayersIcon } from '@/components/icons/lucide-animated/layers-icon'
import { PlayerEditMenu } from '@/components/player/PlayerEditMenu'
import { PlayerTocSidebar } from '@/components/player/PlayerTocSidebar'
import { ChevronLeftIcon } from '@/components/icons/lucide-animated/chevron-left-icon'
import { OutputIcon } from '@/components/icons/lucide-animated/output-icon'
import { SettingsIcon } from '@/components/icons/lucide-animated/settings-icon'
import { Button } from '@/components/ui/button'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePlayerIndexSearchSync } from '@/hooks/usePlayerIndexSearchSync'
import { useTocMultilingualPreference } from '@/hooks/useTocMultilingualPreference'
import { useAvBilingualPreference } from '@/hooks/useAvBilingualPreference'
import { useSetlistEvictionWatch } from '@/hooks/useSetlistEvictionWatch'
import { useResolvedPlayerItemChordData } from '@/lib/player/apply-song-flow'
import {
  avItemTitle,
  avNextItemIndex,
  avNextSlideInItem,
  avPrevItemIndex,
  avPrevSlideInItem,
  buildAvDeckPageEntries,
  resolveAvItemLanguageIndex,
  avSlidesForPlayerItem,
} from '@/lib/player/av-nav'
import {
  AV_OPEN_OUTPUT_SHORTCUT_KEY,
  avKeyboardAction,
  avSectionJumpTitle,
} from '@/lib/player/av-keyboard'
import {
  avPresentationIndexForSectionTitle,
  avSlideDeckEntrySlideIndex,
  buildAvOutlineRows,
  buildAvSlideDeckEntries,
} from '@/lib/player/av-lyric-slides'
import { readLyricCollapseWhitespacePreference } from '@/lib/lyric-whitespace-preference'
import {
  readAvPreferences,
  writeAvPreferences,
  type AvBackgroundPreset,
  type AvPreferences,
  type AvScreenState,
} from '@/lib/player/av-preferences'
import {
  buildAvPlaybackIntent,
  DEFAULT_AV_PLAYBACK_LOOP,
  DEFAULT_AV_PLAYBACK_MUTED,
  DEFAULT_AV_PLAYBACK_VOLUME,
  isTimedAvKind,
  isWebPageAvKind,
  timedProjectionContentFromItem,
} from '@/lib/player/av-projection-playback'
import {
  buildAvProjectionCommand,
  lyricsPayloadFromCommand,
  slideViewPropsFromCommand,
  type AvProjectionCommand,
  type AvProjectionContent,
  type AvProjectionPlaybackIntent,
} from '@/lib/player/av-projection-protocol'
import {
  aggregateAvPlayback,
  AV_OUTPUT_HEARTBEAT_MS,
  INITIAL_CONTROLLER_PROJECTION_STATE,
  hasReadyAvOutput,
  nextAvProjectionCommandId,
  reduceControllerProjection,
  summarizeAvOutputs,
  type AvControllerProjectionState,
} from '@/lib/player/av-projection-reducer'
import {
  createAvProjectionChannel,
  getAvProjectionSessionId,
  newAvOutputWindowName,
  type AvProjectionChannel,
} from '@/lib/player/av-projection-sync'
import {
  readAvSessionState,
  writeAvSessionState,
  type AvSessionState,
} from '@/lib/player/av-session-state'
import {
  clearLanguageForItem,
  readPlayerViewState,
  setLanguageForItem,
  writePlayerViewState,
  type PlayerViewState,
} from '@/lib/player/player-view-state'
import {
  PLAYER_HEADER_ICON_SIZE,
  PLAYER_TOC_WIDTH_CLASS,
  playerHeaderIconButtonClass,
  playerHeaderIconClass,
} from '@/lib/player/player-chrome'
import { buildSongEditorReturnSearch } from '@/lib/player/player-editor-return'
import { tocEntryForIndex } from '@/lib/player/player-helpers'
import type { PlayerEntityType } from '@/lib/player-route'
import { songLanguageOptions } from '@/lib/player/song-language'
import { buildSettingsSearch } from '@/lib/settings-route'
import { cn } from '@/lib/utils'

import './player-av.css'

type Player = components['schemas']['Player']

type PlayerAvProps = {
  type: PlayerEntityType
  id: string
  player: Player
  initialIndex?: number
  allowNetworkFetch: boolean
  resourceTitle?: string
  deletedReconciled?: boolean
  roomMusicalState?: { item_index: number; language: string | null; transposition: string | null }
  roomStateRevision?: number
  canControlRoomMusicalState?: boolean
  canControlRoomProjection?: boolean
  onRoomMusicalStateChange?: (state: { item_index: number; language: string | null; transposition: string | null }) => void
  onRoomProjectionChange?: (payload: import('@/lib/player/av-preferences').AvProjectionPayload) => void
  allowLibraryActions?: boolean
  backToOverride?: '/media'
  backAriaKeyOverride?: string
  watchSetlistEviction?: boolean
  roomSidebar?: ReactNode
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

function toggleBlankScreenState(state: AvScreenState): AvScreenState {
  if (state === 'blank') return 'live'
  return 'blank'
}

function toggleBlackoutScreenState(state: AvScreenState): AvScreenState {
  if (state === 'blackout') return 'live'
  return 'blackout'
}

export function PlayerAv({
  type,
  id,
  player,
  initialIndex,
  resourceTitle,
  roomMusicalState,
  roomStateRevision,
  canControlRoomMusicalState = false,
  canControlRoomProjection = false,
  onRoomMusicalStateChange,
  onRoomProjectionChange,
  allowLibraryActions = true,
  backToOverride,
  backAriaKeyOverride,
  watchSetlistEviction = true,
  roomSidebar,
}: PlayerAvProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const tocMultilingualEnabled = useTocMultilingualPreference()
  const bilingualEnabled = useAvBilingualPreference()
  const [prefs, setPrefs] = useState<AvPreferences>(() => readAvPreferences())
  const [viewState, setViewState] = useState<PlayerViewState>(() => readPlayerViewState(type, id))
  const [session, setSession] = useState<AvSessionState>(() => {
    const saved = readAvSessionState(type, id)
    const startItem = initialIndex ?? saved.itemIndex ?? player.index
    const startSlide = initialIndex != null ? 0 : saved.slideIndex
    return { ...saved, itemIndex: startItem, slideIndex: startSlide }
  })
  /** What the output window shows — lags behind `session` until the user navigates slides. */
  const [projected, setProjected] = useState<AvSessionState>(() => {
    const saved = readAvSessionState(type, id)
    const startItem = initialIndex ?? saved.itemIndex ?? player.index
    const startSlide = initialIndex != null ? 0 : saved.slideIndex
    return { ...saved, itemIndex: startItem, slideIndex: startSlide }
  })
  const [tocVisible] = useState(true)
  const [rightPanel, setRightPanel] = useState<'av' | 'room'>(() => (roomSidebar ? 'room' : 'av'))
  const [languagePopoverOpen, setLanguagePopoverOpen] = useState(false)
  const resolveLanguageIndexForItem = useCallback(
    (itemIndex: number) => viewState.languageByItem?.[itemIndex],
    [viewState.languageByItem],
  )

  const sessionId = getAvProjectionSessionId()
  const syncRef = useRef<AvProjectionChannel | null>(null)
  const skipProjectionBroadcastRef = useRef(true)
  const lastProjectionBroadcastRef = useRef<string | null>(null)
  const lastRoomProjectionRef = useRef<string | null>(null)
  const controllerRef = useRef<AvControllerProjectionState>(INITIAL_CONTROLLER_PROJECTION_STATE)
  const [outputRegistry, setOutputRegistry] = useState<AvControllerProjectionState>(
    INITIAL_CONTROLLER_PROJECTION_STATE,
  )
  const [missingOutputWarning, setMissingOutputWarning] = useState(false)
  const [missingOutputReason, setMissingOutputReason] = useState<'page' | 'play' | 'show'>('page')
  const [livePlayback, setLivePlayback] = useState<AvProjectionPlaybackIntent | null>(null)
  const [controllerVolume, setControllerVolume] = useState(DEFAULT_AV_PLAYBACK_VOLUME)
  const [controllerMuted, setControllerMuted] = useState(DEFAULT_AV_PLAYBACK_MUTED)
  const [controllerLoop, setControllerLoop] = useState(DEFAULT_AV_PLAYBACK_LOOP)

  const itemsLen = player.items.length
  const tocRow = tocEntryForIndex(player.toc, session.itemIndex)
  const title = avItemTitle(
    player.items,
    session.itemIndex,
    resourceTitle || tocRow?.title,
    resolveLanguageIndexForItem,
  )
  const showToc = player.toc.length > 0
  const containsMedia = player.items.some((item) => item.type === 'media')
  const watchSetlistMirrorEviction =
    type === 'setlist' && watchSetlistEviction && !containsMedia
  const evicted = useSetlistEvictionWatch(
    watchSetlistMirrorEviction ? id : undefined,
    watchSetlistMirrorEviction,
  )
  const navBlocked = evicted || Boolean(roomMusicalState && !canControlRoomMusicalState)
  const backTo = backToOverride ?? hubPathForPlayerType(type)

  usePlayerIndexSearchSync(type, id, session.itemIndex, 'av')

  useEffect(() => {
    writePlayerViewState(type, id, viewState)
  }, [type, id, viewState])

  const collapseLyricWhitespace = readLyricCollapseWhitespacePreference()

  const currentPlayerItem = player.items[session.itemIndex]
  const projectedPlayerItem = player.items[projected.itemIndex]
  const projectedTocRow = tocEntryForIndex(player.toc, projected.itemIndex)
  const projectedTitle = avItemTitle(
    player.items,
    projected.itemIndex,
    resourceTitle || projectedTocRow?.title,
    resolveLanguageIndexForItem,
  )
  const resolvedCurrentSongData = useResolvedPlayerItemChordData(currentPlayerItem)
  const resolvedProjectedSongData = useResolvedPlayerItemChordData(projectedPlayerItem)

  const currentItem = useMemo(
    () =>
      avSlidesForPlayerItem(player.items, session.itemIndex, {
        maxLinesPerSlide: prefs.contentLayer.maxLinesPerSlide,
        balanceSlideLines: prefs.contentLayer.balanceSlideLines,
        collapseLyricWhitespace,
      }, resolveLanguageIndexForItem, bilingualEnabled, resolvedCurrentSongData, title),
    [
      player.items,
      prefs.contentLayer.maxLinesPerSlide,
      prefs.contentLayer.balanceSlideLines,
      collapseLyricWhitespace,
      resolveLanguageIndexForItem,
      session.itemIndex,
      bilingualEnabled,
      resolvedCurrentSongData,
      title,
    ],
  )

  const projectedItem = useMemo(
    () =>
      avSlidesForPlayerItem(player.items, projected.itemIndex, {
        maxLinesPerSlide: prefs.contentLayer.maxLinesPerSlide,
        balanceSlideLines: prefs.contentLayer.balanceSlideLines,
        collapseLyricWhitespace,
      }, resolveLanguageIndexForItem, bilingualEnabled, resolvedProjectedSongData, projectedTitle),
    [
      player.items,
      prefs.contentLayer.maxLinesPerSlide,
      prefs.contentLayer.balanceSlideLines,
      collapseLyricWhitespace,
      resolveLanguageIndexForItem,
      projected.itemIndex,
      bilingualEnabled,
      resolvedProjectedSongData,
      projectedTitle,
    ],
  )

  const slideCount = currentItem.slides.length
  const announcement = useMemo(() => {
    if (session.screenState === 'blackout') return t('player.av.blackoutOn')
    if (session.screenState === 'blank') return t('player.av.blankOn')
    return t('player.av.slideAnnounce', {
      current: session.slideIndex + 1,
      total: slideCount,
      title: title || t('player.untitled'),
    })
  }, [session.screenState, session.slideIndex, slideCount, t, title])
  const slideDeckEntries = useMemo(
    () =>
      currentItem.kind === 'deck' && currentItem.mediaId && currentItem.pages
        ? buildAvDeckPageEntries(currentItem.mediaId, currentItem.pages, (index) =>
            t('player.av.outputPage', { n: index + 1 }),
            title,
          )
        : buildAvSlideDeckEntries(
            currentItem.outline,
            currentItem.sourceSlides,
            currentItem.structuredSourceSlides,
          ),
    [currentItem, t, title],
  )
  const outlineRows = useMemo(
    () => buildAvOutlineRows(currentItem.outline, session.slideIndex),
    [currentItem.outline, session.slideIndex],
  )
  const selectedDeckSlideIndex = useMemo(
    () =>
      currentItem.kind === 'deck'
        ? session.slideIndex
        : avSlideDeckEntrySlideIndex(currentItem.outline, session.slideIndex),
    [currentItem.kind, currentItem.outline, session.slideIndex],
  )

  const currentText = useMemo(() => {
    if (session.screenState !== 'live') return ''
    return currentItem.slides[session.slideIndex] ?? currentItem.slides[0] ?? ''
  }, [currentItem.slides, session.screenState, session.slideIndex])

  const projectedSlideCount = projectedItem.slides.length
  const projectedText = useMemo(() => {
    if (projected.screenState !== 'live') return ''
    return (
      projectedItem.slides[projected.slideIndex] ?? projectedItem.slides[0] ?? ''
    )
  }, [projected.screenState, projected.slideIndex, projectedItem.slides])

  const projectedNextText = useMemo(() => {
    const nextIndex = avNextSlideInItem(projectedSlideCount, projected.slideIndex)
    if (nextIndex == null) return null
    return projectedItem.slides[nextIndex] ?? null
  }, [projected.slideIndex, projectedItem.slides, projectedSlideCount])

  const projectedLines = useMemo(() => {
    if (projected.screenState !== 'live') return undefined
    return (
      projectedItem.structuredSlides?.[projected.slideIndex]
      ?? projectedItem.structuredSlides?.[0]
    )
  }, [projected.screenState, projected.slideIndex, projectedItem.structuredSlides])

  const playerReturnContext = useMemo(
    () => ({
      playerType: type,
      playerId: id,
      playerIndex: session.itemIndex,
      playerMode: 'av' as const,
    }),
    [type, id, session.itemIndex],
  )

  const rawItem = player.items[session.itemIndex]
  const currentLanguageIndex =
    rawItem?.type === 'chords'
      ? resolveAvItemLanguageIndex(rawItem, session.itemIndex, resolveLanguageIndexForItem)
      : null
  const currentLanguageOptions = useMemo(() => rawItem?.type === 'chords' ? songLanguageOptions(rawItem.song.data as Record<string, unknown>) : [], [rawItem])
  const currentLanguageLabel =
    currentLanguageOptions[currentLanguageIndex ?? 0]?.label ??
    `L${(currentLanguageIndex ?? 0) + 1}`
  const showLanguageSelector = rawItem?.type === 'chords' && currentLanguageOptions.length > 1

  useEffect(() => {
    if (!roomMusicalState || canControlRoomMusicalState) return
    const roomItem = player.items[roomMusicalState.item_index]
    const roomLanguageOptions =
      roomItem?.type === 'chords'
        ? songLanguageOptions(roomItem.song.data as Record<string, unknown>)
        : []
    queueMicrotask(() => {
      setSession((state) => {
        if (state.itemIndex === roomMusicalState.item_index) return state
        return { ...state, itemIndex: roomMusicalState.item_index, slideIndex: 0 }
      })
      if (roomItem?.type !== 'chords') return
      const languageIndex =
        roomMusicalState.language == null
          ? 0
          : roomLanguageOptions.findIndex((option) => option.label === roomMusicalState.language)
      setViewState((state) => {
        const target = languageIndex > 0 ? languageIndex : undefined
        if (state.languageByItem?.[roomMusicalState.item_index] === target) return state
        return languageIndex > 0
          ? setLanguageForItem(state, roomMusicalState.item_index, languageIndex)
          : clearLanguageForItem(state, roomMusicalState.item_index)
      })
    })
  }, [
    roomMusicalState,
    roomStateRevision,
    canControlRoomMusicalState,
    session.itemIndex,
    player.items,
  ])

  const lastRoomMusicalStateRef = useRef('')
  useEffect(() => {
    if (!canControlRoomMusicalState || !onRoomMusicalStateChange) return
    const state = { item_index: session.itemIndex, language: rawItem?.type === 'chords' && currentLanguageOptions.length > 0 ? currentLanguageLabel : null, transposition: roomMusicalState?.transposition ?? null }
    const serialized = JSON.stringify(state)
    if (serialized === lastRoomMusicalStateRef.current) return
    lastRoomMusicalStateRef.current = serialized
    onRoomMusicalStateChange(state)
  }, [canControlRoomMusicalState, currentLanguageLabel, currentLanguageOptions.length, onRoomMusicalStateChange, rawItem, roomMusicalState?.transposition, session.itemIndex])

  const navigateToSongEditor = useCallback(() => {
    const item = player.items[session.itemIndex]
    if (item?.type !== 'chords') return
    void navigate({
      to: '/songs/$songId',
      params: { songId: item.song.id },
      search: buildSongEditorReturnSearch(playerReturnContext),
    })
  }, [navigate, player.items, playerReturnContext, session.itemIndex])

  const navigateToMediaEditor = useCallback(() => {
    const item = player.items[session.itemIndex]
    if (item?.type !== 'media' || item.content?.type !== 'slide_deck') return
    void navigate({
      to: '/media/$mediaId',
      params: { mediaId: item.id },
      search: buildSongEditorReturnSearch(playerReturnContext),
    })
  }, [navigate, player.items, playerReturnContext, session.itemIndex])

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
    writeAvSessionState(type, id, session)
  }, [type, id, session])

  useEffect(() => {
    const channel = createAvProjectionChannel(sessionId, (message) => {
      const next = reduceControllerProjection(
        controllerRef.current,
        { type: 'message', message },
        Date.now(),
      )
      controllerRef.current = next
      setOutputRegistry(next)
      if (hasReadyAvOutput(next)) {
        setMissingOutputWarning(false)
      }
    })
    syncRef.current = channel
    const tick = window.setInterval(() => {
      const next = reduceControllerProjection(controllerRef.current, { type: 'tick' }, Date.now())
      controllerRef.current = next
      setOutputRegistry(next)
    }, AV_OUTPUT_HEARTBEAT_MS)
    return () => {
      window.clearInterval(tick)
      channel.close()
      syncRef.current = null
    }
  }, [sessionId])

  const openOutputWindow = useCallback(() => {
    const url = `/player/output?s=${encodeURIComponent(sessionId)}`
    window.open(url, newAvOutputWindowName(), 'noopener,noreferrer')
  }, [sessionId])

  const projectedContent = useMemo((): AvProjectionContent => {
    if (projectedItem.kind === 'deck' && projectedItem.mediaId && projectedItem.pages?.length) {
      const page = projectedItem.pages[projected.slideIndex] ?? projectedItem.pages[0]
      if (page) return { type: 'deck_page', mediaId: projectedItem.mediaId, assetId: page.blobId }
    }
    if (
      livePlayback &&
      isTimedAvKind(projectedItem.kind)
    ) {
      const timed = timedProjectionContentFromItem(projectedItem)
      if (timed) return timed
    }
    return {
      type: 'lyrics',
      contentText: projectedText,
      ...(projectedLines && projectedLines.length > 0 ? { contentLines: projectedLines } : {}),
    }
  }, [
    livePlayback,
    projected.slideIndex,
    projectedItem,
    projectedLines,
    projectedText,
  ])

  const projectedCommand = useMemo(
    (): AvProjectionCommand =>
      buildAvProjectionCommand({
        sessionId,
        commandId: 0,
        content: projectedContent,
        contentLayer: prefs.contentLayer,
        backgroundLayer: prefs.backgroundLayer,
        transition: prefs.transition,
        screenState: projected.screenState,
        itemTitle: projectedTitle || t('player.untitled'),
        nextPreview: projectedNextText,
        prefersReducedMotion: reduceMotion ?? false,
        playback: livePlayback && isTimedAvKind(projectedItem.kind) ? livePlayback : undefined,
      }),
    [
      livePlayback,
      prefs.backgroundLayer,
      prefs.contentLayer,
      prefs.transition,
      projected.screenState,
      projectedContent,
      projectedItem.kind,
      projectedNextText,
      projectedTitle,
      reduceMotion,
      sessionId,
      t,
    ],
  )

  const projectedSlideView = slideViewPropsFromCommand(projectedCommand)
  const outputSummary = summarizeAvOutputs(outputRegistry)

  useEffect(() => {
    if (skipProjectionBroadcastRef.current) {
      skipProjectionBroadcastRef.current = false
      return
    }
    if (isTimedAvKind(projectedItem.kind) && !livePlayback) return
    const commandId = nextAvProjectionCommandId(controllerRef.current)
    const command: AvProjectionCommand = { ...projectedCommand, commandId }
    const serializedPayload = JSON.stringify({
      intent: command.intent,
      screenState: command.screenState,
      content: command.content,
      backgroundLayer: command.backgroundLayer,
      contentLayer: command.contentLayer,
      transition: command.transition,
      itemTitle: command.itemTitle,
      nextPreview: command.nextPreview,
      playback: command.playback ?? null,
    })
    if (lastProjectionBroadcastRef.current === serializedPayload) return
    lastProjectionBroadcastRef.current = serializedPayload
    const issued = reduceControllerProjection(
      controllerRef.current,
      { type: 'issue', command },
      Date.now(),
    )
    controllerRef.current = issued
    setOutputRegistry(issued)
    if (!hasReadyAvOutput(issued) && !isTimedAvKind(projectedItem.kind)) {
      setMissingOutputWarning(true)
      setMissingOutputReason('page')
    }
    syncRef.current?.send(command)

    const roomPayload = lyricsPayloadFromCommand(command)
    if (canControlRoomProjection && onRoomProjectionChange && roomPayload) {
      const serializedRoom = JSON.stringify(roomPayload)
      if (lastRoomProjectionRef.current !== serializedRoom) {
        lastRoomProjectionRef.current = serializedRoom
        onRoomProjectionChange(roomPayload)
      }
    }
  }, [
    canControlRoomProjection,
    livePlayback,
    onRoomProjectionChange,
    projectedCommand,
    projectedItem.kind,
  ])

  const setBackgroundPreset = useCallback((preset: AvBackgroundPreset) => {
    setPrefs((prev) => {
      const next = { ...prev, backgroundLayer: { preset } }
      writeAvPreferences(next)
      return next
    })
  }, [])

  const goToSlide = useCallback(
    (slideIndex: number, clearScreenState = true) => {
      if (isTimedAvKind(currentItem.kind)) {
        setSession((state) => ({
          ...state,
          slideIndex: 0,
          screenState: clearScreenState ? 'live' : state.screenState,
        }))
        return
      }
      setLivePlayback(null)
      setSession((state) => {
        const clamped = Math.max(0, Math.min(slideIndex, Math.max(slideCount - 1, 0)))
        const next: AvSessionState = {
          ...state,
          slideIndex: clamped,
          screenState: clearScreenState ? 'live' : state.screenState,
        }
        setProjected(next)
        return next
      })
    },
    [currentItem.kind, slideCount],
  )

  const goToItem = useCallback((itemIndex: number) => {
    if (navBlocked) return
    setSession((state) => ({
      ...state,
      itemIndex,
      slideIndex: 0,
      screenState: 'live',
    }))
  }, [navBlocked])

  const pauseLivePlayback = useCallback(() => {
    setLivePlayback((prev) =>
      prev
        ? buildAvPlaybackIntent({
            action: 'pause',
            volume: prev.volume,
            muted: prev.muted,
            loop: prev.loop,
            issuedAtMs: Date.now(),
          })
        : prev,
    )
  }, [])

  const toggleBlank = useCallback(() => {
    setSession((state) => {
      const screenState = toggleBlankScreenState(state.screenState)
      setProjected((projectedState) => ({ ...projectedState, screenState }))
      return { ...state, screenState }
    })
    pauseLivePlayback()
  }, [pauseLivePlayback])

  const toggleBlackout = useCallback(() => {
    setSession((state) => {
      const screenState = toggleBlackoutScreenState(state.screenState)
      setProjected((projectedState) => ({ ...projectedState, screenState }))
      return { ...state, screenState }
    })
    pauseLivePlayback()
  }, [pauseLivePlayback])

  const startPlay = useCallback(() => {
    if (!timedProjectionContentFromItem(currentItem)) return
    if (!hasReadyAvOutput(controllerRef.current)) {
      setMissingOutputWarning(true)
      setMissingOutputReason(isWebPageAvKind(currentItem.kind) ? 'show' : 'play')
      return
    }
    setMissingOutputWarning(false)
    setProjected({
      itemIndex: session.itemIndex,
      slideIndex: 0,
      screenState: 'live',
    })
    setLivePlayback(
      buildAvPlaybackIntent({
        action: 'play',
        volume: controllerVolume,
        muted: controllerMuted,
        loop: controllerLoop,
        issuedAtMs: Date.now(),
      }),
    )
  }, [
    controllerLoop,
    controllerMuted,
    controllerVolume,
    currentItem,
    session.itemIndex,
  ])

  const issuePlayback = useCallback(
    (
      action: AvProjectionPlaybackIntent['action'],
      extra?: { positionMs?: number; volume?: number; muted?: boolean; loop?: boolean },
    ) => {
      if (action === 'play' && livePlayback == null) {
        startPlay()
        return
      }
      if (livePlayback == null) return
      if (typeof extra?.volume === 'number') setControllerVolume(extra.volume)
      if (typeof extra?.muted === 'boolean') setControllerMuted(extra.muted)
      if (typeof extra?.loop === 'boolean') setControllerLoop(extra.loop)
      setLivePlayback(
        buildAvPlaybackIntent({
          action,
          volume: extra?.volume ?? controllerVolume,
          muted: extra?.muted ?? controllerMuted,
          loop: extra?.loop ?? controllerLoop,
          positionMs: extra?.positionMs,
          issuedAtMs: Date.now(),
        }),
      )
    },
    [controllerLoop, controllerMuted, controllerVolume, livePlayback, startPlay],
  )

  const toggleAvTransport = useCallback(() => {
    if (!isTimedAvKind(currentItem.kind)) return
    const projectingThis =
      livePlayback != null &&
      projected.itemIndex === session.itemIndex &&
      isTimedAvKind(projectedItem.kind)
    if (!projectingThis) {
      startPlay()
      return
    }
    if (livePlayback.action === 'play' || livePlayback.action === 'resume' || livePlayback.action === 'restart') {
      issuePlayback('pause')
      return
    }
    issuePlayback(isWebPageAvKind(currentItem.kind) ? 'play' : 'resume')
  }, [
    currentItem.kind,
    issuePlayback,
    livePlayback,
    projected.itemIndex,
    projectedItem.kind,
    session.itemIndex,
    startPlay,
  ])

  const goPrev = useCallback(() => {
    const prevSlide = avPrevSlideInItem(session.slideIndex)
    if (prevSlide != null) {
      goToSlide(prevSlide)
    }
  }, [goToSlide, session.slideIndex])

  const goNext = useCallback(() => {
    const nextSlide = avNextSlideInItem(slideCount, session.slideIndex)
    if (nextSlide != null) {
      goToSlide(nextSlide)
    }
  }, [goToSlide, session.slideIndex, slideCount])

  const goPrevItem = useCallback(() => {
    const prevItem = avPrevItemIndex(session.itemIndex)
    if (prevItem != null) {
      goToItem(prevItem)
    }
  }, [goToItem, session.itemIndex])

  const goNextItem = useCallback(() => {
    const nextItem = avNextItemIndex(session.itemIndex, itemsLen)
    if (nextItem != null) {
      goToItem(nextItem)
    }
  }, [goToItem, session.itemIndex, itemsLen])

  const jumpToSection = useCallback(
    (sectionTitle: string) => {
      const slideIndex = avPresentationIndexForSectionTitle(currentItem.outline, sectionTitle)
      if (slideIndex == null) return
      goToSlide(slideIndex)
    },
    [currentItem.outline, goToSlide],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = avKeyboardAction(e.key, e.target, { tocOpen: tocVisible })
      if (!action && (e.key === 'n' || e.key === 'N')) {
        if (isEditableTarget(e.target)) return
        e.preventDefault()
        if (navBlocked) return
        if (e.key === 'n') goNextItem()
        else goPrevItem()
        return
      }

      if (!action) return

      if (action === 'prev') {
        e.preventDefault()
        if (!evicted) goPrev()
        return
      }
      if (action === 'next') {
        e.preventDefault()
        if (evicted) return
        if (isTimedAvKind(currentItem.kind) && (e.key === ' ' || e.key === 'Enter')) {
          toggleAvTransport()
          return
        }
        goNext()
        return
      }
      if (action === 'home') {
        e.preventDefault()
        if (!evicted) goToSlide(0)
        return
      }
      if (action === 'end') {
        e.preventDefault()
        if (!evicted) goToSlide(slideCount - 1)
        return
      }
      if (action === 'escape') {
        e.preventDefault()
        if (languagePopoverOpen) {
          setLanguagePopoverOpen(false)
        } else {
          void navigate({ to: backTo })
        }
        return
      }
      if (action === 'toggleBlank') {
        e.preventDefault()
        toggleBlank()
        return
      }
      if (action === 'toggleBlackout') {
        e.preventDefault()
        toggleBlackout()
        return
      }
      if (action === 'openOutput') {
        e.preventDefault()
        openOutputWindow()
        return
      }
      if (action === 'jumpSection') {
        const sectionTitle = avSectionJumpTitle(e.key)
        if (sectionTitle) {
          e.preventDefault()
          jumpToSection(sectionTitle)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    backTo,
    goNext,
    goNextItem,
    goPrev,
    goPrevItem,
    goToSlide,
    jumpToSection,
    evicted,
    navBlocked,
    navigate,
    openOutputWindow,
    slideCount,
    toggleAvTransport,
    toggleBlank,
    toggleBlackout,
    tocVisible,
    languagePopoverOpen,
    currentItem.kind,
  ])

  const showAvRightPanel = !roomSidebar || rightPanel === 'av'
  const showRoomSidebar = Boolean(roomSidebar) && rightPanel === 'room'
  const outputSummaryLabel =
    outputSummary.total === 0
      ? t('player.av.outputSummaryNone')
      : outputSummary.failed > 0
        ? t('player.av.outputSummaryFailed', {
            ready: outputSummary.ready,
            failed: outputSummary.failed,
          })
        : t('player.av.outputSummary', { ready: outputSummary.ready })

  if (itemsLen === 0 || slideCount === 0) {
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
    <div className="player-av relative flex h-dvh flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-foreground)]">
      {evicted ? (
        <p className="player-av-warning" role="status" aria-live="polite">
          {t('player.evicted')}
        </p>
      ) : missingOutputWarning ? (
        <p className="player-av-warning" role="status" aria-live="polite">
          {t(
            missingOutputReason === 'play'
              ? 'player.av.missingOutputPlay'
              : missingOutputReason === 'show'
                ? 'player.av.missingOutputShow'
                : 'player.av.missingOutput',
          )}
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <header className="player-av__header flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 sm:px-3">
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
          <p className="truncate text-sm font-medium">{title || t('player.untitled')}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t('player.av.position', {
              slide: session.slideIndex + 1,
              slides: slideCount,
              item: session.itemIndex + 1,
              items: itemsLen,
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
                        setViewState((state) =>
                          option.index === 0
                            ? clearLanguageForItem(state, session.itemIndex)
                            : setLanguageForItem(state, session.itemIndex, option.index),
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={playerHeaderIconButtonClass}
            aria-label={`${t('player.av.openOutput')}. ${outputSummaryLabel}`}
            aria-keyshortcuts={AV_OPEN_OUTPUT_SHORTCUT_KEY}
            title={outputSummaryLabel}
            onClick={() => openOutputWindow()}
          >
            <OutputIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
          </Button>
          <span className="sr-only" data-testid="output-summary">
            {outputSummaryLabel}
          </span>
          {allowLibraryActions ? <PlayerEditMenu
            playerType={type}
            canEditSong={rawItem?.type === 'chords'}
            canEditMedia={rawItem?.type === 'media' && currentItem.kind === 'deck'}
            onEditSong={navigateToSongEditor}
            onEditMedia={navigateToMediaEditor}
            onEditResource={navigateToResourceEditor}
          /> : null}
          {roomSidebar ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={playerHeaderIconButtonClass}
              aria-label={showRoomSidebar ? t('player.av.showAvPanel') : t('playerRooms.togglePanel')}
              aria-pressed={showRoomSidebar}
              onClick={() => setRightPanel((panel) => (panel === 'room' ? 'av' : 'room'))}
            >
              {showRoomSidebar ? (
                <LayersIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
              ) : (
                <UsersIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            asChild
            className={playerHeaderIconButtonClass}
          >
            <Link
              to="/settings"
              search={buildSettingsSearch('playerRoles', playerReturnContext)}
              aria-label={t('player.av.openSettings')}
            >
              <SettingsIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
            </Link>
          </Button>
        </div>
      </header>

      <div className="player-av__body flex min-h-0 flex-1">
        {tocVisible && showToc ? (
          <div className="player-av__toc shrink-0">
            <PlayerTocSidebar
              toc={player.toc}
              items={player.items}
              currentSourceIdx={session.itemIndex}
              currentLanguageIndex={currentLanguageIndex}
              onSelect={(idx, languageIndex) => {
                if (tocMultilingualEnabled && languageIndex != null) {
                  setViewState((state) => setLanguageForItem(state, idx, languageIndex))
                }
                goToItem(idx)
              }}
            />
          </div>
        ) : null}

        <div className="player-av__center min-h-0 min-w-0 flex flex-1 flex-col">
          <AvSectionShortcuts
            outline={currentItem.outline}
            screenState={session.screenState}
            onJump={jumpToSection}
            onToggleBlank={toggleBlank}
            onToggleBlackout={toggleBlackout}
          />

          {/* Flow: I4, I5 */}
          <div className="player-av__slides min-h-0 flex-1 overflow-hidden">
            {currentItem.kind === 'spotify' &&
            currentItem.spotifyResourceType &&
            currentItem.canonicalUrl ? (
              <AvSpotifyPanel
                title={title || t('player.untitled')}
                resourceType={currentItem.spotifyResourceType}
                canonicalUrl={currentItem.canonicalUrl}
                backgroundLayer={prefs.backgroundLayer}
                backgroundPreviewText={currentText}
                contentLayer={prefs.contentLayer}
                onSelectBackgroundPreset={setBackgroundPreset}
              />
            ) : isTimedAvKind(currentItem.kind) ? (
              <AvMediaTransportPanel
                kind={currentItem.kind}
                title={title || t('player.untitled')}
                projected={
                  livePlayback != null &&
                  projected.itemIndex === session.itemIndex &&
                  isTimedAvKind(projectedItem.kind)
                }
                issuedAction={livePlayback?.action ?? null}
                playback={aggregateAvPlayback(outputRegistry)}
                volume={controllerVolume}
                muted={controllerMuted}
                loop={controllerLoop}
                backgroundLayer={prefs.backgroundLayer}
                backgroundPreviewText={currentText}
                contentLayer={prefs.contentLayer}
                onPlay={() => startPlay()}
                onPause={() => issuePlayback('pause')}
                onResume={() => issuePlayback('resume')}
                onSeek={(positionMs) => issuePlayback('seek', { positionMs })}
                onRestart={() => issuePlayback('restart')}
                onVolume={(volume) => {
                  setControllerVolume(volume)
                  if (volume > 0) setControllerMuted(false)
                  if (livePlayback) {
                    issuePlayback('configure', { volume, muted: volume > 0 ? false : controllerMuted })
                  }
                }}
                onMute={(muted) => {
                  setControllerMuted(muted)
                  if (livePlayback) issuePlayback('configure', { muted })
                }}
                onLoop={(loop) => {
                  setControllerLoop(loop)
                  if (livePlayback) issuePlayback('configure', { loop })
                }}
                onRetry={() => startPlay()}
                onSelectBackgroundPreset={setBackgroundPreset}
              />
            ) : (
              <AvSlidesPanel
                entries={slideDeckEntries}
                currentSlideIndex={selectedDeckSlideIndex}
                contentLayer={prefs.contentLayer}
                backgroundLayer={prefs.backgroundLayer}
                backgroundPreviewText={currentText}
                transition={prefs.transition}
                onSelectSlide={(slideIndex) => goToSlide(slideIndex)}
                onSelectBackgroundPreset={setBackgroundPreset}
              />
            )}
          </div>
        </div>

        <aside className={cn('player-av__right shrink-0', PLAYER_TOC_WIDTH_CLASS)}>
          {showRoomSidebar ? (
            roomSidebar
          ) : showAvRightPanel ? (
            <>
              <div className="player-av__preview">
                <AvSlideView
                  preview
                  contentText={projectedSlideView.contentText}
                  contentLines={projectedSlideView.contentLines}
                  deckPage={projectedSlideView.deckPage}
                  timedPreview={
                    isTimedAvKind(projectedItem.kind)
                      ? { kind: projectedItem.kind, title: projectedTitle || t('player.untitled') }
                      : undefined
                  }
                  contentLayer={prefs.contentLayer}
                  backgroundLayer={prefs.backgroundLayer}
                  transition={prefs.transition}
                  screenState={projected.screenState}
                />
              </div>

              <AvOutlinePanel
                rows={outlineRows}
                onSelectSlide={(slideIndex) => goToSlide(slideIndex)}
              />
            </>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as {
    tagName?: string
    isContentEditable?: boolean
    closest?: (selector: string) => unknown
  }
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return el.closest?.('[contenteditable="true"]') != null
}
