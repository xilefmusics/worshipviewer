import type { components } from '@/api/schema'
import { Link, useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AvCurrentNext } from '@/components/player/av/AvCurrentNext'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import { PlayerTocSidebar } from '@/components/player/PlayerTocSidebar'
import { ChevronLeftIcon } from '@/components/icons/lucide-animated/chevron-left-icon'
import { SettingsIcon } from '@/components/icons/lucide-animated/settings-icon'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSetlistEvictionWatch } from '@/hooks/useSetlistEvictionWatch'
import {
  avFlatIndexForPosition,
  avItemTitle,
  avNextPosition,
  avPositionFromFlatIndex,
  avPrevPosition,
  avSlidesForPlayerItem,
  buildAvFlatSlides,
} from '@/lib/player/av-nav'
import {
  avKeyboardAction,
  avSectionJumpTitle,
} from '@/lib/player/av-keyboard'
import {
  buildAvLyricSlides,
  findAvSectionOutline,
} from '@/lib/player/av-lyric-slides'
import {
  buildAvProjectionPayload,
  readAvPreferences,
  type AvPreferences,
} from '@/lib/player/av-preferences'
import {
  createAvProjectionSessionId,
  createAvProjectionSync,
  type AvProjectionSync,
} from '@/lib/player/av-projection-sync'
import {
  readAvSessionState,
  writeAvSessionState,
  type AvSessionState,
} from '@/lib/player/av-session-state'
import { tocEntryForIndex } from '@/lib/player/player-helpers'
import { buildSongEditorReturnSearch } from '@/lib/player/player-editor-return'
import type { PlayerEntityType } from '@/lib/player-route'
import { buildSettingsSearch } from '@/lib/settings-route'

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

const PLAYER_CHROME_EASE = [0.25, 0.1, 0.25, 1] as const

