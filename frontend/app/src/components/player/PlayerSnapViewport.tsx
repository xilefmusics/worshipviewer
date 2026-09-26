import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'

import { observeElementResize } from '@/lib/browser-apis'
import type { PlayerNavState } from '@/lib/player/next-player-state'

export type PlayerSnapHandle = {
  navigate: (target: PlayerNavState, smooth: boolean) => void
}

type Props = {
  ref: Ref<PlayerSnapHandle>
  pages: PlayerNavState[]
  nav: PlayerNavState
  disabled: boolean
  reduceMotion: boolean
  onNavigate: (nav: PlayerNavState) => void
  onScrollGesture: () => void
  renderPage: (nav: PlayerNavState) => ReactNode
}

/** Stable snap slots keep browser momentum independent of the mounted song renderers. */
export function PlayerSnapViewport({ ref, pages, nav, disabled, reduceMotion, onNavigate, onScrollGesture, renderPage }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchingRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const activeIndex = Math.max(0, pages.findIndex((page) => page.index === nav.index))
  const [visibleIndex, setVisibleIndex] = useState(activeIndex)
  const latest = useRef({ pages, nav, disabled, onNavigate, onScrollGesture, activeIndex })
  useLayoutEffect(() => {
    latest.current = { pages, nav, disabled, onNavigate, onScrollGesture, activeIndex }
  })

  const settle = useCallback(() => {
    const viewport = viewportRef.current
    if (timerRef.current != null) clearTimeout(timerRef.current)
    timerRef.current = null
    if (!viewport || viewport.clientWidth <= 0 || touchingRef.current) return
    const state = latest.current
    const index = Math.max(0, Math.min(state.pages.length - 1, Math.round(viewport.scrollLeft / viewport.clientWidth)))
    const page = state.pages[index]
    if (state.disabled || !page) {
      viewport.scrollLeft = state.activeIndex * viewport.clientWidth
      return
    }
    if (page.index !== state.nav.index || page.pageOffset !== state.nav.pageOffset) state.onNavigate(page)
  }, [])

  useImperativeHandle(ref, () => ({
    navigate(target, smooth) {
      const viewport = viewportRef.current
      const index = pages.findIndex((page) => page.index === target.index)
      if (!viewport || viewport.clientWidth <= 0 || index < 0) {
        onNavigate(target)
        return
      }
      viewport.scrollTo({ left: index * viewport.clientWidth, behavior: smooth && !reduceMotion ? 'smooth' : 'instant' })
      if (!smooth || reduceMotion) onNavigate(target)
    },
  }), [pages, onNavigate, reduceMotion])

  const pageKeys = pages.map((page) => `${page.index}:${page.pageOffset}`).join(',')
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollLeft = activeIndex * viewport.clientWidth
  }, [activeIndex, pageKeys, disabled])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.addEventListener('scrollend', settle)
    const stopObserving = observeElementResize(viewport, () => {
      viewport.scrollLeft = latest.current.activeIndex * viewport.clientWidth
    })
    return () => {
      stopObserving()
      viewport.removeEventListener('scrollend', settle)
      if (timerRef.current != null) clearTimeout(timerRef.current)
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [settle])

  return (
    <div
      ref={viewportRef}
      data-testid="player-snap-viewport"
      className="flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory overscroll-x-contain"
      style={{ overflowX: disabled ? 'hidden' : 'auto', touchAction: 'pan-x pan-y', scrollbarWidth: 'none' }}
      onTouchStart={() => { touchingRef.current = true }}
      onTouchEnd={() => {
        touchingRef.current = false
        if (timerRef.current != null) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(settle, 160)
      }}
      onTouchCancel={() => { touchingRef.current = false }}
      onScroll={(event) => {
        if (event.target !== event.currentTarget) return
        latest.current.onScrollGesture()
        const viewport = event.currentTarget
        if (frameRef.current == null) frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null
          if (viewport.clientWidth > 0) setVisibleIndex(Math.round(viewport.scrollLeft / viewport.clientWidth))
        })
        if (timerRef.current != null) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(settle, 160)
      }}
    >
      {pages.map((page, index) => (
        <div key={`${page.index}:${page.pageOffset}`} data-player-snap-index={page.index}
          aria-hidden={index !== activeIndex} inert={index !== activeIndex}
          className="relative flex h-full min-h-0 w-full shrink-0 snap-start flex-col overflow-hidden">
          {Math.abs(index - visibleIndex) <= 1 || Math.abs(index - activeIndex) <= 1 ? renderPage(page) : null}
        </div>
      ))}
    </div>
  )
}
