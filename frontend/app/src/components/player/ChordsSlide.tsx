import type { components } from '@/api/schema'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useHideChordsPreference } from '@/hooks/useHideChordsPreference'
import { observeElementResize } from '@/lib/browser-apis'
import { scopeChordlibPageCss } from '@/lib/chord-page-css'
import { getChordEngine } from '@/lib/chord-engine'
import {
  A4_REFERENCE_HEIGHT_PX,
  cssScaleToFitViewport,
  scaledPlayerPageTypography,
} from '@/lib/chord-a4-scale'
import { chordFormatToRepresentation, type ChordFormatPreference } from '@/lib/chord-format'
import { stripChordsFromChordlibHtml } from '@/lib/strip-chords-from-html'
import type { ChordSongData } from '@/ports/chord-engine'
import type { PlayerOverflowStyle } from '@/lib/player/effective-scroll-type'
import { formatPlayedKeyOffset } from '@/lib/player/transpose-key'
import { cn } from '@/lib/utils'

import './player-chords.css'

type Song = components['schemas']['Song']
type Orientation = components['schemas']['Orientation']

const GENERATED_KEY_PATTERN = /\bKey\s+[A-G](?:b|#)?/

function replaceGeneratedKeyMeta(html: string, keyLine: string): string {
  if (typeof DOMParser === 'undefined') return html
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const meta = document.querySelector('.meta')
  if (!meta) return html

  function replaceText(node: Node): boolean {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? ''
        if (GENERATED_KEY_PATTERN.test(text)) {
          child.textContent = text.replace(GENERATED_KEY_PATTERN, keyLine)
          return true
        }
      } else if (replaceText(child)) {
        return true
      }
    }
    return false
  }

  if (!replaceText(meta)) {
    meta.insertBefore(document.createTextNode(`${keyLine} · `), meta.firstChild)
  }
  return document.body.innerHTML
}

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; html: string; css: string }
  | { status: 'error'; message: string }

type ChordsSlideProps = {
  song: Song
  displayKey?: string | null
  soundingKey?: string | null
  selectedKey?: string | null
  capoFret?: number | null
  showTransposeControls?: boolean
  transposeOffset?: number | null
  languageIndex?: number | null
  chordFormat: ChordFormatPreference
  orientation: Orientation
  /** Fill a fixed-size book spread slot instead of growing with content. */
  fillParent?: boolean
  fontScale?: number
  overflowStyle?: PlayerOverflowStyle
}