export function PlayerAv({
  type,
  id,
  player,
  initialIndex,
  resourceTitle,
}: PlayerAvProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const isSmViewport = useMediaQuery('(min-width: 640px)')
  const tocInsetPx = isSmViewport ? 224 : 176
  const chromeTransition = reduceMotion ? { duration: 0 } : { duration: 0.22, ease: PLAYER_CHROME_EASE }

  const [prefs] = useState<AvPreferences>(() => readAvPreferences())
  const [session, setSession] = useState<AvSessionState>(() => {
    const saved = readAvSessionState(type, id)
    const startItem = initialIndex ?? saved.itemIndex ?? player.index
    return { ...saved, itemIndex: startItem }
  })
  const [chromeVisible, setChromeVisible] = useState(true)
  const [announcement, setAnnouncement] = useState('')

  const sessionIdRef = useRef(createAvProjectionSessionId())
  const syncRef = useRef<AvProjectionSync | null>(null)
  const outputWindowRef = useRef<Window | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const itemsLen = player.items.length
  const flatSlides = useMemo(
    () => buildAvFlatSlides(player.items, prefs.contentLayer.maxLinesPerSlide, player.toc),
    [player.items, player.toc, prefs.contentLayer.maxLinesPerSlide],
  )
  const flatIndex = avFlatIndexForPosition(flatSlides, session.itemIndex, session.slideIndex)
  const currentFlat = flatSlides[flatIndex]
  const nextFlat = flatSlides[flatIndex + 1]
  const tocRow = tocEntryForIndex(player.toc, session.itemIndex)
  const title = resourceTitle || tocRow?.title || avItemTitle(player.items, session.itemIndex, tocRow?.title)
  const showToc = player.toc.length > 0
  const evicted = useSetlistEvictionWatch(type === 'setlist' ? id : undefined, type === 'setlist')
  const navBlocked = evicted
  const backTo = hubPathForPlayerType(type)

  const currentText = useMemo(() => {
    if (session.blackout) return ''
    const { slides } = avSlidesForPlayerItem(
      player.items,
      session.itemIndex,
      prefs.contentLayer.maxLinesPerSlide,
    )
    return slides[session.slideIndex] ?? slides[0] ?? ''
  }, [player.items, prefs.contentLayer.maxLinesPerSlide, session.blackout, session.itemIndex, session.slideIndex])

  const playerReturnContext = useMemo(
    () => ({
      playerType: type,
      playerId: id,
      playerIndex: session.itemIndex,
      playerMode: 'av' as const,
    }),
    [type, id, session.itemIndex],
  )

  useEffect(() => {
    writeAvSessionState(type, id, session)
  }, [type, id, session])

  useEffect(() => {
    syncRef.current = createAvProjectionSync(sessionIdRef.current)
    return () => {
      syncRef.current?.close()
      syncRef.current = null
      outputWindowRef.current?.close()
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
    const payload = buildAvProjectionPayload({
      contentText: currentText,
      contentLayer: prefs.contentLayer,
      backgroundLayer: prefs.backgroundLayer,
      transition: prefs.transition,
      blackout: session.blackout,
      itemTitle: title || t('player.untitled'),
      nextPreview: nextFlat?.text ?? null,
      prefersReducedMotion: reduceMotion ?? false,
    })
    syncRef.current?.broadcast(payload)
  }, [currentText, nextFlat?.text, prefs, reduceMotion, session.blackout, t, title])

  useEffect(() => {
    const label = session.blackout
      ? t('player.av.blackoutOn')
      : t('player.av.slideAnnounce', {
          current: flatIndex + 1,
          total: flatSlides.length,
          title: title || t('player.untitled'),
        })
    setAnnouncement(label)
  }, [flatIndex, flatSlides.length, session.blackout, t, title])

  const goToPosition = useCallback(
    (itemIndex: number, slideIndex: number, clearBlackout = true) => {
      setSession((state) => ({
        itemIndex,
        slideIndex,
        blackout: clearBlackout ? false : state.blackout,
      }))
    },
    [],
  )

  const goPrev = useCallback(() => {
    const prev = avPrevPosition(flatSlides, session.itemIndex, session.slideIndex)
    if (prev) goToPosition(prev.itemIndex, prev.slideIndex)
  }, [flatSlides, goToPosition, session.itemIndex, session.slideIndex])

  const goNext = useCallback(() => {
    const next = avNextPosition(
      flatSlides,
      session.itemIndex,
      session.slideIndex,
      player.between_items,
    )
    if (next) goToPosition(next.itemIndex, next.slideIndex)
  }, [flatSlides, goToPosition, player.between_items, session.itemIndex, session.slideIndex])

  const goHome = useCallback(() => {
    const first = avPositionFromFlatIndex(flatSlides, 0)
    goToPosition(first.itemIndex, first.slideIndex)
  }, [flatSlides, goToPosition])

  const goEnd = useCallback(() => {
    const last = avPositionFromFlatIndex(flatSlides, flatSlides.length - 1)
    goToPosition(last.itemIndex, last.slideIndex)
  }, [flatSlides, goToPosition])

  const jumpToSection = useCallback(
    (sectionTitle: string) => {
      const item = player.items[session.itemIndex]
      if (!item || item.type !== 'chords') return
      const { outline } = buildAvLyricSlides(
        item.song.data.sections,
        prefs.contentLayer.maxLinesPerSlide,
      )
      const section = findAvSectionOutline(outline, sectionTitle)
      if (!section || !section.hasText) return
      goToPosition(session.itemIndex, section.textIdx)
    },
    [goToPosition, player.items, prefs.contentLayer.maxLinesPerSlide, session.itemIndex],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = avKeyboardAction(e.key, e.target)
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
        if (!navBlocked) goHome()
        return
      }
      if (action === 'end') {
        e.preventDefault()
        if (!navBlocked) goEnd()
        return
      }
      if (action === 'escape') {
        e.preventDefault()
        void navigate({ to: backTo })
        return
      }
      if (action === 'toggleToc') {
        e.preventDefault()
        setChromeVisible((visible) => !visible)
        return
      }
      if (action === 'blackoutOn') {
        e.preventDefault()
        setSession((state) => ({ ...state, blackout: true }))
        return
      }
      if (action === 'blackoutOff') {
        e.preventDefault()
        setSession((state) => ({ ...state, blackout: false }))
        return
      }
      if (action === 'toggleBlackout') {
        e.preventDefault()
        setSession((state) => ({ ...state, blackout: !state.blackout }))
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
  }, [backTo, goEnd, goHome, goNext, goPrev, jumpToSection, navBlocked, navigate])

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    const touch = e.changedTouches[0]
    if (!start || !touch || navBlocked) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) >= 48 && Math.abs(dx) >= Math.abs(dy) * 1.2) {
      if (dx > 0) goPrev()
      else goNext()
    }
  }

  if (itemsLen === 0 || !currentFlat) {
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
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-foreground)]">
      {evicted ? (
        <p className="player-av-warning" role="status" aria-live="polite">
          {t('player.evicted')}
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <AnimatePresence initial={false}>
        {chromeVisible ? (
          <motion.header
            key="player-av-header"
            className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 sm:px-3"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={chromeTransition}
          >
            <Button type="button" variant="outline" size="icon" asChild className="shrink-0">
              <Link to={backTo} aria-label={t(backAriaKeyForPlayerType(type))}>
                <ChevronLeftIcon className="text-[var(--color-foreground)]" size={20} />
              </Link>
            </Button>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-medium">{title || t('player.untitled')}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t('player.av.position', {
                  slide: flatIndex + 1,
                  slides: flatSlides.length,
                  item: session.itemIndex + 1,
                  items: itemsLen,
                })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 shrink-0"
                aria-label={t('player.av.openOutput')}
                onClick={() => openOutputWindow()}
              >
                {t('player.av.openOutput')}
              </Button>
              <Button
                type="button"
                variant={session.blackout ? 'default' : 'outline'}
                size="sm"
                className="min-h-11 min-w-11"
                aria-label={t('player.av.blackoutToggle')}
                aria-pressed={session.blackout}
                onClick={() => setSession((state) => ({ ...state, blackout: !state.blackout }))}
              >
                {t('player.av.blackout')}
              </Button>
              <Button type="button" variant="outline" size="icon" asChild className="min-h-11 min-w-11">
                <Link
                  to="/settings"
                  search={buildSettingsSearch('playerRoles', playerReturnContext)}
                  aria-label={t('player.av.openSettings')}
                >
                  <SettingsIcon size={18} className="text-[var(--color-foreground)]" />
                </Link>
              </Button>
            </div>
          </motion.header>
        ) : null}
      </AnimatePresence>

      <div className="relative flex min-h-0 flex-1">
        {chromeVisible && showToc ? (
          <div
            className="absolute inset-y-0 left-0 z-10"
            style={{ width: tocInsetPx }}
          >
            <PlayerTocSidebar
              toc={player.toc}
              currentIndex={session.itemIndex}
              onSelect={(idx) => goToPosition(idx, 0)}
            />
          </div>
        ) : null}

        <div
          className="relative flex min-h-0 flex-1 flex-col"
          style={{ paddingLeft: chromeVisible && showToc ? tocInsetPx : 0 }}
          role="main"
          aria-label={t('player.av.mainAria', { title: title || t('player.untitled') })}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={() => setChromeVisible((visible) => !visible)}
        >
          <div className="min-h-0 flex-1">
            <AvSlideView
              contentText={currentText}
              contentLayer={prefs.contentLayer}
              backgroundLayer={prefs.backgroundLayer}
              transition={prefs.transition}
              blackout={session.blackout}
            />
          </div>

          {chromeVisible ? (
            <div className="shrink-0 space-y-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <AvCurrentNext currentText={currentText} nextText={nextFlat?.text ?? null} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={navBlocked || flatIndex <= 0}
                  aria-keyshortcuts="ArrowLeft"
                  onClick={(e) => {
                    e.stopPropagation()
                    goPrev()
                  }}
                >
                  {t('player.prev')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={navBlocked || flatIndex >= flatSlides.length - 1}
                  aria-keyshortcuts="ArrowRight"
                  onClick={(e) => {
                    e.stopPropagation()
                    goNext()
                  }}
                >
                  {t('player.next')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
