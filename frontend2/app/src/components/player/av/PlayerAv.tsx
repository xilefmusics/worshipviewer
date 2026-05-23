import type { components } from '@/api/schema'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AvOutlinePanel } from '@/components/player/av/AvOutlinePanel'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import { AvSlidesPanel } from '@/components/player/av/AvSlidesPanel'
import { PlayerTocSidebar } from '@/components/player/PlayerTocSidebar'
import { ChevronLeftIcon } from '@/components/icons/lucide-animated/chevron-left-icon'
import { SettingsIcon } from '@/components/icons/lucide-animated/settings-icon'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSetlistEvictionWatch } from '@/hooks/useSetlistEvictionWatch'
import {
  avItemTitle,
  avNextItemIndex,
  avNextSlideInItem,
  avPrevItemIndex,
  avPrevSlideInItem,
  avSlidesForPlayerItem,
} from '@/lib/player/av-nav'
import {
  avKeyboardAction,
  avSectionJumpTitle,
} from '@/lib/player/av-keyboard'
import {
  avPresentationIndexForSectionTitle,
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
  const isSmViewport = useMediaQuery('(min-width: 640px)')
  const tocInsetPx = isSmViewport ? 224 : 176

  const [prefs, setPrefs] = useState<AvPreferences>(() => readAvPreferences())
  const [session, setSession] = useState<AvSessionState>(() => {
    const saved = readAvSessionState(type, id)
    const startItem = initialIndex ?? saved.itemIndex ?? player.index
    return { ...saved, itemIndex: startItem }
  })
  const [tocVisible, setTocVisible] = useState(true)
  const [announcement, setAnnouncement] = useState('')

  const sessionIdRef = useRef(createAvProjectionSessionId())
  const syncRef = useRef<AvProjectionSync | null>(null)
  const outputWindowRef = useRef<Window | null>(null)

  const itemsLen = player.items.length
  const tocRow = tocEntryForIndex(player.toc, session.itemIndex)
  const title = resourceTitle || tocRow?.title || avItemTitle(player.items, session.itemIndex, tocRow?.title)
  const showToc = player.toc.length > 0
  const evicted = useSetlistEvictionWatch(type === 'setlist' ? id : undefined, type === 'setlist')
  const navBlocked = evicted
  const backTo = hubPathForPlayerType(type)

  const collapseLyricWhitespace = readLyricCollapseWhitespacePreference()

  const currentItem = useMemo(
    () =>
      avSlidesForPlayerItem(player.items, session.itemIndex, {
        maxLinesPerSlide: prefs.contentLayer.maxLinesPerSlide,
        balanceSlideLines: prefs.contentLayer.balanceSlideLines,
        collapseLyricWhitespace,
      }),
    [
      player.items,
      prefs.contentLayer.maxLinesPerSlide,
      prefs.contentLayer.balanceSlideLines,
      collapseLyricWhitespace,
      session.itemIndex,
    ],
  )

  const slideCount = currentItem.slides.length
  const slideDeckEntries = useMemo(
    () => buildAvSlideDeckEntries(currentItem.outline, currentItem.sourceSlides),
    [currentItem.outline, currentItem.sourceSlides],
  )
  const outlineRows = useMemo(
    () => buildAvOutlineRows(currentItem.outline, session.slideIndex),
    [currentItem.outline, session.slideIndex],
  )

  const currentText = useMemo(() => {
    if (session.blackout) return ''
    return currentItem.slides[session.slideIndex] ?? currentItem.slides[0] ?? ''
  }, [currentItem.slides, session.blackout, session.slideIndex])

  const nextText = useMemo(() => {
    const nextIndex = avNextSlideInItem(slideCount, session.slideIndex)
    if (nextIndex == null) return null
    return currentItem.slides[nextIndex] ?? null
  }, [currentItem.slides, session.slideIndex, slideCount])

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
      nextPreview: nextText,
      prefersReducedMotion: reduceMotion ?? false,
    })
    syncRef.current?.broadcast(payload)
  }, [currentText, nextText, prefs, reduceMotion, session.blackout, t, title])

  useEffect(() => {
    const label = session.blackout
      ? t('player.av.blackoutOn')
      : t('player.av.slideAnnounce', {
          current: session.slideIndex + 1,
          total: slideCount,
          title: title || t('player.untitled'),
        })
    setAnnouncement(label)
  }, [session.blackout, session.slideIndex, slideCount, t, title])

  const setBackgroundPreset = useCallback((preset: AvBackgroundPreset) => {
    setPrefs((prev) => {
      const next = { ...prev, backgroundLayer: { preset } }
      writeAvPreferences(next)
      return next
    })
  }, [])

  const goToSlide = useCallback(
    (slideIndex: number, clearBlackout = true) => {
      const clamped = Math.max(0, Math.min(slideIndex, Math.max(slideCount - 1, 0)))
      setSession((state) => ({
        ...state,
        slideIndex: clamped,
        blackout: clearBlackout ? false : state.blackout,
      }))
    },
    [slideCount],
  )

  const goToItem = useCallback((itemIndex: number) => {
    setSession((state) => ({
      itemIndex,
      slideIndex: 0,
      blackout: false,
    }))
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
        void navigate({ to: backTo })
        return
      }
      if (action === 'toggleToc') {
        e.preventDefault()
        setTocVisible((visible) => !visible)
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
    slideCount,
    tocVisible,
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
        <Button type="button" variant="outline" size="icon" asChild className="shrink-0">
          <Link to={backTo} aria-label={t(backAriaKeyForPlayerType(type))}>
            <ChevronLeftIcon className="text-[var(--color-foreground)]" size={20} />
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
      </header>

      <div className="player-av__body relative flex min-h-0 flex-1">
        {tocVisible && showToc ? (
          <div className="player-av__toc absolute inset-y-0 left-0 z-10" style={{ width: tocInsetPx }}>
            <PlayerTocSidebar
              toc={player.toc}
              currentIndex={session.itemIndex}
              onSelect={(idx) => goToItem(idx)}
            />
          </div>
        ) : null}

        <div
          className="player-av__slides min-h-0 flex-1 overflow-hidden"
          style={{ paddingLeft: tocVisible && showToc ? tocInsetPx : 0 }}
        >
          <AvSlidesPanel
            entries={slideDeckEntries}
            currentSlideIndex={session.slideIndex}
            contentLayer={prefs.contentLayer}
            backgroundLayer={prefs.backgroundLayer}
            backgroundPreviewText={currentText}
            transition={prefs.transition}
            onSelectSlide={(slideIndex) => goToSlide(slideIndex)}
            onSelectBackgroundPreset={setBackgroundPreset}
          />
        </div>

        <aside className="player-av__right w-44 shrink-0 sm:w-56">
          <div className="player-av__preview">
            <AvSlideView
              contentText={currentText}
              contentLayer={prefs.contentLayer}
              backgroundLayer={prefs.backgroundLayer}
              transition={prefs.transition}
              blackout={session.blackout}
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
