import type { components } from '@/api/schema'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AvOutlinePanel } from '@/components/player/av/AvOutlinePanel'
import { AvSectionShortcuts } from '@/components/player/av/AvSectionShortcuts'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import { AvSlidesPanel } from '@/components/player/av/AvSlidesPanel'
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
  buildAvProjectionPayload,
  readAvPreferences,
  writeAvPreferences,
  type AvBackgroundPreset,
  type AvPreferences,
  type AvScreenState,
} from '@/lib/player/av-preferences'
import {
  createAvProjectionSync,
  getAvProjectionSessionId,
  type AvProjectionSync,
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
  const [languagePopoverOpen, setLanguagePopoverOpen] = useState(false)
  const resolveLanguageIndexForItem = useCallback(
    (itemIndex: number) => viewState.languageByItem?.[itemIndex],
    [viewState.languageByItem],
  )

  const sessionIdRef = useRef(getAvProjectionSessionId())
  const syncRef = useRef<AvProjectionSync | null>(null)
  const outputWindowRef = useRef<Window | null>(null)
  const skipProjectionBroadcastRef = useRef(true)

  const itemsLen = player.items.length
  const tocRow = tocEntryForIndex(player.toc, session.itemIndex)
  const title = avItemTitle(
    player.items,
    session.itemIndex,
    resourceTitle || tocRow?.title,
    resolveLanguageIndexForItem,
  )
  const showToc = player.toc.length > 0
  const evicted = useSetlistEvictionWatch(type === 'setlist' ? id : undefined, type === 'setlist')
  const navBlocked = evicted
  const backTo = hubPathForPlayerType(type)

  usePlayerIndexSearchSync(type, id, session.itemIndex, 'av')

  useEffect(() => {
    writePlayerViewState(type, id, viewState)
  }, [type, id, viewState])

  const collapseLyricWhitespace = readLyricCollapseWhitespacePreference()

  const currentPlayerItem = player.items[session.itemIndex]
  const projectedPlayerItem = player.items[projected.itemIndex]
  const resolvedCurrentSongData = useResolvedPlayerItemChordData(currentPlayerItem)
  const resolvedProjectedSongData = useResolvedPlayerItemChordData(projectedPlayerItem)

  const currentItem = useMemo(
    () =>
      avSlidesForPlayerItem(player.items, session.itemIndex, {
        maxLinesPerSlide: prefs.contentLayer.maxLinesPerSlide,
        balanceSlideLines: prefs.contentLayer.balanceSlideLines,
        collapseLyricWhitespace,
      }, resolveLanguageIndexForItem, bilingualEnabled, resolvedCurrentSongData),
    [
      player.items,
      prefs.contentLayer.maxLinesPerSlide,
      prefs.contentLayer.balanceSlideLines,
      collapseLyricWhitespace,
      resolveLanguageIndexForItem,
      session.itemIndex,
      bilingualEnabled,
      resolvedCurrentSongData,
    ],
  )

  const projectedItem = useMemo(
    () =>
      avSlidesForPlayerItem(player.items, projected.itemIndex, {
        maxLinesPerSlide: prefs.contentLayer.maxLinesPerSlide,
        balanceSlideLines: prefs.contentLayer.balanceSlideLines,
        collapseLyricWhitespace,
      }, resolveLanguageIndexForItem, bilingualEnabled, resolvedProjectedSongData),
    [
      player.items,
      prefs.contentLayer.maxLinesPerSlide,
      prefs.contentLayer.balanceSlideLines,
      collapseLyricWhitespace,
      resolveLanguageIndexForItem,
      projected.itemIndex,
      bilingualEnabled,
      resolvedProjectedSongData,
    ],
  )

  const projectedTocRow = tocEntryForIndex(player.toc, projected.itemIndex)
  const projectedTitle = avItemTitle(
    player.items,
    projected.itemIndex,
    resourceTitle || projectedTocRow?.title,
    resolveLanguageIndexForItem,
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
      buildAvSlideDeckEntries(
        currentItem.outline,
        currentItem.sourceSlides,
        currentItem.structuredSourceSlides,
      ),
    [currentItem.outline, currentItem.sourceSlides, currentItem.structuredSourceSlides],
  )
  const outlineRows = useMemo(
    () => buildAvOutlineRows(currentItem.outline, session.slideIndex),
    [currentItem.outline, session.slideIndex],
  )
  const selectedDeckSlideIndex = useMemo(
    () => avSlideDeckEntrySlideIndex(currentItem.outline, session.slideIndex),
    [currentItem.outline, session.slideIndex],
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
  const currentLanguageOptions =
    rawItem?.type === 'chords'
      ? songLanguageOptions(rawItem.song.data as Record<string, unknown>)
      : []
  const currentLanguageLabel =
    currentLanguageOptions[currentLanguageIndex ?? 0]?.label ??
    `L${(currentLanguageIndex ?? 0) + 1}`
  const showLanguageSelector = rawItem?.type === 'chords' && currentLanguageOptions.length > 1

  const navigateToSongEditor = useCallback(() => {
    const item = player.items[session.itemIndex]
    if (item?.type !== 'chords') return
    void navigate({
      to: '/songs/$songId',
      params: { songId: item.song.id },
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
    syncRef.current = createAvProjectionSync(sessionIdRef.current)
    return () => {
      syncRef.current?.close()
      syncRef.current = null
      outputWindowRef.current = null
    }
  }, [])

  const openOutputWindow = useCallback(() => {
    const existing = outputWindowRef.current
    if (existing && !existing.closed) {
      existing.focus()
      return
    }
    const url = `/player/output?s=${encodeURIComponent(sessionIdRef.current)}`
    const opened = window.open(url, 'wv-av-output', 'noopener,noreferrer')
    if (opened) {
      outputWindowRef.current = opened
    }
  }, [])

  useEffect(() => {
    if (skipProjectionBroadcastRef.current) {
      skipProjectionBroadcastRef.current = false
      return
    }
    const payload = buildAvProjectionPayload({
      contentText: projectedText,
      contentLines: projectedLines,
      contentLayer: prefs.contentLayer,
      backgroundLayer: prefs.backgroundLayer,
      transition: prefs.transition,
      screenState: projected.screenState,
      itemTitle: projectedTitle || t('player.untitled'),
      nextPreview: projectedNextText,
      prefersReducedMotion: reduceMotion ?? false,
    })
    syncRef.current?.broadcast(payload)
  }, [
    projectedText,
    projectedLines,
    projectedNextText,
    projected.screenState,
    projectedTitle,
    prefs,
    reduceMotion,
    t,
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
    [slideCount],
  )

  const goToItem = useCallback((itemIndex: number) => {
    setSession((state) => ({
      ...state,
      itemIndex,
      slideIndex: 0,
      screenState: 'live',
    }))
  }, [])

  const toggleBlank = useCallback(() => {
    setSession((state) => {
      const screenState = toggleBlankScreenState(state.screenState)
      setProjected((projectedState) => ({ ...projectedState, screenState }))
      return { ...state, screenState }
    })
  }, [])

  const toggleBlackout = useCallback(() => {
    setSession((state) => {
      const screenState = toggleBlackoutScreenState(state.screenState)
      setProjected((projectedState) => ({ ...projectedState, screenState }))
      return { ...state, screenState }
    })
  }, [])

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
        if (!navBlocked) goPrev()
        return
      }
      if (action === 'next') {
        e.preventDefault()
        if (!navBlocked) goNext()
        return
      }
      if (action === 'home') {
        e.preventDefault()
        if (!navBlocked) goToSlide(0)
        return
      }
      if (action === 'end') {
        e.preventDefault()
        if (!navBlocked) goToSlide(slideCount - 1)
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
    navBlocked,
    navigate,
    openOutputWindow,
    slideCount,
    toggleBlank,
    toggleBlackout,
    tocVisible,
    languagePopoverOpen,
  ])

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
          <Link to={backTo} aria-label={t(backAriaKeyForPlayerType(type))}>
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
            aria-label={t('player.av.openOutput')}
            aria-keyshortcuts={AV_OPEN_OUTPUT_SHORTCUT_KEY}
            onClick={() => openOutputWindow()}
          >
            <OutputIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
          </Button>
          <PlayerEditMenu
            playerType={type}
            canEditSong={rawItem?.type === 'chords'}
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

          <div className="player-av__slides min-h-0 flex-1 overflow-hidden">
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
          </div>
        </div>

        <aside className={cn('player-av__right shrink-0', PLAYER_TOC_WIDTH_CLASS)}>
          <div className="player-av__preview">
            <AvSlideView
              preview
              contentText={projectedLines ? undefined : projectedText}
              contentLines={projectedLines}
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
