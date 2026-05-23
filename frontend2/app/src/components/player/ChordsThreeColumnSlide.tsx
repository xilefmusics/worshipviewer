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
  columnCount?: 2 | 3
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

/** Measure how much vertical space each section consumes when stacked in a column. */
export function measureStackedSectionHeights(measureRoot: HTMLElement): number[] {
  const sectionEls = measureRoot.querySelectorAll('[data-section-index]')
  if (sectionEls.length === 0) return []

  const rootTop = measureRoot.getBoundingClientRect().top
  const heights: number[] = []

  for (let index = 0; index < sectionEls.length; index++) {
    const el = sectionEls[index] as HTMLElement
    const rect = el.getBoundingClientRect()
    const previousBottom =
      index === 0 ? rootTop : (sectionEls[index - 1] as HTMLElement).getBoundingClientRect().bottom
    heights.push(Math.ceil(rect.bottom - previousBottom))
  }

  return heights
}

/** Pack section indices into columns, filling each column top-to-bottom before starting the next. */
export function packSectionsIntoColumns(
  sectionHeights: number[],
  maxColumnHeight: number,
): number[][] {
  if (sectionHeights.length === 0) return []

  const columns: number[][] = [[]]
  let usedHeight = 0

  for (let index = 0; index < sectionHeights.length; index++) {
    const sectionHeight = sectionHeights[index]
    const currentColumnHasContent = columns[columns.length - 1].length > 0
    if (currentColumnHasContent && usedHeight + sectionHeight > maxColumnHeight) {
      columns.push([])
      usedHeight = 0
    }
    columns[columns.length - 1].push(index)
    usedHeight += sectionHeight
  }

  return columns
}

/** Move one trailing section from a column into the next column. */
export function shiftOverflowSection(columns: number[][], columnIndex: number): number[][] | null {
  if (columns[columnIndex]?.length === 0) return null

  const nextColumns = columns.map((column) => [...column])
  const moved = nextColumns[columnIndex].pop()
  if (moved == null) return null

  if (!nextColumns[columnIndex + 1]) nextColumns.push([])
  nextColumns[columnIndex + 1].unshift(moved)
  return nextColumns
}

function availableColumnViewportSize(columnArea: HTMLElement): { width: number; height: number } {
  return {
    width: columnArea.clientWidth,
    height: columnArea.clientHeight,
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

function renderColumnSection(section: ColumnSection, index: number) {
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
  fillParent = false,
}: ChordsThreeColumnSlideProps) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const columnAreaRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const [renderPass, setRenderPass] = useState(0)
  const [columnLayout, setColumnLayout] = useState<{
    fontSizePx: number
    lineHeightPx: number
    columnWidthPx: number
    columnHeightPx: number
  } | null>(null)
  const [packedColumns, setPackedColumns] = useState<number[][] | null>(null)

  const showNextPreview = nextSong != null
  const songData = song.data as ChordSongData
  const renderState = useMultiColumnSongRender(song, displayKey, chordFormat, renderPass)
  const nextRenderState = useMultiColumnSongRender(nextSong, nextDisplayKey, chordFormat, 0)

  const title = useMemo(() => songTitleFromData(songData), [songData])
  const subtitle = useMemo(() => songSubtitleLine(songData), [songData])
  const meta = useMemo(() => songMetaLines(songData, displayKey), [songData, displayKey])

  const retry = useCallback(() => {
    setRenderPass((n) => n + 1)
  }, [])

  const columnSections = useMemo((): ColumnSection[] | null => {
    if (renderState.status !== 'ready') return null
    const nextSections =
      showNextPreview && nextRenderState.status === 'ready' ? nextRenderState.sections : []
    return buildColumnSections(
      renderState.sections,
      showNextPreview ? nextSong : undefined,
      nextDisplayKey,
      nextSections,
    )
  }, [renderState, showNextPreview, nextSong, nextDisplayKey, nextRenderState])

  const combinedColumnCss = useMemo(() => {
    if (renderState.status !== 'ready') return ''
    return buildCombinedColumnCss(renderState.css, nextRenderState, showNextPreview)
  }, [renderState, nextRenderState, showNextPreview])

  useLayoutEffect(() => {
    if (renderState.status !== 'ready' || renderState.sections.length === 0) {
      setColumnLayout(null)
      return
    }

    const columnAreaEl = columnAreaRef.current
    if (!columnAreaEl) return

    const updateLayout = () => {
      const { width, height } = availableColumnViewportSize(columnAreaEl)
      if (width <= 0 || height <= 0) return

      const columnWidth = columnWidthInMultiColumnLayout(
        width,
        columnCount,
        COLUMN_GAP_PX,
        0,
      )
      const scale = fontScaleForColumnWidth(columnWidth)
      if (scale == null) return

      const typography = scaledColumnTypography(scale)
      setColumnLayout({
        ...typography,
        columnWidthPx: columnWidth,
        columnHeightPx: Math.floor(height),
      })
    }

    updateLayout()
    const observer = new ResizeObserver(updateLayout)
    observer.observe(columnAreaEl)
    if (viewportRef.current) observer.observe(viewportRef.current)
    return () => observer.disconnect()
  }, [columnCount, renderState, columnSections])

  useLayoutEffect(() => {
    if (!columnLayout || !columnSections) {
      setPackedColumns(null)
      return
    }

    const measureEl = measureRef.current
    if (!measureEl) return

    const measureAndPack = () => {
      const sectionEls = measureEl.querySelectorAll('[data-section-index]')
      if (sectionEls.length !== columnSections.length) return

      const heights = measureStackedSectionHeights(measureEl)
      if (heights.length !== columnSections.length || heights.some((height) => height <= 0)) return

      setPackedColumns(packSectionsIntoColumns(heights, columnLayout.columnHeightPx))
    }

    measureAndPack()
    void document.fonts.ready.then(measureAndPack)

    const observer = new ResizeObserver(measureAndPack)
    observer.observe(measureEl)
    return () => observer.disconnect()
  }, [columnLayout, columnSections, combinedColumnCss])

  useLayoutEffect(() => {
    if (!columnLayout || !packedColumns) return

    const rowEl = rowRef.current
    if (!rowEl) return

    const columnEls = rowEl.querySelectorAll('.player-chords-three-column__column')
    if (columnEls.length === 0) return

    for (let columnIndex = 0; columnIndex < columnEls.length; columnIndex++) {
      const columnEl = columnEls[columnIndex] as HTMLElement
      if (columnEl.scrollHeight <= columnLayout.columnHeightPx + 1) continue
      if (packedColumns[columnIndex]?.length <= 1) continue

      const nextColumns = shiftOverflowSection(packedColumns, columnIndex)
      if (nextColumns) setPackedColumns(nextColumns)
      return
    }
  }, [columnLayout, packedColumns, combinedColumnCss, columnSections])

  const layoutReady = columnLayout != null && packedColumns != null

  return (
    <div
      className={cn(
        'player-chords-three-column',
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
            <div ref={viewportRef} className="player-chords-three-column__scroll">
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
                      height: `${columnLayout.columnHeightPx}px`,
                      ...columnTypographyStyle(columnLayout),
                    }}
                  >
                    {packedColumns.map((sectionIndices, columnIndex) => (
                      <div
                        key={columnIndex}
                        className="player-chords-three-column__column player-chords-three-column__content"
                        style={{
                          width: `${columnLayout.columnWidthPx}px`,
                          height: `${columnLayout.columnHeightPx}px`,
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
