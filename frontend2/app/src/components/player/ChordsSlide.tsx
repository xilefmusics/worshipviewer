import type { components } from '@/api/schema'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { getChordEngine } from '@/lib/chord-engine'
import { viewportScaleForA4 } from '@/lib/chord-a4-scale'
import type { ChordSongData } from '@/ports/chord-engine'
import { resolveSongDataKey } from '@/lib/setlist-song-links'
import { cn } from '@/lib/utils'

import './player-chords.css'

type Song = components['schemas']['Song']

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; html: string; css: string }
  | { status: 'error'; message: string }

type ChordsSlideProps = {
  song: Song
}

export function ChordsSlide({ song }: ChordsSlideProps) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [renderState, setRenderState] = useState<RenderState>({ status: 'loading' })
  const [renderPass, setRenderPass] = useState(0)

  const songData = song.data as ChordSongData
  const displayKey = useMemo(
    () => resolveSongDataKey(songData as Record<string, unknown>),
    [songData],
  )
  const scale = viewportScaleForA4(viewportHeight)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height)
    })
    observer.observe(el)
    setViewportHeight(el.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [])

  const retry = useCallback(() => {
    setRenderPass((n) => n + 1)
  }, [])

  useEffect(() => {
    if (scale == null) return
    let cancelled = false
    setRenderState({ status: 'loading' })
    void (async () => {
      try {
        const engine = await getChordEngine()
        const page = engine.renderA4Html(songData, {
          key: displayKey ?? undefined,
          scale,
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
  }, [song.id, songData, displayKey, scale, renderPass])

  return (
    <div
      ref={viewportRef}
      className={cn(
        'player-chords-viewport flex min-h-0 flex-1 flex-col overflow-auto',
        renderState.status === 'ready' && 'player-chords-viewport--ready',
      )}
    >
      {renderState.status === 'loading' || scale == null ? (
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

      {renderState.status === 'ready' && scale != null ? (
        <>
          <style dangerouslySetInnerHTML={{ __html: renderState.css }} />
          <div
            className="player-chords-page mx-auto w-full max-w-[794px] shrink-0"
            dangerouslySetInnerHTML={{ __html: renderState.html }}
          />
        </>
      ) : null}
    </div>
  )
}
