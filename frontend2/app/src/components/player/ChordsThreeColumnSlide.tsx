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

const THREE_COLUMN_COUNT = 3

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; sections: string[]; css: string }
  | { status: 'error'; message: string }

type ChordsThreeColumnSlideProps = {
  song: Song
  displayKey?: string | null
  chordFormat: ChordFormatPreference
  fillParent?: boolean
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

function songMetaLine(songData: ChordSongData, displayKey: string | null | undefined): string {
  const parts: string[] = []
  if (displayKey) {
    parts.push(`Key ${displayKey}`)
  }
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

  if (tempoNum != null && timePair != null) {
    parts.push(`${tempoNum} BPM in ${timePair[0]}/${timePair[1]}`)
  } else if (tempoNum != null) {
    parts.push(`${tempoNum} BPM`)
  } else if (timePair != null) {
    parts.push(`${timePair[0]}/${timePair[1]}`)
  }
  return parts.join(' · ')
}

export function ChordsThreeColumnSlide({
  song,
  displayKey,
  chordFormat,
  fillParent = false,
}: ChordsThreeColumnSlideProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [renderState, setRenderState] = useState<RenderState>({ status: 'loading' })
  const [renderPass, setRenderPass] = useState(0)
  const [columnTypography, setColumnTypography] = useState<{
    fontSizePx: number
    lineHeightPx: number
  } | null>(null)

  const songData = song.data as ChordSongData
  const representation = useMemo(() => chordFormatToRepresentation(chordFormat), [chordFormat])
  const title = useMemo(() => songTitleFromData(songData), [songData])
  const subtitle = useMemo(() => songSubtitleLine(songData), [songData])
  const metaLine = useMemo(() => songMetaLine(songData, displayKey), [songData, displayKey])

  const retry = useCallback(() => {
    setRenderPass((n) => n + 1)
  }, [])

  useEffect(() => {
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
  }, [song.id, songData, displayKey, renderPass, representation])

  useLayoutEffect(() => {
    if (renderState.status !== 'ready' || renderState.sections.length === 0) {
      setColumnTypography(null)
      return
    }

    const el = scrollRef.current
    if (!el) return

    const updateTypography = () => {
      const rect = el.getBoundingClientRect()
      const styles = getComputedStyle(el)
      const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0
      const paddingRight = Number.parseFloat(styles.paddingRight) || 0
      const columnGap = Number.parseFloat(styles.columnGap) || Number.parseFloat(styles.gap) || 0
      const columnWidth = columnWidthInMultiColumnLayout(
        rect.width,
        THREE_COLUMN_COUNT,
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
  }, [renderState])

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
            {metaLine ? <div className="player-chords-three-column__meta">{metaLine}</div> : null}
          </header>
          <style
            dangerouslySetInnerHTML={{
              __html: scopeChordlibPageCss(renderState.css, '.player-chords-three-column'),
            }}
          />
          {renderState.sections.length === 0 ? (
            <p className="player-chords-three-column__empty">{t('player.threeColumnEmpty')}</p>
          ) : (
            <div
              ref={scrollRef}
              className="player-chords-three-column__scroll"
              style={
                columnTypography
                  ? {
                      fontSize: `${columnTypography.fontSizePx}px`,
                      lineHeight: `${columnTypography.lineHeightPx}px`,
                    }
                  : undefined
              }
              dangerouslySetInnerHTML={{ __html: renderState.sections.join('') }}
            />
          )}
        </>
      ) : null}
    </div>
  )
}
