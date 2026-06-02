import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import type {
  AvBackgroundLayer as AvBackgroundLayerPrefs,
  AvContentLayer,
  AvScreenState,
  AvTransition,
} from '@/lib/player/av-preferences'
import { effectiveAvTransition } from '@/lib/player/av-preferences'
import { AvBackgroundLayer } from '@/components/player/av/AvBackgroundLayer'
import { AvSlideContent } from '@/components/player/av/AvSlideContent'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvSlideViewProps = {
  contentText: string
  contentLayer: AvContentLayer
  backgroundLayer: AvBackgroundLayerPrefs
  transition: AvTransition
  screenState: AvScreenState
  className?: string
  compact?: boolean
  /** When false, omit the projection background (for UI thumbnails over a checkerboard). */
  showBackground?: boolean
  /** Operator sidebar preview: no transition, px-sized lyrics. */
  preview?: boolean
}

export function AvSlideView({
  contentText,
  contentLayer,
  backgroundLayer,
  transition,
  screenState,
  className,
  compact = false,
  showBackground = true,
  preview = false,
}: AvSlideViewProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const effectiveTransition = effectiveAvTransition(transition, reduceMotion ?? false)
  const duration = effectiveTransition.durationMs / 1000

  if (screenState === 'blackout') {
    return <div className={cn('av-slide-view av-slide-view--blackout', className)} aria-hidden />
  }

  if (screenState === 'blank') {
    return (
      <div className={cn('av-slide-view', className)} aria-hidden>
        {showBackground ? (
          <AvBackgroundLayer layer={backgroundLayer} className="av-slide-view__background" />
        ) : null}
        <p className="sr-only">{t('player.av.blankOn')}</p>
      </div>
    )
  }

  const slideBody = (
    <AvSlideContent
      text={contentText}
      contentLayer={contentLayer}
      compact={compact}
      preview={preview}
    />
  )

  return (
    <div className={cn('av-slide-view', preview && 'av-slide-view--preview', className)}>
      {showBackground ? (
        <AvBackgroundLayer layer={backgroundLayer} className="av-slide-view__background" />
      ) : null}
      <div className="av-slide-view__content">
        {preview ? (
          <div className="h-full w-full">{slideBody}</div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={contentText}
              initial={
                effectiveTransition.style === 'none'
                  ? false
                  : effectiveTransition.style === 'slide'
                    ? { opacity: 0, x: 24 }
                    : { opacity: 0 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={
                effectiveTransition.style === 'none'
                  ? undefined
                  : effectiveTransition.style === 'slide'
                    ? { opacity: 0, x: -24 }
                    : { opacity: 0 }
              }
              transition={{ duration }}
              className="h-full w-full"
            >
              {slideBody}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