export function ChordsSlide({
  song,
  displayKey,
  soundingKey = displayKey,
  selectedKey = soundingKey,
  capoFret = null,
  showTransposeControls = false,
  transposeOffset = null,
  languageIndex,
  chordFormat,
  orientation,
  fillParent = false,
  fontScale = 1,
  overflowStyle = 'scroll',
}: ChordsSlideProps) {
  const { t } = useTranslation()
  const hideChords = useHideChordsPreference()
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [renderCache, setRenderCache] = useState<{ key: string; state: RenderState }>({
    key: '',
    state: { status: 'loading' },
  })
  const [contentSizeCache, setContentSizeCache] = useState<{
    key: string
    size: { width: number; height: number }
  }>({
    key: '',
    size: { width: 0, height: 0 },
  })
  const [renderPass, setRenderPass] = useState(0)

  const songData = song.data as ChordSongData
  const representation = useMemo(() => chordFormatToRepresentation(chordFormat), [chordFormat])
  const renderKey = `${song.id}:${displayKey ?? ''}:${soundingKey ?? ''}:${selectedKey ?? ''}:${capoFret ?? ''}:${showTransposeControls ? 'transpose' : 'guitar'}:${transposeOffset ?? ''}:${languageIndex ?? ''}:${renderPass}:${representation}:${hideChords ? 'hidden' : 'shown'}`
  const renderState = useMemo(
    (): RenderState =>
      renderCache.key === renderKey ? renderCache.state : { status: 'loading' },
    [renderCache, renderKey],
  )
  const contentSize =
    contentSizeCache.key === renderKey ? contentSizeCache.size : { width: 0, height: 0 }

  const cssScale = useMemo(
    () =>
      cssScaleToFitViewport(
        viewportSize.width,
        viewportSize.height,
        contentSize.width,
        Math.min(contentSize.height, A4_REFERENCE_HEIGHT_PX),
      ),
    [contentSize.height, contentSize.width, viewportSize.height, viewportSize.width],
  )

  const fontScaleCss = useMemo(() => {
    const titleFontSize = scaledPlayerPageTypography(26, fontScale)
    const bodyFontSize = scaledPlayerPageTypography(13, fontScale)
    const bodyLineHeight = scaledPlayerPageTypography(17, fontScale)
    return `
.player-chords-page .title { font-size: ${titleFontSize}px; }
.player-chords-page .subtitle,
.player-chords-page .meta,
.player-chords-page .copyright { font-size: ${bodyFontSize}px; }
.player-chords-page .columns {
  font-size: ${bodyFontSize}px;
  line-height: ${bodyLineHeight}px;
}
${
  overflowStyle === 'scroll' && fontScale > 1
    ? `.player-chords-page .page {
  height: auto;
  min-height: ${A4_REFERENCE_HEIGHT_PX}px;
  overflow: visible;
}
.player-chords-page .columns {
  height: auto;
}`
    : ''
}`
  }, [fontScale, overflowStyle])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const updateSize = () => {
      const rect = el.getBoundingClientRect()
      setViewportSize({ width: rect.width, height: rect.height })
    }
    updateSize()
    return observeElementResize(el, () => updateSize())
  }, [])

  const retry = useCallback(() => {
    setRenderPass((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const engine = await getChordEngine()
        const page = engine.renderA4Html(songData, {
          key: displayKey ?? undefined,
          language: languageIndex ?? undefined,
          scale: 1,
          representation,
        })
        if (cancelled) return
        const keyLine = selectedKey
          ? showTransposeControls && transposeOffset != null && transposeOffset !== 0
            ? `${t('player.songKeyPrefix')} ${selectedKey} · ${t('player.transpose.short')} ${formatPlayedKeyOffset(transposeOffset)}`
            : capoFret != null
              ? `${t('player.songKeyPrefix')} ${selectedKey} · ${t('player.capo.label')} ${capoFret}`
              : `${t('player.songKeyPrefix')} ${selectedKey}`
          : null
        const withPlayerMeta = keyLine ? replaceGeneratedKeyMeta(page.html, keyLine) : page.html
        const html = hideChords ? stripChordsFromChordlibHtml(withPlayerMeta) : withPlayerMeta
        setRenderCache({ key: renderKey, state: { status: 'ready', html, css: page.css } })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setRenderCache({ key: renderKey, state: { status: 'error', message } })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [renderKey, songData, displayKey, soundingKey, selectedKey, capoFret, showTransposeControls, transposeOffset, languageIndex, representation, hideChords, t])

  useLayoutEffect(() => {
    if (renderState.status !== 'ready') return
    const el = pageRef.current
    if (!el) return

    const measure = () => {
      const page = el.firstElementChild as HTMLElement | null
      const width = page?.offsetWidth ?? el.scrollWidth
      const height = page
        ? overflowStyle === 'scroll'
          ? page.scrollHeight
          : page.offsetHeight
        : el.scrollHeight
      if (width > 0 && height > 0) {
        setContentSizeCache({ key: renderKey, size: { width, height } })
      }
    }

    measure()
    return observeElementResize(el, measure)
  }, [fontScale, overflowStyle, renderKey, renderState])

  const scaledReady = renderState.status === 'ready' && cssScale != null
  const measuring = renderState.status === 'ready' && cssScale == null
  const visibleHeight =
    scaledReady && cssScale != null ? contentSize.height * cssScale : undefined
  const visibleWidth =
    scaledReady && cssScale != null ? contentSize.width * cssScale : undefined

  return (
    <div
      ref={viewportRef}
      data-player-chord-surface
      className={cn(
        'player-chord-song-surface player-chords-viewport flex min-h-0 flex-1 flex-col',
        fillParent && 'h-full w-full',
        overflowStyle === 'scroll' ? 'overflow-auto' : 'overflow-hidden',
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
          <style
            dangerouslySetInnerHTML={{
              __html: `${scopeChordlibPageCss(renderState.css)}\n${fontScaleCss}`,
            }}
          />
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
