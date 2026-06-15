import type { components } from '@/api/schema'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useHideChordsPreference } from '@/hooks/useHideChordsPreference'
import { scopeChordlibPageCss } from '@/lib/chord-page-css'
import {
  columnWidthInMultiColumnLayout,
  fontScaleForMultiColumnPlayer,
  scaledColumnTypography,
} from '@/lib/chord-a4-scale'
import { getChordEngine } from '@/lib/chord-engine'
import { chordFormatToRepresentation, type ChordFormatPreference } from '@/lib/chord-format'
import { stripChordsFromChordlibHtml } from '@/lib/strip-chords-from-html'
import { songTitleFromData } from '@/lib/song-import-export'
import type { ChordSongData } from '@/ports/chord-engine'
import { expandSongSectionsForPlayer } from '@/lib/player/expand-song-sections'
import type { PlayerOverflowStyle } from '@/lib/player/effective-scroll-type'
import { cn } from '@/lib/utils'

import './player-chords.css'
import './player-chords-three-column.css'
import {
  arePackedColumnsEqual,
  isPackedColumnsValid,
  measureStackedSectionHeights,
  packSectionsIntoFixedColumns,
  packSectionsIntoColumnsWithOverflow,
  scrollModeNeedsVerticalScroll,
  shiftOverflowSection,
} from './chords-three-column-pack'

type Song = components['schemas']['Song']

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; sections: string[]; css: string }
  | { status: 'error'; message: string }

const LOADING_RENDER_STATE: RenderState = { status: 'loading' }

type ColumnSection = {
  html: string
  preview: boolean
}

type ChordsThreeColumnSlideProps = {
  song: Song
  displayKey?: string | null
  nextSong?: Song | null
  nextDisplayKey?: string | null
  chordFormat: ChordFormatPreference
  columnCount?: 1 | 2 | 3
  overflowStyle?: PlayerOverflowStyle
  expandSections?: boolean
  fillParent?: boolean
}

