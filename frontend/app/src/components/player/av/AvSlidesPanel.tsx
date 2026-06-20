import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { AvBackgroundSelector } from '@/components/player/av/AvBackgroundSelector'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import { observeElementResize } from '@/lib/browser-apis'
import type {
  AvBackgroundLayer,
  AvBackgroundPreset,
  AvContentLayer,
  AvTransition,
} from '@/lib/player/av-preferences'
import type { AvSlideDeckEntry } from '@/lib/player/av-lyric-slides'
import { cn } from '@/lib/utils'

import './player-av.css'

const SLIDE_COL_MIN_PX = 288
const SLIDE_COL_GAP_PX = 16

function firstSlideLine(text: string): string {
  const line = text.split('\n')[0]?.trim()
  return line || text.trim()
}

function previewContent(entry: AvSlideDeckEntry, multiColumn: boolean): {
  contentText?: string
  contentLines?: AvSlideDeckEntry['lines']
} {
  if (entry.lines?.length) {
    return {
      contentLines: multiColumn ? entry.lines : entry.lines.slice(0, 1),
    }
  }
  const text = multiColumn ? entry.text : firstSlideLine(entry.text)
  return { contentText: text }
}

function slidePanelColumnCount(width: number): number {
  return Math.floor((width + SLIDE_COL_GAP_PX) / (SLIDE_COL_MIN_PX + SLIDE_COL_GAP_PX))
}

function useSlidePanelMultiColumn(): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null)
  const [multiColumn, setMultiColumn] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = (width: number) => {
      setMultiColumn(slidePanelColumnCount(width) >= 2)
    }

    update(el.getBoundingClientRect().width)
    return observeElementResize(el, ([entry]) => {
      update(entry?.contentRect.width ?? el.getBoundingClientRect().width)
    })
  }, [])

  return [ref, multiColumn]
}

type AvSlidesPanelProps = {
  entries: AvSlideDeckEntry[]
  currentSlideIndex: number | null
  contentLayer: AvContentLayer
  backgroundLayer: AvBackgroundLayer
  backgroundPreviewText: string
  transition: AvTransition
  onSelectSlide: (slideIndex: number) => void
  onSelectBackgroundPreset: (preset: AvBackgroundPreset) => void
}

export function AvSlidesPanel({
  entries,
  currentSlideIndex,
  contentLayer,
  backgroundLayer,
  backgroundPreviewText,
  transition,
  onSelectSlide,
  onSelectBackgroundPreset,
}: AvSlidesPanelProps) {
  const { t } = useTranslation()
  const [panelRef, multiColumn] = useSlidePanelMultiColumn()
  const slideRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  useEffect(() => {
    if (currentSlideIndex == null) return
    slideRefs.current
      .get(currentSlideIndex)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [currentSlideIndex, entries])

  const backgroundPreviewLine = firstSlideLine(backgroundPreviewText)

  if (entries.length === 0) {
    return (
      <div className="av-slides-panel-shell">
        <div className="av-slides-panel av-slides-panel--empty">
          <p className="av-slides-panel__empty">{t('player.av.emptySlide')}</p>
        </div>
        <AvBackgroundSelector
          preset={backgroundLayer.preset}
          previewText={backgroundPreviewLine}
          contentLayer={contentLayer}
          onSelectPreset={onSelectBackgroundPreset}
        />
      </div>
    )
  }

  return (
    <div className="av-slides-panel-shell">
      <div
        ref={panelRef}
        className={cn('av-slides-panel', multiColumn && 'av-slides-panel--multi-column')}
        role="list"
        aria-label={t('player.av.slidesAria')}
      >
      {entries.map((entry) => {
        const selected = entry.slideIndex === currentSlideIndex
        const preview = previewContent(entry, multiColumn)
        return (
          <button
            key={entry.slideIndex}
            ref={(el) => {
              if (el) slideRefs.current.set(entry.slideIndex, el)
              else slideRefs.current.delete(entry.slideIndex)
            }}
            type="button"
            role="listitem"
            className={cn(
              'av-slides-panel__card',
              selected && 'av-slides-panel__card--selected',
              entry.isSubSlide && 'av-slides-panel__card--sub',
            )}
            aria-current={selected ? 'true' : undefined}
            aria-label={entry.label}
            onClick={() => onSelectSlide(entry.slideIndex)}
          >
            <div className="av-slides-panel__header">{entry.label}</div>
            <div
              className={cn(
                'av-slides-panel__preview',
                multiColumn
                  ? 'av-slides-panel__preview--full'
                  : 'av-slides-panel__preview--compact',
              )}
            >
              <AvSlideView
                contentText={preview.contentText}
                contentLines={preview.contentLines}
                contentLayer={contentLayer}
                backgroundLayer={backgroundLayer}
                transition={transition}
                screenState="live"
                compact={!multiColumn}
                showBackground={false}
                className={multiColumn ? undefined : 'av-slide-view--compact'}
              />
            </div>
          </button>
        )
      })}
      </div>
      <AvBackgroundSelector
        preset={backgroundLayer.preset}
        previewText={backgroundPreviewLine}
        contentLayer={contentLayer}
        onSelectPreset={onSelectBackgroundPreset}
      />
    </div>
  )
}
