import type { components } from '@/api/schema'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { scopeChordlibPageCss } from '@/lib/chord-page-css'
import { getChordEngine } from '@/lib/chord-engine'
import { cssScaleToFitViewport } from '@/lib/chord-a4-scale'
import { chordFormatToRepresentation, type ChordFormatPreference } from '@/lib/chord-format'
import type { ChordSongData } from '@/ports/chord-engine'
import { cn } from '@/lib/utils'

import './player-chords.css'

type Song = components['schemas']['Song']
type Orientation = components['schemas']['Orientation']

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; html: string; css: string }
  | { status: 'error'; message: string }

type ChordsSlideProps = {
  song: Song
  displayKey?: string | null
  chordFormat: ChordFormatPreference
  orientation: Orientation
}

export function ChordsSlide({
  song,
  displayKey,
  chordFormat,
  orientation,
}: ChordsSlideProps) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 })
  const [renderState, setRenderState] = useState<RenderState>({ status: 'loading' })
  const [renderPass, setRenderPass] = useState(0)

  const songData = song.data as ChordSongData
  const representation = useMemo(() => chordFormatToRepresentation(chordFormat), [chordFormat])

  const cssScale = useMemo(
    () =>
      cssScaleToFitViewport(
        viewportSize.width,
        viewportSize.height,
        contentSize.width,
        contentSize.height,
      ),
    [contentSize.height, contentSize.width, viewportSize.height, viewportSize.width],
  )

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const updateSize = () => {
      const rect = el.getBoundingClientRect()
      setViewportSize({ width: rect.width, height: rect.height })
    }
    const observer = new ResizeObserver(() => updateSize())
    observer.observe(el)
    updateSize()
    return () => observer.disconnect()
  }, [])

  const retry = useCallback(() => {
    setRenderPass((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setRenderState({ status: 'loading' })
    setContentSize({ width: 0, height: 0 })
    void (async () => {
      try {
        const engine = await getChordEngine()
        const page = engine.renderA4Html(songData, {
          key: displayKey ?? undefined,
          scale: 1,
          representation,
        })
        if (cancelled) return
        setRenderState({ status: 'ready', html: page.html, css: page.css })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setRenderState({ status: 'error', message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [song.id, songData, displayKey, renderPass, representation])

  useLayoutEffect(() => {
    if (renderState.status !== 'ready') return
    const el = pageRef.current
    if (!el) return

    const measure = () => {
      const width = el.scrollWidth
      const height = el.scrollHeight
      if (width > 0 && height > 0) {
        setContentSize({ width, height })
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [renderState])

  const scaledReady = renderState.status === 'ready' && cssScale != null
  const measuring = renderState.status === 'ready' && cssScale == null
  const visibleHeight =
    scaledReady && cssScale != null ? contentSize.height * cssScale : undefined
  const visibleWidth =
    scaledReady && cssScale != null ? contentSize.width * cssScale : undefined

  return (
    <div
      ref={viewportRef}
      className={cn(
        'player-chords-viewport flex min-h-0 flex-1 flex-col overflow-auto',
        scaledReady && 'player-chords-viewport--ready',
        orientation === 'landscape' && 'player-chords-viewport--landscape',
      )}
    >
      {renderState.status === 'loading' || measuring ? (
        <p className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">{t('common.load')}</p>
      ) : null}

      {renderState.status === 'error' ? (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-sm text-[var(--color-danger)]" role="alert">
            {t('player.chordsRenderFailed')}
          </p>
          <p className="max-w-md text-xs text-[var(--color-muted-foreground)]">{renderState.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            {t('hub.error.retry')}
          </Button>
        </div>
      ) : null}

      {renderState.status === 'ready' ? (
        <>
          <style dangerouslySetInnerHTML={{ __html: scopeChordlibPageCss(renderState.css) }} />
          <div
            className={cn(
              'mx-auto shrink-0 overflow-hidden',
              measuring && 'pointer-events-none invisible absolute left-0 top-0',
            )}
            style={
              scaledReady
                ? {
                    width: visibleWidth,
                    height: visibleHeight,
                  }
                : undefined
            }
          >
            <div
              ref={pageRef}
              className={cn(
                'player-chords-page origin-top-left',
                orientation === 'landscape' && 'player-chords-page--landscape',
              )}
              style={
                scaledReady
                  ? {
                      transform: `scale(${cssScale})`,
                      width: contentSize.width,
                      height: contentSize.height,
                    }
                  : undefined
              }
              dangerouslySetInnerHTML={{ __html: renderState.html }}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