const COLUMN_GAP_PX = 24 // 1.5rem — keep in sync with player-chords-three-column.css
const CONTENT_HOST_SELECTOR = '.player-chords-three-column__content'

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
  songData: ChordSongData | undefined,
  displayKey: string | null | undefined,
  chordFormat: ChordFormatPreference,
  hideChords: boolean,
  renderPass: number,
): RenderState {
  const [renderCache, setRenderCache] = useState<{ key: string; state: RenderState }>({
    key: '',
    state: { status: 'loading' },
  })
  const representation = useMemo(() => chordFormatToRepresentation(chordFormat), [chordFormat])
  const renderKey = song
    ? `${song.id}:${displayKey ?? ''}:${renderPass}:${representation}:${hideChords ? 'hidden' : 'shown'}`
    : ''

  useEffect(() => {
    if (!song || !songData) return

    let cancelled = false
    void (async () => {
      try {
        const engine = await getChordEngine()
        const page = engine.renderA4SectionHtmls(songData, {
          key: displayKey ?? undefined,
          representation,
        })
        if (cancelled) return
        const sections = hideChords
          ? page.sections.map((section) => stripChordsFromChordlibHtml(section))
          : page.sections
        setRenderCache({
          key: renderKey,
          state: { status: 'ready', sections, css: page.css },
        })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setRenderCache({ key: renderKey, state: { status: 'error', message } })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [song, songData, displayKey, renderKey, representation, hideChords])

  if (!song || !songData || renderCache.key !== renderKey) {
    return LOADING_RENDER_STATE
  }
  return renderCache.state
}

function previewHeadingHtml(song: Song, displayKey?: string | null): string {
  const songData = song.data as ChordSongData
  const title = escapeHtml(songTitleFromData(songData))
  const subtitle = songSubtitleLine(songData)
  const meta = songMetaLines(songData, displayKey)
  const metaParts = [meta.keyLine, meta.tempoLine].filter(Boolean)
  const metaLine = metaParts.length > 0 ? escapeHtml(metaParts.join(' · ')) : null

  let html = `<p class="player-chords-three-column__preview-section player-chords-three-column__preview-heading"><strong>${title}</strong>`
  if (subtitle) {
    html += `<br><span class="player-chords-three-column__preview-subtitle">${escapeHtml(subtitle)}</span>`
  }
  if (metaLine) {
    html += `<br><span class="player-chords-three-column__preview-meta">${metaLine}</span>`
  }
  html += '</p>'

  return html
}

function buildColumnSections(
  currentSections: string[],
  nextSong: Song | null | undefined,
  nextDisplayKey: string | null | undefined,
  nextSections: string[],
): ColumnSection[] {
  const sections: ColumnSection[] = currentSections.map((html) => ({ html, preview: false }))

  if (nextSong && nextSections.length > 0) {
    sections.push({ html: previewHeadingHtml(nextSong, nextDisplayKey), preview: true })
    for (const section of nextSections) {
      sections.push({
        html: `<div class="player-chords-three-column__preview-section">${section}</div>`,
        preview: true,
      })
    }
  }

  return sections
}

function availableColumnViewportSize(columnArea: HTMLElement): { width: number; height: number } {
  return {
    width: columnArea.clientWidth,
    height: columnArea.clientHeight,
  }
}

/** Scroll mode uses a flow-positioned column area; size from the padded scroll viewport. */
function scrollModeColumnViewportSize(scrollEl: HTMLElement): { width: number; height: number } {
  const style = getComputedStyle(scrollEl)
  const padTop = Number.parseFloat(style.paddingTop) || 0
  const padBottom = Number.parseFloat(style.paddingBottom) || 0
  const padLeft = Number.parseFloat(style.paddingLeft) || 0
  const padRight = Number.parseFloat(style.paddingRight) || 0
  return {
    width: scrollEl.clientWidth - padLeft - padRight,
    height: scrollEl.clientHeight - padTop - padBottom,
  }
}

function buildCombinedColumnCss(
  currentCss: string,
  nextRenderState: RenderState,
  includeNextPreview: boolean,
): string {
  let css = scopeChordlibPageCss(currentCss, CONTENT_HOST_SELECTOR)
  if (
    includeNextPreview &&
    nextRenderState.status === 'ready' &&
    nextRenderState.css
  ) {
    css += `\n${scopeChordlibPageCss(nextRenderState.css, CONTENT_HOST_SELECTOR)}`
  }
  css += `
${CONTENT_HOST_SELECTOR} .columns {
  font-size: inherit;
  line-height: inherit;
}`
  return css
}

function renderColumnSection(section: ColumnSection | undefined, index: number) {
  if (!section) return null

  return (
    <div key={index} className="player-chords-three-column__section" data-section-index={index}>
      <div dangerouslySetInnerHTML={{ __html: section.html }} />
    </div>
  )
}

function columnTypographyStyle(columnLayout: {
  fontSizePx: number
  lineHeightPx: number
}): { fontSize: string; lineHeight: string } {
  return {
    fontSize: `${columnLayout.fontSizePx}px`,
    lineHeight: `${columnLayout.lineHeightPx}px`,
  }
}

export function ChordsThreeColumnSlide({
  song,
  displayKey,
  nextSong,
  nextDisplayKey,
  chordFormat,
  columnCount = 3,
  overflowStyle = 'scroll',
  expandSections = false,
  fillParent = false,
}: ChordsThreeColumnSlideProps) {
  const { t } = useTranslation()
  const hideChords = useHideChordsPreference()
  const viewportRef = useRef<HTMLDivElement>(null)
  const columnAreaRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const [renderPass, setRenderPass] = useState(0)
  const [columnLayoutCache, setColumnLayoutCache] = useState<{
    key: string
    layout: {
      fontSizePx: number
      lineHeightPx: number
      columnWidthPx: number
      columnHeightPx: number
    }
  } | null>(null)
  const [packedColumnsCache, setPackedColumnsCache] = useState<{
    key: string
    columns: number[][]
    needsVerticalScroll: boolean
  } | null>(null)

  const showNextPreview = nextSong != null
  const songData = song.data as ChordSongData
  const renderSongData = useMemo(
    () => (expandSections ? expandSongSectionsForPlayer(songData) : songData),
    [songData, expandSections],
  )
  const renderState = useMultiColumnSongRender(
    song,
    renderSongData,
    displayKey,
    chordFormat,
    hideChords,
    renderPass,
  )
  const nextSongData = nextSong?.data as ChordSongData | undefined
  const nextRenderSongData = useMemo(
    () =>
      nextSongData && expandSections ? expandSongSectionsForPlayer(nextSongData) : nextSongData,
    [nextSongData, expandSections],
  )
  const nextRenderState = useMultiColumnSongRender(
    nextSong,
    nextRenderSongData,
    nextDisplayKey,
    chordFormat,
    hideChords,
    0,
  )
  const nextPreviewRenderState = showNextPreview ? nextRenderState : null

  const title = useMemo(() => songTitleFromData(songData), [songData])
  const subtitle = useMemo(() => songSubtitleLine(songData), [songData])
  const meta = useMemo(() => songMetaLines(songData, displayKey), [songData, displayKey])

  const retry = useCallback(() => {
    setRenderPass((n) => n + 1)
  }, [])

  const columnSections = useMemo((): ColumnSection[] | null => {
    if (renderState.status !== 'ready') return null
    const nextSections =
      nextPreviewRenderState?.status === 'ready' ? nextPreviewRenderState.sections : []
    return buildColumnSections(
      renderState.sections,
      showNextPreview ? nextSong : undefined,
      nextDisplayKey,
      nextSections,
    )
  }, [renderState, showNextPreview, nextSong, nextDisplayKey, nextPreviewRenderState])

  const combinedColumnCss = useMemo(() => {
    if (renderState.status !== 'ready') return ''
    return buildCombinedColumnCss(
      renderState.css,
      nextPreviewRenderState ?? LOADING_RENDER_STATE,
      showNextPreview,
    )
  }, [renderState, nextPreviewRenderState, showNextPreview])

  const layoutKey =
    renderState.status === 'ready' && renderState.sections.length > 0
      ? `${columnCount}:${renderState.sections.length}`
      : null
  const columnLayout =
    layoutKey && columnLayoutCache?.key === layoutKey ? columnLayoutCache.layout : null
  const packingContextKey =
    layoutKey && columnLayout && columnSections
      ? `${layoutKey}:${columnSections.length}:${columnLayout.columnWidthPx}:${columnLayout.columnHeightPx}:${columnLayout.fontSizePx}:${overflowStyle}`
      : null
  const packedColumns =
    packingContextKey && packedColumnsCache?.key === packingContextKey
      ? packedColumnsCache.columns
      : null
  const needsVerticalScroll =
    overflowStyle === 'scroll' && packedColumnsCache?.key === packingContextKey
      ? packedColumnsCache.needsVerticalScroll
      : false

  useLayoutEffect(() => {
    if (!layoutKey) return

    const columnAreaEl = columnAreaRef.current
    if (!columnAreaEl) return

    const updateLayout = () => {
      const scrollEl = viewportRef.current
      const { width, height } =
        overflowStyle === 'scroll' && scrollEl
          ? scrollModeColumnViewportSize(scrollEl)
          : availableColumnViewportSize(columnAreaEl)
      if (width <= 0 || height <= 0) return

      const columnWidth = columnWidthInMultiColumnLayout(
        width,
        columnCount,
        COLUMN_GAP_PX,
        0,
      )
      const scale = fontScaleForMultiColumnPlayer(columnWidth)
      if (scale == null) return

      const typography = scaledColumnTypography(scale)
      setColumnLayoutCache((prev) => {
        if (
          prev?.key === layoutKey &&
          prev.layout.fontSizePx === typography.fontSizePx &&
          prev.layout.lineHeightPx === typography.lineHeightPx &&
          prev.layout.columnWidthPx === columnWidth &&
          prev.layout.columnHeightPx === Math.floor(height)
        ) {
          return prev
        }
        return {
          key: layoutKey,
          layout: {
            ...typography,
            columnWidthPx: columnWidth,
            columnHeightPx: Math.floor(height),
          },
        }
      })
    }

    updateLayout()
    const observer = new ResizeObserver(updateLayout)
    observer.observe(columnAreaEl)
    if (viewportRef.current) observer.observe(viewportRef.current)
    return () => observer.disconnect()
  }, [layoutKey, columnCount, renderState.status, columnSections?.length, overflowStyle])

  useLayoutEffect(() => {
    if (!packingContextKey || !columnLayout || !columnSections) return

    const measureEl = measureRef.current
    if (!measureEl) return

    const measureAndPack = () => {
      const sectionEls = measureEl.querySelectorAll('[data-section-index]')
      if (sectionEls.length !== columnSections.length) return

      const heights = measureStackedSectionHeights(measureEl)
      if (heights.length !== columnSections.length || heights.some((height) => height <= 0)) return

      const columns =
        overflowStyle === 'scroll'
          ? packSectionsIntoFixedColumns(heights, columnLayout.columnHeightPx, columnCount)
          : packSectionsIntoColumnsWithOverflow(heights, columnLayout.columnHeightPx)
      const nextNeedsVerticalScroll =
        overflowStyle === 'scroll' &&
        scrollModeNeedsVerticalScroll(heights, columns, columnLayout.columnHeightPx)
      setPackedColumnsCache((prev) => {
        if (
          prev?.key === packingContextKey &&
          arePackedColumnsEqual(prev.columns, columns) &&
          prev.needsVerticalScroll === nextNeedsVerticalScroll
        ) {
          return prev
        }
        return {
          key: packingContextKey,
          columns,
          needsVerticalScroll: nextNeedsVerticalScroll,
        }
      })
    }

    measureAndPack()
    void document.fonts.ready.then(measureAndPack)

    const observer = new ResizeObserver(measureAndPack)
    observer.observe(measureEl)
    return () => observer.disconnect()
  }, [packingContextKey, columnLayout, columnSections, combinedColumnCss, overflowStyle, columnCount])

  useLayoutEffect(() => {
    if (overflowStyle === 'scroll') return
    if (!columnLayout || !packedColumns || !columnSections || !packingContextKey) return
    if (!isPackedColumnsValid(packedColumns, columnSections.length)) return

    const measureEl = measureRef.current
    const rowEl = rowRef.current
    if (!measureEl || !rowEl) return

    const columnEls = rowEl.querySelectorAll('.player-chords-three-column__column')
    if (columnEls.length === 0) return

    const heights = measureStackedSectionHeights(measureEl)
    if (heights.length !== columnSections.length || heights.some((height) => height <= 0)) return

    let columns = packedColumns.map((column) => [...column])
    let changed = false

    for (let pass = 0; pass < columnSections.length; pass++) {
      let shifted = false
      for (let columnIndex = 0; columnIndex < columnEls.length; columnIndex++) {
        const columnEl = columnEls[columnIndex] as HTMLElement
        const domOverflow = columnEl.scrollHeight > columnLayout.columnHeightPx + 1
        const measuredHeight =
          columns[columnIndex]?.reduce((sum, sectionIndex) => sum + heights[sectionIndex], 0) ?? 0
        const heightOverflow = measuredHeight > columnLayout.columnHeightPx

        if (!domOverflow && !heightOverflow) continue
        if (columns[columnIndex]?.length <= 1) continue

        const nextColumns = shiftOverflowSection(columns, columnIndex)
        if (!nextColumns) continue
        columns = nextColumns
        changed = true
        shifted = true
        break
      }
      if (!shifted) break
    }

    if (changed && !arePackedColumnsEqual(columns, packedColumns)) {
      setPackedColumnsCache({
        key: packingContextKey,
        columns,
        needsVerticalScroll: scrollModeNeedsVerticalScroll(
          heights,
          columns,
          columnLayout.columnHeightPx,
        ),
      })
    }
  }, [columnLayout, packedColumns, combinedColumnCss, columnSections, packingContextKey, overflowStyle])

  const layoutReady =
    columnLayout != null &&
    packedColumns != null &&
    columnSections != null &&
    isPackedColumnsValid(packedColumns, columnSections.length)

  return (
    <div
      className={cn(
        'player-chords-three-column',
        overflowStyle === 'scroll' && 'player-chords-three-column--scroll',
        overflowStyle === 'scroll' && layoutReady && !needsVerticalScroll && 'player-chords-three-column--fits',
        'h-full min-h-0 w-full',
        fillParent && 'flex-1',
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
          ) : columnSections ? (
            <div
              ref={viewportRef}
              className={cn(
                'player-chords-three-column__scroll',
                overflowStyle === 'scroll' &&
                  needsVerticalScroll &&
                  'player-chords-three-column__scroll--scrollable',
              )}
            >
              <div ref={columnAreaRef} className="player-chords-three-column__column-area">
                {columnLayout ? (
                  <div
                    ref={measureRef}
                    className="player-chords-three-column__measure player-chords-three-column__content"
                    style={{
                      width: `${columnLayout.columnWidthPx}px`,
                      ...columnTypographyStyle(columnLayout),
                    }}
                    aria-hidden
                  >
                    {columnSections.map((section, index) => renderColumnSection(section, index))}
                  </div>
                ) : null}
                {layoutReady && columnLayout && packedColumns ? (
                  <div
                    ref={rowRef}
                    className="player-chords-three-column__row"
                    style={{
                      gap: `${COLUMN_GAP_PX}px`,
                      height:
                        overflowStyle === 'scroll' ? 'auto' : `${columnLayout.columnHeightPx}px`,
                      minHeight:
                        overflowStyle === 'scroll' && needsVerticalScroll
                          ? `${columnLayout.columnHeightPx}px`
                          : undefined,
                      ...columnTypographyStyle(columnLayout),
                    }}
                  >
                    {packedColumns.map((sectionIndices, columnIndex) => (
                      <div
                        key={columnIndex}
                        className="player-chords-three-column__column player-chords-three-column__content"
                        style={{
                          width: `${columnLayout.columnWidthPx}px`,
                          height:
                            overflowStyle === 'scroll'
                              ? 'auto'
                              : `${columnLayout.columnHeightPx}px`,
                          minHeight:
                            overflowStyle === 'scroll' && needsVerticalScroll
                              ? `${columnLayout.columnHeightPx}px`
                              : undefined,
                        }}
                      >
                        {sectionIndices.map((sectionIndex) =>
                          renderColumnSection(columnSections[sectionIndex], sectionIndex),
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
