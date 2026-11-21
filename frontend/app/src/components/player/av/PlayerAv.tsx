import type { components } from '@/api/schema'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { AvMediaTransportPanel } from '@/components/player/av/AvMediaTransportPanel'
import { AvTimerPanel, type AvTimerAudio } from '@/components/player/av/AvTimerPanel'
import { AvSpotifyPanel } from '@/components/player/av/AvSpotifyPanel'
import { AvOutlinePanel } from '@/components/player/av/AvOutlinePanel'
import { AvSectionShortcuts } from '@/components/player/av/AvSectionShortcuts'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import { AvSlidesPanel } from '@/components/player/av/AvSlidesPanel'
import type { AvForegroundSelectorSettings } from '@/components/player/av/AvForegroundSelector'
import { PlayerEditMenu } from '@/components/player/PlayerEditMenu'
import { PlayerTocSidebar } from '@/components/player/PlayerTocSidebar'
import { ChevronLeftIcon } from '@/components/icons/lucide-animated/chevron-left-icon'
import { OutputIcon } from '@/components/icons/lucide-animated/output-icon'
import { TimerIcon } from '@/components/icons/timer-icon'
import { SettingsIcon } from '@/components/icons/lucide-animated/settings-icon'
import { Button } from '@/components/ui/button'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePlayerIndexSearchSync } from '@/hooks/usePlayerIndexSearchSync'
import { useAvBilingualPreference } from '@/hooks/useAvBilingualPreference'
import { useResolvedPlayerItemChordData } from '@/lib/player/apply-song-flow'
import { readChordFormatPreference } from '@/lib/chord-format'
import { readHideChordsPreference } from '@/lib/hide-chords-preference'
import { writeAvBilingualPreference } from '@/lib/av-bilingual-preference'
import { isCopyWorshipProShortcut, isPrintPlayerPdfShortcut } from '@/lib/player/player-keyboard'
import { copyPlayerSongAsWorshipPro } from '@/lib/player/player-song-copy'
import { printPlayerSongPdf } from '@/lib/player/player-song-print'
import type { TocDisplayEntry } from '@/lib/player/toc-display'
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
  avSectionJumpShortcutForEvent,
} from '@/lib/player/av-keyboard'
import {
  avSlideDeckEntrySlideIndex,
  buildAvOutlineRows,
  buildAvSlideDeckEntries,
} from '@/lib/player/av-lyric-slides'
import { readLyricCollapseWhitespacePreference } from '@/lib/lyric-whitespace-preference'
import {
  roomRenderedSectionToSourceSlide,
  roomSourceSlideToRenderedSection,
} from '@/lib/room-slide-index'
import {
  DEFAULT_AV_PREFERENCES,
  readAvPreferences,
  writeAvPreferences,
  type AvBackgroundAsset,
  type AvBackgroundLayer,
  type AvBackgroundPreset,
  type AvContentLayer,
  type AvGeometryOverlay,
  type AvPreferences,
  type AvScreenState,
  type AvTransition,
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
import { formatAvTimerRemaining } from '@/lib/player/av-timer'
import {
  buildAvProjectionCommand,
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
import { tocEntryForIndex, tocSlotEntryForIndex } from '@/lib/player/player-helpers'
import { setlistBackgroundToAvBackground } from '@/lib/setlist-background'
import type { RoomAvConfiguration } from '@/lib/room-message-api'
import type { RoomDebugLog } from '@/lib/room-message-debug'
import type { PlayerEntityType } from '@/lib/player-route'
import { songLanguageOptions } from '@/lib/player/song-language'
import { buildSettingsSearch, type RoomSettingsReturnContext } from '@/lib/settings-route'
import { cn } from '@/lib/utils'
import type { ChordSongData } from '@/ports/chord-engine'

import './player-av.css'

type Player = components['schemas']['Player']
type AvTimerItem = {
  id: string
  audio: AvTimerAudio | null
  durationSeconds: number
  endsAtMs: number | null
}

type PlayerAvProps = {
  type: PlayerEntityType
  id: string
  player: Player
  initialIndex?: number
  allowNetworkFetch: boolean
  embedded?: boolean
  showEmbeddedToc?: boolean
  showEmbeddedRightPanel?: boolean
  slideOnly?: boolean
  backToOverride?: '/rooms' | '/media'
  roomSettingsReturn?: RoomSettingsReturnContext
  resourceTitle?: string
  deletedReconciled?: boolean
  allowLibraryActions?: boolean
  tocSidebar?: ReactNode
  renderTocRowSuffix?: (entry: TocDisplayEntry) => ReactNode
  roomQueueOrder?: readonly number[]
  roomMembers?: readonly { visit_id: string; display_name: string; joined_at?: string }[]
  roomOpenedAt?: string | null
  roomVisitId?: string
  roomDebugLog?: RoomDebugLog | null
  backAriaKeyOverride?: string
  sharedSelection?: { song: number; section: number; slide: number } | null
  onSharedSelectionChange?: (song: number, section: number, slide: number, activate: boolean) => void
  sharedBackgroundLayer?: AvBackgroundLayer | null
  onSharedBackgroundChange?: (background: AvBackgroundLayer) => boolean | void
  sharedAvConfiguration?: RoomAvConfiguration | null
  onSharedAvConfigurationChange?: (configuration: RoomAvConfiguration) => boolean | void
  roomConnectionStatus?: string
}

function toRoomAvConfiguration(
  contentLayer: AvContentLayer,
  transition: AvTransition,
  bilingualEnabled: boolean,
  collapseLyricWhitespace: boolean,
  languageByItem: Record<number, number> | undefined,
  screenState: AvScreenState,
  geometryOverlay: AvGeometryOverlay,
  geometryOverlayRotatedBackground: boolean,
  geometryOverlayOpacity: number,
  geometryOverlayColor: number,
  geometryOverlaySize: number,
  geometryOverlayThickness: number,
): RoomAvConfiguration {
  return {
    content_layer: {
      max_lines_per_slide: contentLayer.maxLinesPerSlide,
      balance_slide_lines: contentLayer.balanceSlideLines,
      font_size: contentLayer.fontSize,
      font_family: contentLayer.fontFamily ?? 'rubik',
      text_align: contentLayer.textAlign,
      vertical_align: contentLayer.verticalAlign,
      horizontal_align: contentLayer.horizontalAlign,
      text_shadow: contentLayer.textShadow,
      text_transform: contentLayer.textTransform,
      primary_text_lightness: contentLayer.primaryTextLightness,
      secondary_text_lightness: contentLayer.secondaryTextLightness,
    },
    transition: { style: transition.style, duration_ms: transition.durationMs },
    bilingual_enabled: bilingualEnabled,
    collapse_lyric_whitespace: collapseLyricWhitespace,
    language_by_item: Object.fromEntries(Object.entries(languageByItem ?? {})),
    screen_state: screenState,
    geometry_overlay: geometryOverlay,
    geometry_overlay_rotated_background: geometryOverlayRotatedBackground,
    geometry_overlay_opacity: geometryOverlayOpacity,
    geometry_overlay_color: geometryOverlayColor,
    geometry_overlay_size: geometryOverlaySize,
    geometry_overlay_thickness: geometryOverlayThickness,
  }
}

function contentLayerFromRoom(configuration: RoomAvConfiguration): AvContentLayer {
  const content = configuration.content_layer
  return {
    maxLinesPerSlide: content.max_lines_per_slide,
    balanceSlideLines: content.balance_slide_lines,
    fontSize: content.font_size,
    fontFamily: content.font_family ?? 'rubik',
    textAlign: content.text_align,
    verticalAlign: content.vertical_align,
    horizontalAlign: content.horizontal_align,
    textShadow: content.text_shadow,
    textTransform: content.text_transform,
    primaryTextLightness: content.primary_text_lightness,
    secondaryTextLightness: content.secondary_text_lightness,
  }
}

function transitionFromRoom(configuration: RoomAvConfiguration): AvTransition {
  return { style: configuration.transition.style, durationMs: configuration.transition.duration_ms }
}

function hubPathForPlayerType(type: PlayerEntityType): '/collections' | '/songs' | '/setlists' {
  switch (type) {
    case 'collection':
      return '/collections'
    case 'song':
      return '/songs'
    case 'library':
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
    case 'library':
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
  embedded = false,
  showEmbeddedToc = false,
  showEmbeddedRightPanel = false,
  slideOnly = false,
  backToOverride,
  roomSettingsReturn,
  resourceTitle,
  allowLibraryActions = true,
  tocSidebar,
  renderTocRowSuffix,
  roomQueueOrder,
  roomMembers,
  roomOpenedAt,
  roomVisitId,
  roomDebugLog,
  backAriaKeyOverride,
  sharedSelection,
  onSharedSelectionChange,
  sharedBackgroundLayer,
  onSharedBackgroundChange,
  sharedAvConfiguration,
  onSharedAvConfigurationChange,
  roomConnectionStatus,
}: PlayerAvProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const bilingualEnabled = useAvBilingualPreference()
  const [prefs, setPrefs] = useState<AvPreferences>(() => readAvPreferences())
  const pendingRoomBackgroundRef = useRef<{
    playerId: string
    background: AvBackgroundLayer
  } | null>(null)
  const playerBackgroundLayer = sharedBackgroundLayer ?? prefs.backgroundLayer
  const [viewState, setViewState] = useState<PlayerViewState>(() => readPlayerViewState(type, id))
  const [session, setSession] = useState<AvSessionState>(() => {
    const saved = readAvSessionState(type, id)
    const startItem = initialIndex ?? saved.itemIndex ?? player.index
    const startSlide = initialIndex != null ? 0 : saved.slideIndex
    return { ...saved, itemIndex: startItem, slideIndex: startSlide }
  })
  const [timerItems, setTimerItems] = useState<AvTimerItem[]>([])
  const [selectedTimerId, setSelectedTimerId] = useState<string | null>(null)
  const [timerNow, setTimerNow] = useState(() => Date.now())
  const timerIdRef = useRef<string | null>(null)
  const selectedTimer = timerItems.find((timer) => timer.id === selectedTimerId) ?? null
  const runningTimer = timerItems.find((timer) => timer.endsAtMs != null && timer.endsAtMs > timerNow) ?? null
  const timerForPanel = selectedTimer ?? runningTimer
  const selectedTimerTitle = selectedTimer
    ? t('player.av.timerTitle')
    : null
  const selectedTimerRemainingMs = selectedTimer
    ? selectedTimer.endsAtMs == null
      ? selectedTimer.durationSeconds * 1000
      : Math.max(0, selectedTimer.endsAtMs - timerNow)
    : null
  const selectedTimerFormattedRemaining = selectedTimerRemainingMs == null
    ? ''
    : formatAvTimerRemaining(selectedTimerRemainingMs)
  /** What the output window shows — lags behind `session` until the user navigates slides. */
  const [projected, setProjected] = useState<AvSessionState>(() => {
    const saved = readAvSessionState(type, id)
    const startItem = initialIndex ?? saved.itemIndex ?? player.index
    const startSlide = initialIndex != null ? 0 : saved.slideIndex
    return { ...saved, itemIndex: startItem, slideIndex: startSlide }
  })
  const tocVisible = !embedded || showEmbeddedToc
  const [languagePopoverOpen, setLanguagePopoverOpen] = useState(false)
  const languageByItem = useMemo(
    () => slideOnly ? sharedAvConfiguration?.language_by_item ?? {} : viewState.languageByItem,
    [sharedAvConfiguration?.language_by_item, slideOnly, viewState.languageByItem],
  )
  const resolveLanguageIndexForItem = useCallback(
    (itemIndex: number) => languageByItem?.[itemIndex],
    [languageByItem],
  )

  const sessionId = getAvProjectionSessionId()
  const syncRef = useRef<AvProjectionChannel | null>(null)
  const skipProjectionBroadcastRef = useRef(true)
  const lastProjectionBroadcastRef = useRef<string | null>(null)
  const timerProjectionWasActiveRef = useRef(false)
  const controllerRef = useRef<AvControllerProjectionState>(INITIAL_CONTROLLER_PROJECTION_STATE)
  const [outputRegistry, setOutputRegistry] = useState<AvControllerProjectionState>(
    INITIAL_CONTROLLER_PROJECTION_STATE,
  )
  const [missingOutputWarning, setMissingOutputWarning] = useState(false)
  const [missingOutputReason, setMissingOutputReason] = useState<'play' | 'show'>('play')
  const [livePlayback, setLivePlayback] = useState<AvProjectionPlaybackIntent | null>(null)
  const [controllerVolume, setControllerVolume] = useState(DEFAULT_AV_PLAYBACK_VOLUME)
  const [controllerMuted, setControllerMuted] = useState(DEFAULT_AV_PLAYBACK_MUTED)
  const [controllerLoop, setControllerLoop] = useState(DEFAULT_AV_PLAYBACK_LOOP)
  const videoPreviewRef = useRef<HTMLVideoElement>(null)
  const [videoPreviewProgress, setVideoPreviewProgress] = useState<{
    mediaId: string
    assetId: string
    currentTimeMs: number
    durationMs: number
  } | null>(null)

  const itemsLen = player.items.length
  const tocRow = tocEntryForIndex(player.toc, session.itemIndex)
  const title = avItemTitle(
    player.items,
    session.itemIndex,
    resourceTitle || tocRow?.title,
    resolveLanguageIndexForItem,
  )
  const headerTitle = selectedTimerTitle ?? title
  const showToc = tocVisible && (tocSidebar != null || player.toc.length > 0 || timerItems.length > 0)
  const backTo = backToOverride ?? hubPathForPlayerType(type)

  useEffect(() => {
    const endsAtMs = runningTimer?.endsAtMs
    if (endsAtMs == null) return
    const interval = window.setInterval(() => {
      const now = Date.now()
      setTimerNow(now)
      if (now >= endsAtMs) window.clearInterval(interval)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [runningTimer?.endsAtMs])

  const addTimerItem = useCallback(() => {
    const now = Date.now()
    if (timerIdRef.current != null) {
      setSelectedTimerId(timerIdRef.current)
      setTimerNow(now)
      return
    }
    const timer: AvTimerItem = {
      id: `timer-${now}`,
      audio: null,
      durationSeconds: 5 * 60,
      endsAtMs: null,
    }
    timerIdRef.current = timer.id
    setTimerItems([timer])
    setSelectedTimerId(timer.id)
    setTimerNow(now)
  }, [])

  const selectTimerItem = useCallback((timerId: string) => {
    const now = Date.now()
    setTimerItems((items) => items.map((item) => item.id !== timerId && item.endsAtMs != null && item.endsAtMs > now
      ? { ...item, endsAtMs: null }
      : item))
    setSelectedTimerId(timerId)
    setTimerNow(now)
  }, [])

  const updateSelectedTimer = useCallback((updates: Partial<Pick<AvTimerItem, 'audio' | 'durationSeconds' | 'endsAtMs'>>) => {
    if (selectedTimerId == null) return
    setTimerItems((items) => items.map((item) => item.id === selectedTimerId ? { ...item, ...updates } : item))
  }, [selectedTimerId])

  const startSelectedTimer = useCallback(() => {
    if (!selectedTimer) return
    const now = Date.now()
    setTimerNow(now)
    updateSelectedTimer({ endsAtMs: now + selectedTimer.durationSeconds * 1000 })
    setLivePlayback(null)
    setSession((state) => ({ ...state, screenState: 'live' }))
    setProjected((state) => ({ ...state, screenState: 'live' }))
  }, [selectedTimer, setLivePlayback, updateSelectedTimer])

  const stopSelectedTimer = useCallback(() => {
    updateSelectedTimer({ endsAtMs: null })
    setLivePlayback(null)
  }, [setLivePlayback, updateSelectedTimer])

  const deleteSelectedTimer = useCallback(() => {
    if (selectedTimerId == null) return
    setTimerItems((items) => items.filter((item) => item.id !== selectedTimerId))
    setSelectedTimerId(null)
    timerIdRef.current = null
    setTimerNow(Date.now())
    setLivePlayback(null)
  }, [selectedTimerId, setLivePlayback])

  usePlayerIndexSearchSync(type, id, session.itemIndex, 'av')

  useEffect(() => {
    if (slideOnly) return
    writePlayerViewState(type, id, viewState)
  }, [id, slideOnly, type, viewState])

  const collapseLyricWhitespace = readLyricCollapseWhitespacePreference()
  const effectiveContentLayer = slideOnly
    ? sharedAvConfiguration ? contentLayerFromRoom(sharedAvConfiguration) : DEFAULT_AV_PREFERENCES.contentLayer
    : prefs.contentLayer
  const effectiveTransition = slideOnly
    ? sharedAvConfiguration ? transitionFromRoom(sharedAvConfiguration) : DEFAULT_AV_PREFERENCES.transition
    : prefs.transition
  const effectiveGeometryOverlay = slideOnly
    ? sharedAvConfiguration?.geometry_overlay ?? DEFAULT_AV_PREFERENCES.geometryOverlay
    : prefs.geometryOverlay
  const effectiveGeometryOverlayRotatedBackground = slideOnly
    ? sharedAvConfiguration?.geometry_overlay_rotated_background ??
      sharedAvConfiguration?.geometry_overlay_rotated_video ?? false
    : prefs.geometryOverlayRotatedBackground
  const sharedGeometryOverlayOpacity = sharedAvConfiguration
    ? sharedAvConfiguration.geometry_overlay_opacity ??
      (sharedAvConfiguration.geometry_overlay_transparency != null
        ? 100 - sharedAvConfiguration.geometry_overlay_transparency
        : sharedAvConfiguration.geometry_overlay_grayscale === true ? 100 : 70)
    : DEFAULT_AV_PREFERENCES.geometryOverlayOpacity
  const sharedGeometryOverlayColor = sharedAvConfiguration
    ? sharedAvConfiguration.geometry_overlay_color ??
      (sharedAvConfiguration.geometry_overlay_grayscale === true ? 0 : 100)
    : DEFAULT_AV_PREFERENCES.geometryOverlayColor
  const sharedGeometryOverlaySize = sharedAvConfiguration?.geometry_overlay_size ??
    DEFAULT_AV_PREFERENCES.geometryOverlaySize
  const sharedGeometryOverlayThickness = sharedAvConfiguration?.geometry_overlay_thickness ??
    DEFAULT_AV_PREFERENCES.geometryOverlayThickness
  const effectiveGeometryOverlayOpacity = slideOnly
    ? sharedGeometryOverlayOpacity
    : prefs.geometryOverlayOpacity
  const effectiveGeometryOverlayColor = slideOnly
    ? sharedGeometryOverlayColor
    : prefs.geometryOverlayColor
  const effectiveGeometryOverlaySize = slideOnly
    ? sharedGeometryOverlaySize
    : prefs.geometryOverlaySize
  const effectiveGeometryOverlayThickness = slideOnly
    ? sharedGeometryOverlayThickness
    : prefs.geometryOverlayThickness
  const effectiveBilingualEnabled = slideOnly
    ? sharedAvConfiguration?.bilingual_enabled ?? false
    : bilingualEnabled
  const effectiveCollapseWhitespace = slideOnly
    ? sharedAvConfiguration?.collapse_lyric_whitespace ?? true
    : collapseLyricWhitespace
  const sharedScreenState = sharedAvConfiguration?.screen_state
  const effectiveScreenState: AvScreenState = slideOnly
    ? sharedScreenState === 'blackout'
      ? 'blackout'
      : sharedSelection && sharedScreenState === 'live'
        ? 'live'
        : 'blank'
    : projected.screenState
  const currentRoomAvConfiguration = useMemo(
    () => toRoomAvConfiguration(
      prefs.contentLayer,
      prefs.transition,
      bilingualEnabled,
      collapseLyricWhitespace,
      viewState.languageByItem,
      projected.screenState,
      prefs.geometryOverlay,
      prefs.geometryOverlayRotatedBackground,
      prefs.geometryOverlayOpacity,
      prefs.geometryOverlayColor,
      prefs.geometryOverlaySize,
      prefs.geometryOverlayThickness,
    ),
    [
      bilingualEnabled,
      collapseLyricWhitespace,
      prefs.contentLayer,
      prefs.geometryOverlay,
      prefs.geometryOverlayRotatedBackground,
      prefs.geometryOverlayOpacity,
      prefs.geometryOverlayColor,
      prefs.geometryOverlaySize,
      prefs.geometryOverlayThickness,
      prefs.transition,
      projected.screenState,
      viewState.languageByItem,
    ],
  )
  const lastPublishedRoomConfigurationRef = useRef<string | null>(null)
  useEffect(() => {
    if (slideOnly || !onSharedAvConfigurationChange) return
    if (roomConnectionStatus !== 'connected') {
      lastPublishedRoomConfigurationRef.current = null
      return
    }
    const serialized = JSON.stringify(currentRoomAvConfiguration)
    if (lastPublishedRoomConfigurationRef.current === serialized) return
    if (onSharedAvConfigurationChange(currentRoomAvConfiguration) !== false) {
      lastPublishedRoomConfigurationRef.current = serialized
    }
  }, [currentRoomAvConfiguration, onSharedAvConfigurationChange, roomConnectionStatus, slideOnly])

  const publishRoomBackground = useCallback((background: AvBackgroundLayer) => {
    if (!onSharedBackgroundChange) return
    if (onSharedBackgroundChange(background) === false) {
      pendingRoomBackgroundRef.current = { playerId: id, background }
    } else {
      pendingRoomBackgroundRef.current = null
    }
  }, [id, onSharedBackgroundChange])

  useEffect(() => {
    if (
      slideOnly ||
      !onSharedBackgroundChange ||
      (roomConnectionStatus != null && roomConnectionStatus !== 'connected')
    ) return

    const pending = pendingRoomBackgroundRef.current
    if (pending) {
      if (pending.playerId !== id) {
        pendingRoomBackgroundRef.current = null
      } else {
        publishRoomBackground(pending.background)
        return
      }
    }

    if (!sharedBackgroundLayer) publishRoomBackground(prefs.backgroundLayer)
  }, [
    id,
    onSharedBackgroundChange,
    prefs.backgroundLayer,
    publishRoomBackground,
    roomConnectionStatus,
    sharedBackgroundLayer,
    slideOnly,
  ])

  const currentPlayerItem = player.items[session.itemIndex]
  const projectedPlayerItem = player.items[projected.itemIndex]
  const projectedTocRow = tocEntryForIndex(player.toc, projected.itemIndex)
  const currentBackgroundOverride = tocSlotEntryForIndex(player.toc, session.itemIndex)?.background
  const projectedBackgroundOverride = tocSlotEntryForIndex(player.toc, projected.itemIndex)?.background
  const projectedTimer = selectedTimer?.endsAtMs != null ? selectedTimer : runningTimer
  const projectedTimerTitle = projectedTimer
    ? t('player.av.timerTitle')
    : null
  const timerProjection = useMemo(
    () => projectedTimer?.endsAtMs != null
      ? { type: 'timer' as const, endsAtMs: projectedTimer.endsAtMs }
      : null,
    [projectedTimer],
  )
  const backgroundLayer = selectedTimer
    ? playerBackgroundLayer
    : currentBackgroundOverride
    ? setlistBackgroundToAvBackground(currentBackgroundOverride)
    : playerBackgroundLayer
  const fallbackBackgroundLayer = !selectedTimer && currentBackgroundOverride ? playerBackgroundLayer : undefined
  const projectedBackgroundLayer = timerProjection
    ? playerBackgroundLayer
    : projectedBackgroundOverride
    ? setlistBackgroundToAvBackground(projectedBackgroundOverride)
    : playerBackgroundLayer
  const projectedFallbackBackgroundLayer = !timerProjection && projectedBackgroundOverride
    ? playerBackgroundLayer
    : undefined
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
        maxLinesPerSlide: effectiveContentLayer.maxLinesPerSlide,
        balanceSlideLines: effectiveContentLayer.balanceSlideLines,
        collapseLyricWhitespace: effectiveCollapseWhitespace,
      }, resolveLanguageIndexForItem, effectiveBilingualEnabled, resolvedCurrentSongData, title),
    [
      player.items,
      effectiveContentLayer.maxLinesPerSlide,
      effectiveContentLayer.balanceSlideLines,
      effectiveCollapseWhitespace,
      resolveLanguageIndexForItem,
      session.itemIndex,
      effectiveBilingualEnabled,
      resolvedCurrentSongData,
      title,
    ],
  )

  const projectedItem = useMemo(
    () =>
      avSlidesForPlayerItem(player.items, projected.itemIndex, {
        maxLinesPerSlide: effectiveContentLayer.maxLinesPerSlide,
        balanceSlideLines: effectiveContentLayer.balanceSlideLines,
        collapseLyricWhitespace: effectiveCollapseWhitespace,
      }, resolveLanguageIndexForItem, effectiveBilingualEnabled, resolvedProjectedSongData, projectedTitle),
    [
      player.items,
      effectiveContentLayer.maxLinesPerSlide,
      effectiveContentLayer.balanceSlideLines,
      effectiveCollapseWhitespace,
      resolveLanguageIndexForItem,
      projected.itemIndex,
      effectiveBilingualEnabled,
      resolvedProjectedSongData,
      projectedTitle,
    ],
  )

  const controllerVideoPreviewProgress =
    currentItem.kind === 'video' &&
    projectedItem.kind === 'video' &&
    currentItem.mediaId === projectedItem.mediaId &&
    currentItem.assetId === projectedItem.assetId &&
    videoPreviewProgress != null &&
    videoPreviewProgress.mediaId === projectedItem.mediaId &&
    videoPreviewProgress.assetId === projectedItem.assetId
      ? videoPreviewProgress
      : null

  const slideCount = currentItem.slides.length

  useEffect(() => {
    if (!sharedSelection) return
    const targetItem = player.items[sharedSelection.song]
    if (!targetItem || targetItem.type !== 'chords') return
    if (session.itemIndex !== sharedSelection.song) {
      queueMicrotask(() => {
        setSession((state) => ({ ...state, itemIndex: sharedSelection.song, slideIndex: 0, screenState: 'live' }))
        setProjected((state) => ({ ...state, itemIndex: sharedSelection.song, slideIndex: 0, screenState: 'live' }))
      })
      return
    }
    const renderedSectionIndex = roomSourceSlideToRenderedSection(
      targetItem.song.data.sections,
      targetItem.flow,
      sharedSelection.section,
    )
    const selectedSection = renderedSectionIndex == null
      ? null
      : currentItem.outline[renderedSectionIndex] ?? null
    const sectionStart = selectedSection?.outlineIdx ?? 0
    const presentationSlide = sharedSelection.slide < currentItem.slides.length
      ? sharedSelection.slide
      : sectionStart
    if (presentationSlide == null) return
    queueMicrotask(() => {
      setSession((state) => state.slideIndex === presentationSlide && state.screenState === 'live'
        ? state
        : { ...state, slideIndex: presentationSlide, screenState: 'live' })
      setProjected((state) => state.slideIndex === presentationSlide && state.screenState === 'live'
        ? state
        : { ...state, slideIndex: presentationSlide, screenState: 'live' })
    })
  }, [currentItem.outline, currentItem.slides.length, player.items, session.itemIndex, sharedSelection])
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
  const currentLastSlide = Math.max(currentItem.slides.length - 1, 0)
  const projectedLastSlide = Math.max(projectedSlideCount - 1, 0)
  if (session.slideIndex > currentLastSlide) {
    setSession((state) => state.itemIndex === session.itemIndex && state.slideIndex > currentLastSlide
      ? { ...state, slideIndex: currentLastSlide }
      : state)
  }
  if (projected.slideIndex > projectedLastSlide) {
    setProjected((state) => state.itemIndex === projected.itemIndex && state.slideIndex > projectedLastSlide
      ? { ...state, slideIndex: projectedLastSlide }
      : state)
  }

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
  const nextLanguageOption = showLanguageSelector
    ? currentLanguageOptions[((currentLanguageIndex ?? 0) + 1) % currentLanguageOptions.length]
    : undefined
  const selectLanguageForCurrentItem = useCallback((languageIndex: number) => {
    setViewState((state) =>
      languageIndex === 0
        ? clearLanguageForItem(state, session.itemIndex)
        : setLanguageForItem(state, session.itemIndex, languageIndex),
    )
    setLanguagePopoverOpen(false)
  }, [session.itemIndex, setLanguagePopoverOpen])
  const selectNextLanguage = useCallback(() => {
    if (nextLanguageOption) selectLanguageForCurrentItem(nextLanguageOption.index)
  }, [nextLanguageOption, selectLanguageForCurrentItem])

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
    if (slideOnly) return
    writeAvSessionState(type, id, session)
  }, [id, session, slideOnly, type])

  useEffect(() => {
    if (slideOnly) return
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
  }, [sessionId, slideOnly])

  const openOutputWindow = useCallback(() => {
    const url = `/player/output?s=${encodeURIComponent(sessionId)}`
    window.open(url, newAvOutputWindowName(), 'noopener,noreferrer')
  }, [sessionId])

  const projectedContent = useMemo((): AvProjectionContent => {
    if (timerProjection) return timerProjection
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
    timerProjection,
  ])

  const projectedCommand = useMemo(
    (): AvProjectionCommand =>
      buildAvProjectionCommand({
        sessionId,
        commandId: 0,
        content: projectedContent,
        contentLayer: effectiveContentLayer,
        backgroundLayer: projectedBackgroundLayer,
        geometryOverlay: effectiveGeometryOverlay,
        geometryOverlayRotatedBackground: effectiveGeometryOverlayRotatedBackground,
        geometryOverlayOpacity: effectiveGeometryOverlayOpacity,
        geometryOverlayColor: effectiveGeometryOverlayColor,
        geometryOverlaySize: effectiveGeometryOverlaySize,
        geometryOverlayThickness: effectiveGeometryOverlayThickness,
        fallbackBackgroundLayer: projectedFallbackBackgroundLayer,
        transition: effectiveTransition,
        screenState: projected.screenState,
        itemTitle: timerProjection ? projectedTimerTitle ?? t('player.av.timer') : projectedTitle || t('player.untitled'),
        nextPreview: projectedNextText,
        prefersReducedMotion: reduceMotion ?? false,
        playback: !timerProjection && livePlayback && isTimedAvKind(projectedItem.kind) ? livePlayback : undefined,
      }),
    [
      livePlayback,
      projectedTimerTitle,
      timerProjection,
      projectedBackgroundLayer,
      projectedFallbackBackgroundLayer,
      effectiveContentLayer,
      effectiveGeometryOverlay,
      effectiveGeometryOverlayRotatedBackground,
      effectiveGeometryOverlayOpacity,
      effectiveGeometryOverlayColor,
      effectiveGeometryOverlaySize,
      effectiveGeometryOverlayThickness,
      effectiveTransition,
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
  const controllerPlayback = aggregateAvPlayback(outputRegistry)
  const videoPreviewPlaying =
    livePlayback != null &&
    projected.itemIndex === session.itemIndex &&
    projectedItem.kind === 'video' &&
    controllerPlayback.status === 'playing'
  const outputSummary = summarizeAvOutputs(outputRegistry)

  useEffect(() => {
    if (slideOnly) return
    if (skipProjectionBroadcastRef.current) {
      skipProjectionBroadcastRef.current = false
      return
    }
    const timerWasProjected = timerProjectionWasActiveRef.current
    timerProjectionWasActiveRef.current = timerProjection != null
    if (!timerProjection && !timerWasProjected && isTimedAvKind(projectedItem.kind) && !livePlayback) return
    const commandId = nextAvProjectionCommandId(controllerRef.current)
    const command: AvProjectionCommand = { ...projectedCommand, commandId }
    const serializedPayload = JSON.stringify({
      intent: command.intent,
      screenState: command.screenState,
      content: command.content,
      backgroundLayer: command.backgroundLayer,
      geometryOverlay: command.geometryOverlay,
      geometryOverlayRotatedBackground: command.geometryOverlayRotatedBackground ?? false,
      geometryOverlayOpacity: command.geometryOverlayOpacity ?? DEFAULT_AV_PREFERENCES.geometryOverlayOpacity,
      geometryOverlayColor: command.geometryOverlayColor ?? DEFAULT_AV_PREFERENCES.geometryOverlayColor,
      geometryOverlaySize: command.geometryOverlaySize ?? DEFAULT_AV_PREFERENCES.geometryOverlaySize,
      geometryOverlayThickness: command.geometryOverlayThickness ?? DEFAULT_AV_PREFERENCES.geometryOverlayThickness,
      fallbackBackgroundLayer: command.fallbackBackgroundLayer,
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
    syncRef.current?.send(command)

  }, [
    livePlayback,
    projectedCommand,
    projectedItem.kind,
    slideOnly,
    timerProjection,
  ])

  const setBackgroundPreset = useCallback((preset: AvBackgroundPreset) => {
    if (onSharedBackgroundChange) {
      publishRoomBackground({ preset })
      return
    }
    setPrefs((prev) => {
      const next = { ...prev, backgroundLayer: { preset } }
      writeAvPreferences(next)
      return next
    })
  }, [onSharedBackgroundChange, publishRoomBackground])

  const setContentLayer = useCallback((partial: Partial<AvContentLayer>) => {
    setPrefs((prev) => {
      const next = { ...prev, contentLayer: { ...prev.contentLayer, ...partial } }
      writeAvPreferences(next)
      return next
    })
  }, [])

  const setBilingualPreference = useCallback((enabled: boolean) => {
    writeAvBilingualPreference(enabled)
  }, [])

  const setBackgroundAsset = useCallback((asset: AvBackgroundAsset) => {
    const nextBackground: AvBackgroundLayer = asset.kind === 'image'
      ? { preset: playerBackgroundLayer.preset, image: { mediaId: asset.mediaId, assetId: asset.assetId } }
      : {
          preset: playerBackgroundLayer.preset,
          video: {
            mediaId: asset.mediaId,
            assetId: asset.assetId,
            ...(asset.thumbnailAssetId ? { thumbnailAssetId: asset.thumbnailAssetId } : {}),
          },
        }
    if (onSharedBackgroundChange) {
      publishRoomBackground(nextBackground)
      return
    }
    setPrefs((prev) => {
      const next = { ...prev, backgroundLayer: nextBackground }
      writeAvPreferences(next)
      return next
    })
  }, [onSharedBackgroundChange, playerBackgroundLayer.preset, publishRoomBackground])

  const setGeometryOverlay = useCallback((geometryOverlay: AvGeometryOverlay) => {
    setPrefs((prev) => {
      const next = { ...prev, geometryOverlay }
      writeAvPreferences(next)
      return next
    })
  }, [])

  const setGeometryOverlayOpacity = useCallback((geometryOverlayOpacity: number) => {
    setPrefs((prev) => {
      const next = { ...prev, geometryOverlayOpacity }
      writeAvPreferences(next)
      return next
    })
  }, [])

  const setGeometryOverlayColor = useCallback((geometryOverlayColor: number) => {
    setPrefs((prev) => {
      const next = { ...prev, geometryOverlayColor }
      writeAvPreferences(next)
      return next
    })
  }, [])

  const setGeometryOverlaySize = useCallback((geometryOverlaySize: number) => {
    setPrefs((prev) => {
      const next = { ...prev, geometryOverlaySize }
      writeAvPreferences(next)
      return next
    })
  }, [])

  const setGeometryOverlayThickness = useCallback((geometryOverlayThickness: number) => {
    setPrefs((prev) => {
      const next = { ...prev, geometryOverlayThickness }
      writeAvPreferences(next)
      return next
    })
  }, [])

  const setGeometryOverlayRotatedBackground = useCallback((geometryOverlayRotatedBackground: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, geometryOverlayRotatedBackground }
      writeAvPreferences(next)
      return next
    })
  }, [])

  const foregroundSettings: AvForegroundSelectorSettings = {
    contentLayer: prefs.contentLayer,
    bilingualEnabled,
    onContentLayerChange: setContentLayer,
    onBilingualChange: setBilingualPreference,
  }

  const goToSlide = useCallback(
    (slideIndex: number, clearScreenState = true) => {
      if (selectedTimerId != null) return
      const clampedSlide = Math.max(0, Math.min(slideIndex, Math.max(slideCount - 1, 0)))
      let sectionOffset = 0
      let renderedSectionIndex: number | null = null
      for (const [sectionIndex, section] of currentItem.outline.entries()) {
        if (clampedSlide >= sectionOffset && clampedSlide < sectionOffset + section.len) {
          renderedSectionIndex = sectionIndex
          break
        }
        sectionOffset += section.len
      }
      if (onSharedSelectionChange && currentPlayerItem?.type === 'chords') {
        const sourceSlide = renderedSectionIndex == null
          ? 0
          : roomRenderedSectionToSourceSlide(
              currentPlayerItem.song.data.sections,
              currentPlayerItem.flow,
              renderedSectionIndex,
            ) ?? 0
        onSharedSelectionChange(session.itemIndex, sourceSlide, clampedSlide, false)
      }
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
    [currentItem.kind, currentItem.outline, currentPlayerItem, onSharedSelectionChange, selectedTimerId, session.itemIndex, setLivePlayback, slideCount],
  )

  const goToItem = useCallback((itemIndex: number) => {
    const now = Date.now()
    setSelectedTimerId(null)
    setTimerNow(now)
    if (player.items[itemIndex]?.type === 'chords') onSharedSelectionChange?.(itemIndex, 0, 0, true)
    setSession((state) => ({
      ...state,
      itemIndex,
      slideIndex: 0,
      screenState: 'live',
    }))
  }, [onSharedSelectionChange, player.items])

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
  }, [setLivePlayback])

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
    const videoPreview = videoPreviewRef.current
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
        positionMs:
          currentItem.kind === 'video' &&
          videoPreview != null &&
          videoPreview.dataset.mediaId === currentItem.mediaId &&
          videoPreview.dataset.assetId === currentItem.assetId
            ? Math.round(videoPreview.currentTime * 1000)
            : undefined,
        issuedAtMs: Date.now(),
      }),
    )
  }, [
    controllerLoop,
    controllerMuted,
    controllerVolume,
    currentItem,
    setLivePlayback,
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
    [controllerLoop, controllerMuted, controllerVolume, livePlayback, setControllerLoop, setControllerMuted, setControllerVolume, setLivePlayback, startPlay],
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

  useEffect(() => {
    if (slideOnly) return
    function onKeyDown(e: KeyboardEvent) {
      if (isCopyWorshipProShortcut(e)) {
        if (rawItem?.type !== 'chords') return
        e.preventDefault()
        void copyPlayerSongAsWorshipPro(rawItem.song.data as ChordSongData, rawItem.flow, {
          languageIndex: currentLanguageIndex,
          chordFormat: readChordFormatPreference(),
          hideChords: readHideChordsPreference(),
        })
          .then(() => toast.success(t('player.copyWorshipProSuccess')))
          .catch(() => toast.error(t('player.copyWorshipProFailed')))
        return
      }

      if (isPrintPlayerPdfShortcut(e)) {
        if (rawItem?.type !== 'chords') return
        e.preventDefault()
        void printPlayerSongPdf(rawItem.song.data as ChordSongData, rawItem.flow, {
          languageIndex: currentLanguageIndex,
          chordFormat: readChordFormatPreference(),
          hideChords: readHideChordsPreference(),
        }).catch(() => toast.error(t('player.printFailed')))
        return
      }

      const action = avKeyboardAction(e, e.target, {
        tocOpen: tocVisible,
        languageShortcuts: showLanguageSelector,
      })
      if (!action && (e.key === 'n' || e.key === 'N')) {
        if (isEditableTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return
        e.preventDefault()
        if (e.key === 'n') goNextItem()
        else goPrevItem()
        return
      }

      if (!action) return

      if (action === 'prev') {
        e.preventDefault()
        goPrev()
        return
      }
      if (action === 'next') {
        e.preventDefault()
        if (isTimedAvKind(currentItem.kind) && (e.key === ' ' || e.key === 'Enter')) {
          toggleAvTransport()
          return
        }
        goNext()
        return
      }
      if (action === 'home') {
        e.preventDefault()
        goToSlide(0)
        return
      }
      if (action === 'end') {
        e.preventDefault()
        goToSlide(slideCount - 1)
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
      if (action === 'nextLanguage') {
        e.preventDefault()
        selectNextLanguage()
        return
      }
      if (action === 'toggleTranslation') {
        e.preventDefault()
        setBilingualPreference(!bilingualEnabled)
        return
      }
      if (action === 'openOutput') {
        e.preventDefault()
        openOutputWindow()
        return
      }
      if (action === 'jumpSection') {
        const sectionShortcut = avSectionJumpShortcutForEvent(
          e,
          currentItem.outline,
          showLanguageSelector,
        )
        if (sectionShortcut) {
          e.preventDefault()
          goToSlide(sectionShortcut.slideIndex)
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
    navigate,
    openOutputWindow,
    slideCount,
    toggleAvTransport,
    toggleBlank,
    toggleBlackout,
    tocVisible,
    languagePopoverOpen,
    bilingualEnabled,
    currentItem.kind,
    currentItem.outline,
    currentLanguageIndex,
    rawItem,
    selectNextLanguage,
    setBilingualPreference,
    showLanguageSelector,
    slideOnly,
    t,
  ])

  const outputSummaryLabel =
    outputSummary.total === 0
      ? t('player.av.outputSummaryNone')
      : outputSummary.failed > 0
        ? t('player.av.outputSummaryFailed', {
            ready: outputSummary.ready,
            failed: outputSummary.failed,
          })
        : t('player.av.outputSummary', { ready: outputSummary.ready })

  if (slideOnly) {
    return (
      <div
        className="av-output-page h-dvh w-dvw overflow-hidden bg-black"
        onDoubleClick={() => void document.documentElement.requestFullscreen?.()}
        aria-label={t('player.av.outputAria')}
      >
        <AvSlideView
          {...projectedSlideView}
          contentLayer={effectiveContentLayer}
          backgroundLayer={projectedBackgroundLayer}
          geometryOverlay={effectiveGeometryOverlay}
          geometryOverlayRotatedBackground={effectiveGeometryOverlayRotatedBackground}
          geometryOverlayOpacity={effectiveGeometryOverlayOpacity}
          geometryOverlayColor={effectiveGeometryOverlayColor}
          geometryOverlaySize={effectiveGeometryOverlaySize}
          geometryOverlayThickness={effectiveGeometryOverlayThickness}
          fallbackBackgroundLayer={projectedFallbackBackgroundLayer}
          transition={effectiveTransition}
          screenState={effectiveScreenState}
        />
      </div>
    )
  }

  if ((itemsLen === 0 || slideCount === 0) && !selectedTimer) {
    return (
      <div className="player-av relative flex h-dvh flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-foreground)]">
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
          <p className="min-w-0 flex-1 truncate text-center text-sm font-medium">{t('player.untitled')}</p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={playerHeaderIconButtonClass}
            aria-label={t('player.av.addTimer')}
            title={t('player.av.addTimer')}
            onClick={addTimerItem}
          >
            <TimerIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
          </Button>
        </header>
        <div className="mx-auto flex max-w-lg flex-1 flex-col justify-center gap-4 p-6">
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('player.empty')}</p>
          <Button type="button" variant="outline" asChild>
            <Link to={backTo}>{t('player.backToList')}</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="player-av relative flex h-dvh flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-foreground)]">
      {missingOutputWarning ? (
        <p className="player-av-warning" role="status" aria-live="polite">
          {t(
            missingOutputReason === 'show'
              ? 'player.av.missingOutputShow'
              : 'player.av.missingOutputPlay',
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
          <p className="truncate text-sm font-medium">{headerTitle || t('player.untitled')}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {selectedTimer
              ? selectedTimerFormattedRemaining
                ? t('player.av.timerPosition', { time: selectedTimerFormattedRemaining })
                : ''
              : t('player.av.position', {
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
                      onClick={() => selectLanguageForCurrentItem(option.index)}
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
          {tocVisible ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={playerHeaderIconButtonClass}
              aria-label={t('player.av.addTimer')}
              title={t('player.av.addTimer')}
              onClick={addTimerItem}
            >
              <TimerIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
            </Button>
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            asChild
            className={playerHeaderIconButtonClass}
          >
            <Link
              to="/settings"
              search={buildSettingsSearch(
                'playerRoles',
                roomSettingsReturn ? null : playerReturnContext,
                roomSettingsReturn,
              )}
              aria-label={t('player.av.openSettings')}
            >
              <SettingsIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
            </Link>
          </Button>
        </div>
      </header>

      <div className="player-av__body flex min-h-0 flex-1">
        {tocVisible && showToc ? (
          <div className={cn(
            'player-av__toc shrink-0',
            (tocSidebar || timerItems.length > 0) ? PLAYER_TOC_WIDTH_CLASS : undefined,
          )}>
            {tocSidebar ? (
              <div className="min-h-0 flex-1">{tocSidebar}</div>
            ) : (
              <PlayerTocSidebar
                toc={player.toc}
                items={player.items}
                currentSourceIdx={selectedTimerId == null ? session.itemIndex : -1}
                currentLanguageIndex={currentLanguageIndex}
                primaryTitleOnly={type === 'library'}
                onSelect={(idx, languageIndex) => {
                  if (languageIndex != null) {
                    setViewState((state) => setLanguageForItem(state, idx, languageIndex))
                  }
                  goToItem(idx)
                }}
                topRows={timerItems.length > 0 ? timerItems.map((timer) => {
                  const timerTitle = t('player.av.timerTitle')
                  const isSelected = selectedTimerId === timer.id
                  return (
                    <li key={timer.id}>
                      <button
                        type="button"
                        role="option"
                        className={cn('player-outline-list__item', isSelected && 'player-outline-list__item--selected')}
                        aria-current={isSelected ? 'true' : undefined}
                        aria-label={timerTitle}
                        onClick={() => selectTimerItem(timer.id)}
                      >
                        {timerTitle}
                      </button>
                    </li>
                  )
                }) : undefined}
                renderRowSuffix={renderTocRowSuffix}
                queueOrder={roomQueueOrder}
                members={roomMembers}
                roomOpenedAt={roomOpenedAt}
                currentVisitId={roomVisitId}
                protocolLog={roomDebugLog}
                className={timerItems.length > 0 ? 'min-h-0 flex-1 w-full' : undefined}
              />
            )}
          </div>
        ) : null}

        <div className="player-av__center min-h-0 min-w-0 flex flex-1 flex-col">
          {selectedTimer ? null : (
            <AvSectionShortcuts
              outline={currentItem.outline}
              screenState={session.screenState}
              onJump={goToSlide}
              onToggleBlank={toggleBlank}
              onToggleBlackout={toggleBlackout}
              nextLanguageLabel={nextLanguageOption?.label}
              onNextLanguage={showLanguageSelector ? selectNextLanguage : undefined}
              translationEnabled={bilingualEnabled}
              onToggleTranslation={showLanguageSelector
                ? () => setBilingualPreference(!bilingualEnabled)
                : undefined}
            />
          )}

          {/* Flow: I4, I5 */}
          <div className="player-av__slides min-h-0 flex-1 overflow-hidden">
            {timerForPanel ? (
              <div className={selectedTimer ? 'contents' : 'hidden'}>
                <AvTimerPanel
                  title={t('player.av.timerTitle')}
                  audio={timerForPanel.audio}
                  durationSeconds={timerForPanel.durationSeconds}
                  endsAtMs={timerForPanel.endsAtMs}
                  now={timerNow}
                  backgroundLayer={playerBackgroundLayer}
                  contentLayer={prefs.contentLayer}
                  foregroundSettings={foregroundSettings}
                  geometryOverlay={prefs.geometryOverlay}
                  geometryOverlayOpacity={prefs.geometryOverlayOpacity}
                  geometryOverlayColor={prefs.geometryOverlayColor}
                  geometryOverlaySize={prefs.geometryOverlaySize}
                  geometryOverlayThickness={prefs.geometryOverlayThickness}
                  geometryOverlayRotatedBackground={prefs.geometryOverlayRotatedBackground}
                  onAudioChange={(audio) => {
                    updateSelectedTimer({ audio, endsAtMs: null })
                    setLivePlayback(null)
                  }}
                  onDurationChange={(durationSeconds) => {
                    updateSelectedTimer({ durationSeconds, endsAtMs: null })
                    setLivePlayback(null)
                  }}
                  onStart={startSelectedTimer}
                  onStop={stopSelectedTimer}
                  onDelete={deleteSelectedTimer}
                  onSelectBackgroundPreset={setBackgroundPreset}
                  onSelectBackgroundAsset={setBackgroundAsset}
                  onSelectGeometryOverlay={setGeometryOverlay}
                  onSelectGeometryOverlayOpacity={setGeometryOverlayOpacity}
                  onSelectGeometryOverlayColor={setGeometryOverlayColor}
                  onSelectGeometryOverlaySize={setGeometryOverlaySize}
                  onSelectGeometryOverlayThickness={setGeometryOverlayThickness}
                  onSelectGeometryOverlayRotatedBackground={setGeometryOverlayRotatedBackground}
                />
              </div>
            ) : null}
            {selectedTimer ? null : currentItem.kind === 'spotify' &&
            currentItem.spotifyResourceType &&
            currentItem.canonicalUrl ? (
              <AvSpotifyPanel
                title={title || t('player.untitled')}
                resourceType={currentItem.spotifyResourceType}
                canonicalUrl={currentItem.canonicalUrl}
                backgroundLayer={backgroundLayer}
                backgroundPreviewText={currentText}
                contentLayer={prefs.contentLayer}
                foregroundSettings={foregroundSettings}
                geometryOverlay={prefs.geometryOverlay}
                geometryOverlayRotatedBackground={prefs.geometryOverlayRotatedBackground}
                geometryOverlayOpacity={prefs.geometryOverlayOpacity}
                geometryOverlayColor={prefs.geometryOverlayColor}
                geometryOverlaySize={prefs.geometryOverlaySize}
                geometryOverlayThickness={prefs.geometryOverlayThickness}
                onSelectBackgroundPreset={setBackgroundPreset}
                onSelectBackgroundAsset={setBackgroundAsset}
                onSelectGeometryOverlay={setGeometryOverlay}
                onSelectGeometryOverlayOpacity={setGeometryOverlayOpacity}
                onSelectGeometryOverlayColor={setGeometryOverlayColor}
                onSelectGeometryOverlaySize={setGeometryOverlaySize}
                onSelectGeometryOverlayThickness={setGeometryOverlayThickness}
                onSelectGeometryOverlayRotatedBackground={setGeometryOverlayRotatedBackground}
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
                playback={controllerPlayback}
                volume={controllerVolume}
                muted={controllerMuted}
                loop={controllerLoop}
                videoPreviewCurrentTimeMs={controllerVideoPreviewProgress?.currentTimeMs ?? 0}
                videoPreviewDurationMs={controllerVideoPreviewProgress?.durationMs ?? 0}
                backgroundLayer={backgroundLayer}
                backgroundPreviewText={currentText}
                contentLayer={prefs.contentLayer}
                foregroundSettings={foregroundSettings}
                geometryOverlay={prefs.geometryOverlay}
                geometryOverlayRotatedBackground={prefs.geometryOverlayRotatedBackground}
                geometryOverlayOpacity={prefs.geometryOverlayOpacity}
                geometryOverlayColor={prefs.geometryOverlayColor}
                geometryOverlaySize={prefs.geometryOverlaySize}
                geometryOverlayThickness={prefs.geometryOverlayThickness}
                onPlay={() => startPlay()}
                onPause={() => issuePlayback('pause')}
                onResume={() => issuePlayback('resume')}
                onSeek={(positionMs) => {
                  const videoPreview = videoPreviewRef.current
                  if (
                    videoPreview &&
                    videoPreview.dataset.mediaId === currentItem.mediaId &&
                    videoPreview.dataset.assetId === currentItem.assetId
                  ) {
                    videoPreview.currentTime = positionMs / 1000
                  }
                  if (
                    livePlayback &&
                    projected.itemIndex === session.itemIndex &&
                    isTimedAvKind(projectedItem.kind)
                  ) {
                    issuePlayback('seek', { positionMs })
                  }
                }}
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
                onSelectBackgroundAsset={setBackgroundAsset}
                onSelectGeometryOverlay={setGeometryOverlay}
                onSelectGeometryOverlayOpacity={setGeometryOverlayOpacity}
                onSelectGeometryOverlayColor={setGeometryOverlayColor}
                onSelectGeometryOverlaySize={setGeometryOverlaySize}
                onSelectGeometryOverlayThickness={setGeometryOverlayThickness}
                onSelectGeometryOverlayRotatedBackground={setGeometryOverlayRotatedBackground}
              />
            ) : (
              <AvSlidesPanel
                entries={slideDeckEntries}
                currentSlideIndex={selectedDeckSlideIndex}
                contentLayer={prefs.contentLayer}
                foregroundSettings={foregroundSettings}
                backgroundLayer={backgroundLayer}
                fallbackBackgroundLayer={fallbackBackgroundLayer}
                backgroundPreviewText={currentText}
                geometryOverlay={prefs.geometryOverlay}
                geometryOverlayRotatedBackground={prefs.geometryOverlayRotatedBackground}
                geometryOverlayOpacity={prefs.geometryOverlayOpacity}
                geometryOverlayColor={prefs.geometryOverlayColor}
                geometryOverlaySize={prefs.geometryOverlaySize}
                geometryOverlayThickness={prefs.geometryOverlayThickness}
                transition={prefs.transition}
                onSelectSlide={(slideIndex) => goToSlide(slideIndex)}
                onSelectBackgroundPreset={setBackgroundPreset}
                onSelectBackgroundAsset={setBackgroundAsset}
                onSelectGeometryOverlay={setGeometryOverlay}
                onSelectGeometryOverlayOpacity={setGeometryOverlayOpacity}
                onSelectGeometryOverlayColor={setGeometryOverlayColor}
                onSelectGeometryOverlaySize={setGeometryOverlaySize}
                onSelectGeometryOverlayThickness={setGeometryOverlayThickness}
                onSelectGeometryOverlayRotatedBackground={setGeometryOverlayRotatedBackground}
              />
            )}
          </div>
        </div>

        {(!embedded || showEmbeddedRightPanel) ? (
          <aside className={cn('player-av__right shrink-0', PLAYER_TOC_WIDTH_CLASS)}>
            <>
              <div className="player-av__preview">
                <AvSlideView
                  preview
                  contentText={projectedSlideView.contentText}
                  contentLines={projectedSlideView.contentLines}
                  deckPage={projectedSlideView.deckPage}
                  countdownEndsAtMs={projectedSlideView.countdownEndsAtMs}
                  timedPreview={
                    isTimedAvKind(projectedItem.kind)
                      ? {
                          kind: projectedItem.kind,
                          title: projectedTitle || t('player.untitled'),
                          ...(projectedItem.kind === 'video' && projectedItem.mediaId && projectedItem.assetId
                            ? {
                                video: {
                                  mediaId: projectedItem.mediaId,
                                  assetId: projectedItem.assetId,
                                  ...(projectedItem.thumbnailAssetId
                                    ? { thumbnailAssetId: projectedItem.thumbnailAssetId }
                                    : {}),
                                },
                              }
                            : {}),
                        }
                      : undefined
                  }
                  videoPreviewRef={videoPreviewRef}
                  videoPreviewPlaying={videoPreviewPlaying}
                  onVideoPreviewProgress={setVideoPreviewProgress}
                  contentLayer={prefs.contentLayer}
                  backgroundLayer={projectedBackgroundLayer}
                  geometryOverlay={prefs.geometryOverlay}
                  geometryOverlayRotatedBackground={prefs.geometryOverlayRotatedBackground}
                  geometryOverlayOpacity={prefs.geometryOverlayOpacity}
                  geometryOverlayColor={prefs.geometryOverlayColor}
                  geometryOverlaySize={prefs.geometryOverlaySize}
                  geometryOverlayThickness={prefs.geometryOverlayThickness}
                  fallbackBackgroundLayer={projectedFallbackBackgroundLayer}
                  transition={prefs.transition}
                  screenState={projected.screenState}
                />
              </div>

              <AvOutlinePanel
                rows={outlineRows}
                onSelectSlide={(slideIndex) => goToSlide(slideIndex)}
              />
            </>
          </aside>
        ) : null}
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
