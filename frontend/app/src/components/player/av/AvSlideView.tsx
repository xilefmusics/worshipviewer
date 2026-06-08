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
import { AvSlideScaledStage } from '@/components/player/av/AvSlideScaledStage'
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
  /** Operator sidebar preview: no transition animation. */
  preview?: boolean
}

function AvSlideCanvas({
  contentText,
  contentLayer,
  backgroundLayer,
  compact,
  showBackground,
}: Pick<
  AvSlideViewProps,
  'contentText' | 'contentLayer' | 'backgroundLayer' | 'compact' | 'showBackground'
>) {
  return (
    <>
      {showBackground ? (
        <AvBackgroundLayer layer={backgroundLayer} className="av-slide-view__background" />
      ) : null}
      <div className="av-slide-view__content">
        <AvSlideContent
          text={contentText}
          contentLayer={contentLayer}
          compact={compact}
        />
      </div>
    </>
  )
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
        {compact ? (
          showBackground ? (
            <AvBackgroundLayer layer={backgroundLayer} className="av-slide-view__background" />
          ) : null
        ) : (
          <AvSlideScaledStage>
            {showBackground ? (
              <AvBackgroundLayer
                layer={backgroundLayer}
                className="av-slide-view__background"
              />
            ) : null}
          </AvSlideScaledStage>
        )}
        <p className="sr-only">{t('player.av.blankOn')}</p>
      </div>
    )
  }

  const slideBody = (
    <AvSlideCanvas
      contentText={contentText}
      contentLayer={contentLayer}
      backgroundLayer={backgroundLayer}
      compact={compact}
      showBackground={showBackground}
    />
  )

  if (compact) {
    return <div className={cn('av-slide-view', className)}>{slideBody}</div>
  }

  return (
    <div className={cn('av-slide-view', preview && 'av-slide-view--preview', className)}>
      <AvSlideScaledStage>
        {preview ? (
          slideBody
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
              className="av-slide-view__animated-layer"
            >
              {slideBody}
            </motion.div>
          </AnimatePresence>
        )}
      </AvSlideScaledStage>
    </div>
  )
}
