import type { components } from '@/api/schema'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { scopeChordlibPageCss } from '@/lib/chord-page-css'
import {
  columnWidthInMultiColumnLayout,
  fontScaleForColumnWidth,
  scaledColumnTypography,
} from '@/lib/chord-a4-scale'
import { getChordEngine } from '@/lib/chord-engine'
import { chordFormatToRepresentation, type ChordFormatPreference } from '@/lib/chord-format'
import { songTitleFromData } from '@/lib/song-import-export'
import type { ChordSongData } from '@/ports/chord-engine'
import { cn } from '@/lib/utils'

import './player-chords.css'
import './player-chords-three-column.css'

type Song = components['schemas']['Song']

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; sections: string[]; css: string }
  | { status: 'error'; message: string }

type ChordsThreeColumnSlideProps = {
  song: Song
  displayKey?: string | null
  nextSong?: Song | null
  nextDisplayKey?: string | null
  chordFormat: ChordFormatPreference
  columnCount?: 2 | 3
  fillParent?: boolean
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function songSubtitleLine(songData: ChordSongData): string {
  const subtitle =
    typeof songData.subtitle === 'string' ? songData.subtitle.trim() : ''
  const artists = songData.artists
  const artist =
    Array.isArray(artists) && typeof artists[0] === 'string' ? artists[0].trim() : ''
  if (subtitle && artist) return `${subtitle} | ${artist}`
  return subtitle || artist
}

type SongMetaLines = {
  keyLine: string | null
  tempoLine: string | null
}

function songMetaLines(
  songData: ChordSongData,
  displayKey: string | null | undefined,
): SongMetaLines {
  const keyLine = displayKey ? `Key ${displayKey}` : null
  const tempo = songData.tempo
  const time = songData.time
  const tempoNum = typeof tempo === 'number' && Number.isFinite(tempo) ? tempo : null
  const timePair =
    Array.isArray(time) &&
    time.length >= 2 &&
    typeof time[0] === 'number' &&
    typeof time[1] === 'number'
      ? ([time[0], time[1]] as [number, number])
      : null

  let tempoLine: string | null = null
  if (tempoNum != null && timePair != null) {
    tempoLine = `${tempoNum} BPM in ${timePair[0]}/${timePair[1]}`
  } else if (tempoNum != null) {
    tempoLine = `${tempoNum} BPM`
  } else if (timePair != null) {
    tempoLine = `${timePair[0]}/${timePair[1]}`
  }

  return { keyLine, tempoLine }
}

function useMultiColumnSongRender(
  song: Song | null | undefined,
  displayKey: string | null | undefined,
  chordFormat: ChordFormatPreference,
  renderPass: number,
): RenderState {
  const [renderState, setRenderState] = useState<RenderState>({ status: 'loading' })
  const songData = song?.data as ChordSongData | undefined
  const representation = useMemo(() => chordFormatToRepresentation(chordFormat), [chordFormat])

  useEffect(() => {
    if (!song || !songData) {
      setRenderState({ status: 'loading' })
      return
    }

    let cancelled = false
    setRenderState({ status: 'loading' })
    void (async () => {
      try {
        const engine = await getChordEngine()
        const page = engine.renderA4SectionHtmls(songData, {
          key: displayKey ?? undefined,
          representation,
        })
        if (cancelled) return
        setRenderState({ status: 'ready', sections: page.sections, css: page.css })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setRenderState({ status: 'error', message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [song, song?.id, songData, displayKey, renderPass, representation])

  return renderState
}

function wrapPreviewSections(sections: string[]): string {
  return sections
    .map(
      (section) =>
        `<div class="player-chords-three-column__preview-section">${section}</div>`,
    )
    .join('')
}

function previewHeadingHtml(song: Song, displayKey?: string | null): string {
  const songData = song.data as ChordSongData
  const title = escapeHtml(songTitleFromData(songData))
  const subtitle = songSubtitleLine(songData)
  const meta = songMetaLines(songData, displayKey)

  let html = `<p class="player-chords-three-column__preview-section player-chords-three-column__preview-heading"><strong>${title}</strong>`
  if (subtitle) {
    html += `<br><span class="player-chords-three-column__preview-subtitle">${escapeHtml(subtitle)}</span>`
  }
  html += '</p>'

  if (meta.keyLine) {
    html += `<p class="player-chords-three-column__preview-section player-chords-three-column__preview-meta">${escapeHtml(meta.keyLine)}</p>`
  }
  if (meta.tempoLine) {
    html += `<p class="player-chords-three-column__preview-section player-chords-three-column__preview-meta">${escapeHtml(meta.tempoLine)}</p>`
  }

  return html
}

function buildCombinedColumnHtml(
  currentSections: string[],
  nextSong: Song | null | undefined,
  nextDisplayKey: string | null | undefined,
  nextSections: string[],
  visibleNextSectionCount: number,
): string {
  let html = currentSections.join('')

  if (nextSong && visibleNextSectionCount > 0 && nextSections.length > 0) {
    html += previewHeadingHtml(nextSong, nextDisplayKey)
    html += wrapPreviewSections(nextSections.slice(0, visibleNextSectionCount))
  }

  return html
}

function buildCombinedColumnCss(
  currentCss: string,
  nextRenderState: RenderState,
  includeNextPreview: boolean,
): string {
  let css = scopeChordlibPageCss(currentCss, '.player-chords-three-column__columns')
  if (
    includeNextPreview &&
    nextRenderState.status === 'ready' &&
    nextRenderState.css
  ) {
    css += `\n${scopeChordlibPageCss(nextRenderState.css, '.player-chords-three-column__columns')}`
  }
  return css
}

function availableColumnViewportHeight(viewport: HTMLElement): number {
  const styles = getComputedStyle(viewport)
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0
  return viewport.clientHeight - paddingTop - paddingBottom
}

export function ChordsThreeColumnSlide({
  song,
  displayKey,
  nextSong,
  nextDisplayKey,
  chordFormat,
  columnCount = 3,
  fillParent = false,
}: ChordsThreeColumnSlideProps) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const columnsRef = useRef<HTMLDivElement>(null)
  const [renderPass, setRenderPass] = useState(0)
  const [columnTypography, setColumnTypography] = useState<{
    fontSizePx: number
    lineHeightPx: number
  } | null>(null)

  const showNextPreview = nextSong != null
  const songData = song.data as ChordSongData
  const renderState = useMultiColumnSongRender(song, displayKey, chordFormat, renderPass)
  const nextRenderState = useMultiColumnSongRender(nextSong, nextDisplayKey, chordFormat, 0)

  const maxNextSections =
    nextRenderState.status === 'ready' ? nextRenderState.sections.length : 0
  const [fitNextSectionCount, setFitNextSectionCount] = useState(maxNextSections)
  const maxNextSectionsRef = useRef(maxNextSections)
  maxNextSectionsRef.current = maxNextSections

  const resetFitNextSectionCount = useCallback(() => {
    setFitNextSectionCount(maxNextSectionsRef.current)
  }, [])

  const title = useMemo(() => songTitleFromData(songData), [songData])
  const subtitle = useMemo(() => songSubtitleLine(songData), [songData])
  const meta = useMemo(() => songMetaLines(songData, displayKey), [songData, displayKey])

  const retry = useCallback(() => {
    setRenderPass((n) => n + 1)
  }, [])

  useEffect(() => {
    resetFitNextSectionCount()
  }, [maxNextSections, columnCount, song.id, displayKey, nextSong?.id, nextDisplayKey, resetFitNextSectionCount])

  const combinedColumnHtml = useMemo(() => {
    if (renderState.status !== 'ready') return null
    if (!showNextPreview) return renderState.sections.join('')
    const nextSections =
      nextRenderState.status === 'ready' ? nextRenderState.sections : []
    return buildCombinedColumnHtml(
      renderState.sections,
      nextSong,
      nextDisplayKey,
      nextSections,
      fitNextSectionCount,
    )
  }, [
    renderState,
    showNextPreview,
    nextSong,
    nextDisplayKey,
    nextRenderState,
    fitNextSectionCount,
  ])

  const combinedColumnCss = useMemo(() => {
    if (renderState.status !== 'ready') return ''
    return buildCombinedColumnCss(renderState.css, nextRenderState, showNextPreview)
  }, [renderState, nextRenderState, showNextPreview])

  useLayoutEffect(() => {
    if (renderState.status !== 'ready' || renderState.sections.length === 0) {
      setColumnTypography(null)
      return
    }

    const el = columnsRef.current
    if (!el) return

    const updateTypography = () => {
      const rect = el.getBoundingClientRect()
      const styles = getComputedStyle(el)
      const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0
      const paddingRight = Number.parseFloat(styles.paddingRight) || 0
      const columnGap = Number.parseFloat(styles.columnGap) || Number.parseFloat(styles.gap) || 0
      const columnWidth = columnWidthInMultiColumnLayout(
        rect.width,
        columnCount,
        columnGap,
        paddingLeft + paddingRight,
      )
      const scale = fontScaleForColumnWidth(columnWidth)
      if (scale == null) return
      setColumnTypography(scaledColumnTypography(scale))
    }

    updateTypography()
    const observer = new ResizeObserver(updateTypography)
    observer.observe(el)
    return () => observer.disconnect()
  }, [columnCount, renderState])

  useLayoutEffect(() => {
    if (!showNextPreview || maxNextSections === 0) return

    const viewport = viewportRef.current
    const columns = columnsRef.current
    if (!viewport || !columns) return

    const availableHeight = availableColumnViewportHeight(viewport)
    if (availableHeight <= 0) return

    if (columns.scrollHeight > availableHeight && fitNextSectionCount > 0) {
      setFitNextSectionCount((count) => count - 1)
    }
  }, [showNextPreview, maxNextSections, fitNextSectionCount, combinedColumnHtml, columnTypography])

  useLayoutEffect(() => {
    if (!showNextPreview || maxNextSections === 0) return

    const viewport = viewportRef.current
    if (!viewport) return

    const observer = new ResizeObserver(resetFitNextSectionCount)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [showNextPreview, maxNextSections, resetFitNextSectionCount])

  return (
    <div
      className={cn(
        'player-chords-three-column',
        fillParent && 'h-full w-full',
      )}
    >
      {renderState.status === 'loading' ? (
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
          <header className="player-chords-three-column__header">
            <div className="min-w-0">
              <h1 className="player-chords-three-column__title">{title}</h1>
              {subtitle ? <p className="player-chords-three-column__subtitle">{subtitle}</p> : null}
            </div>
            {meta.keyLine || meta.tempoLine ? (
              <div className="player-chords-three-column__meta">
                {meta.keyLine ? <p className="player-chords-three-column__meta-line">{meta.keyLine}</p> : null}
                {meta.tempoLine ? (
                  <p className="player-chords-three-column__meta-line">{meta.tempoLine}</p>
                ) : null}
              </div>
            ) : null}
          </header>
          {combinedColumnCss ? (
            <style dangerouslySetInnerHTML={{ __html: combinedColumnCss }} />
          ) : null}
          {renderState.sections.length === 0 ? (
            <p className="player-chords-three-column__empty">{t('player.threeColumnEmpty')}</p>
          ) : combinedColumnHtml ? (
            <div
              ref={viewportRef}
              className={cn(
                'player-chords-three-column__scroll',
                showNextPreview && 'player-chords-three-column__scroll--clip',
              )}
            >
              <div
                ref={columnsRef}
                className="player-chords-three-column__columns"
                style={{
                  '--player-chords-column-count': columnCount,
                  ...(columnTypography
                    ? {
                        fontSize: `${columnTypography.fontSizePx}px`,
                        lineHeight: `${columnTypography.lineHeightPx}px`,
                      }
                    : {}),
                }}
                dangerouslySetInnerHTML={{ __html: combinedColumnHtml }}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
