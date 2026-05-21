import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useChordFormatPreference } from '@/hooks/useChordFormatPreference'
import { scopeChordlibPageCss } from '@/lib/chord-page-css'
import { cssScaleToViewportWidth } from '@/lib/chord-a4-scale'
import { chordFormatToRepresentation } from '@/lib/chord-format'
import { resolveSongDataKey } from '@/lib/setlist-song-links'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'
import { cn } from '@/lib/utils'

import '@/components/player/player-chords.css'

type RenderState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; html: string; css: string }
  | { status: 'error'; message: string }

type SongEditorPreviewProps = {
  engine: ChordEngine
  songData: ChordSongData | null
  parseError: string | null
  hideHeading?: boolean
  viewportClassName?: string
}

export function SongEditorPreview({
  engine,
  songData,
  parseError,
  hideHeading = false,
  viewportClassName,
}: SongEditorPreviewProps) {
  const { t } = useTranslation()
  const chordFormat = useChordFormatPreference()
  const chordRepresentation = useMemo(() => chordFormatToRepresentation(chordFormat), [chordFormat])
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 })
  const [renderState, setRenderState] = useState<RenderState>({ status: 'idle' })
  const [renderPass, setRenderPass] = useState(0)

  const displayKey = useMemo(
    () => (songData ? resolveSongDataKey(songData as Record<string, unknown>) : null),
    [songData],
  )

  const cssScale = useMemo(
    () => cssScaleToViewportWidth(viewportSize.width, contentSize.width),
    [contentSize.width, viewportSize.width],
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
    if (!songData || parseError) {
      setRenderState({ status: 'idle' })
      setContentSize({ width: 0, height: 0 })
      return
    }
    let cancelled = false
    setRenderState({ status: 'loading' })
    setContentSize({ width: 0, height: 0 })
    try {
      const page = engine.renderA4Html(songData, {
        key: displayKey ?? undefined,
        representation: chordRepresentation,
        scale: 1,
      })
      if (cancelled) return
      setRenderState({ status: 'ready', html: page.html, css: page.css })
    } catch (e) {
      if (cancelled) return
      const message = e instanceof Error ? e.message : String(e)
      setRenderState({ status: 'error', message })
    }
    return () => {
      cancelled = true
    }
  }, [engine, songData, displayKey, chordRepresentation, parseError, renderPass])

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hideHeading ? null : (
        <h2 className="m-0 mb-1.5 text-sm font-medium">{t('songs.editor.previewLabel')}</h2>
      )}
      <div
        ref={viewportRef}
        className={cn(
          'player-chords-viewport player-chords-viewport--editor relative -mx-3 flex min-h-0 w-[calc(100%+1.5rem)] flex-1 items-start justify-start overflow-x-hidden overflow-y-auto',
          scaledReady && 'player-chords-viewport--ready',
          viewportClassName,
        )}
      >
        {parseError ? (
          <p className="px-3 py-6 text-sm text-[var(--color-danger)]" role="alert">
            {t('songs.editor.previewBlocked')}
          </p>
        ) : null}

        {!parseError && (renderState.status === 'loading' || measuring) ? (
          <p className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">{t('common.load')}</p>
        ) : null}

        {!parseError && renderState.status === 'error' ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-[var(--color-danger)]" role="alert">
              {t('songs.editor.previewRenderFailed')}
            </p>
            <p className="max-w-md text-xs text-[var(--color-muted-foreground)]">{renderState.message}</p>
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t('hub.error.retry')}
            </Button>
          </div>
        ) : null}

        {!parseError && renderState.status === 'ready' ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: scopeChordlibPageCss(renderState.css) }} />
            <div
              className={cn(measuring && 'pointer-events-none invisible absolute left-0 top-0')}
              style={
                scaledReady
                  ? {
                      width: '100%',
                      height: contentSize.height * cssScale,
                    }
                  : undefined
              }
            >
              <div
                ref={pageRef}
                className="player-chords-page origin-top-left"
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
    </div>
  )
}
