import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { mediaAssetDataUrl } from '@/api/media-upload'
import type {
  AvBackgroundLayer as AvBackgroundLayerPrefs,
  AvContentLayer,
  AvGeometryOverlay,
  AvScreenState,
  AvTransition,
} from '@/lib/player/av-preferences'
import type { AvLyricLine } from '@/lib/player/av-lyric-slides'
import { effectiveAvTransition } from '@/lib/player/av-preferences'
import { formatAvTimerRemaining } from '@/lib/player/av-timer'
import { AvBackgroundLayer } from '@/components/player/av/AvBackgroundLayer'
import { AvSlideContent } from '@/components/player/av/AvSlideContent'
import { AvSlideScaledStage } from '@/components/player/av/AvSlideScaledStage'
import { MediaDeckPageView } from '@/components/media/MediaDeckPageView'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvSlideViewProps = {
  contentText?: string
  contentLines?: AvLyricLine[]
  markdown?: string
  deckPage?: { mediaId: string; assetId: string }
  onDeckPageStatus?: (status: 'ready' | 'error') => void
  timedPreview?: {
    kind: 'video' | 'audio' | 'youtube' | 'livestream' | 'web_page'
    title: string
    video?: { mediaId: string; assetId: string; thumbnailAssetId?: string }
  }
  videoPreviewRef?: RefObject<HTMLVideoElement | null>
  videoPreviewPlaying?: boolean
  onVideoPreviewProgress?: (progress: {
    mediaId: string
    assetId: string
    currentTimeMs: number
    durationMs: number
  }) => void
  countdownEndsAtMs?: number
  countdownRemainingMs?: number
  contentLayer: AvContentLayer
  backgroundLayer: AvBackgroundLayerPrefs
  geometryOverlay?: AvGeometryOverlay
  geometryOverlayOpacity?: number
  geometryOverlayColor?: number
  geometryOverlaySize?: number
  geometryOverlayThickness?: number
  geometryOverlayRotatedBackground?: boolean
  fallbackBackgroundLayer?: AvBackgroundLayerPrefs
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
  contentLines,
  markdown,
  deckPage,
  onDeckPageStatus,
  timedPreview,
  videoPreviewRef,
  videoPreviewPlaying = false,
  onVideoPreviewProgress,
  countdownEndsAtMs,
  countdownRemainingMs,
  contentLayer,
  backgroundLayer,
  geometryOverlay,
  geometryOverlayOpacity,
  geometryOverlayColor,
  geometryOverlaySize,
  geometryOverlayThickness,
  geometryOverlayRotatedBackground,
  fallbackBackgroundLayer,
  compact,
  showBackground,
  preview,
}: Pick<
  AvSlideViewProps,
  | 'contentText'
  | 'contentLines'
  | 'markdown'
  | 'deckPage'
  | 'onDeckPageStatus'
  | 'timedPreview'
  | 'videoPreviewRef'
  | 'videoPreviewPlaying'
  | 'onVideoPreviewProgress'
  | 'countdownEndsAtMs'
  | 'countdownRemainingMs'
  | 'contentLayer'
  | 'backgroundLayer'
  | 'geometryOverlay'
  | 'geometryOverlayOpacity'
  | 'geometryOverlayColor'
  | 'geometryOverlaySize'
  | 'geometryOverlayThickness'
  | 'geometryOverlayRotatedBackground'
  | 'fallbackBackgroundLayer'
  | 'compact'
  | 'showBackground'
  | 'preview'
>) {
  const videoPreview = timedPreview?.kind === 'video' ? timedPreview.video : undefined
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (countdownEndsAtMs == null) return
    const refresh = window.setTimeout(() => setNow(Date.now()), 0)
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => {
      window.clearTimeout(refresh)
      window.clearInterval(interval)
    }
  }, [countdownEndsAtMs])

  useEffect(() => {
    const video = videoPreviewRef?.current
    if (!video) return
    if (!videoPreviewPlaying) {
      video.pause()
      return
    }
    void video.play().catch(() => undefined)
  }, [timedPreview?.kind, videoPreview?.mediaId, videoPreview?.assetId, videoPreviewPlaying, videoPreviewRef])

  return (
    <>
      {showBackground && !deckPage ? (
        <AvBackgroundLayer
          layer={backgroundLayer}
          geometryOverlay={geometryOverlay}
          geometryOverlayOpacity={geometryOverlayOpacity}
          geometryOverlayColor={geometryOverlayColor}
          geometryOverlaySize={geometryOverlaySize}
          geometryOverlayThickness={geometryOverlayThickness}
          geometryOverlayRotatedBackground={geometryOverlayRotatedBackground}
          fallbackLayer={fallbackBackgroundLayer}
          className="av-slide-view__background"
          videoPreview={compact || preview}
        />
      ) : null}
      <div className="av-slide-view__content">
        {countdownEndsAtMs != null || countdownRemainingMs != null ? (
          <div
            className="av-slide-view__countdown"
            role="timer"
            aria-label={formatAvTimerRemaining(
              countdownEndsAtMs != null
                ? Math.max(0, countdownEndsAtMs - now)
                : countdownRemainingMs ?? 0,
            )}
            data-testid="av-countdown"
          >
            <AvSlideContent
              text={formatAvTimerRemaining(
                countdownEndsAtMs != null
                  ? Math.max(0, countdownEndsAtMs - now)
                  : countdownRemainingMs ?? 0,
              )}
              contentLayer={{ ...contentLayer, fontSize: contentLayer.fontSize * 3 }}
              geometryOverlay={geometryOverlay}
              geometryOverlaySize={geometryOverlaySize}
              className="av-slide-view__countdown-text"
            />
          </div>
        ) : deckPage ? (
          <div className="av-slide-view__deck-page">
            <MediaDeckPageView
              mediaId={deckPage.mediaId}
              blobId={deckPage.assetId}
              label=""
              variant="contain"
              onStatus={onDeckPageStatus}
            />
          </div>
        ) : timedPreview ? (
          videoPreview ? (
            <video
              ref={videoPreviewRef}
              className="av-slide-view__video-preview"
              src={mediaAssetDataUrl(videoPreview.mediaId, videoPreview.assetId)}
              poster={videoPreview.thumbnailAssetId
                ? mediaAssetDataUrl(videoPreview.mediaId, videoPreview.thumbnailAssetId)
                : undefined}
              autoPlay={videoPreviewPlaying}
              loop
              muted
              playsInline
              preload="metadata"
              data-media-id={videoPreview.mediaId}
              data-asset-id={videoPreview.assetId}
              data-testid="av-timed-video-preview"
              aria-label={timedPreview.title}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget
                onVideoPreviewProgress?.(
                  {
                    mediaId: videoPreview.mediaId,
                    assetId: videoPreview.assetId,
                    currentTimeMs: Math.round(video.currentTime * 1000),
                    durationMs: Number.isFinite(video.duration)
                      ? Math.round(video.duration * 1000)
                      : 0,
                  },
                )
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget
                onVideoPreviewProgress?.(
                  {
                    mediaId: videoPreview.mediaId,
                    assetId: videoPreview.assetId,
                    currentTimeMs: Math.round(video.currentTime * 1000),
                    durationMs: Number.isFinite(video.duration)
                      ? Math.round(video.duration * 1000)
                      : 0,
                  },
                )
              }}
            />
          ) : (
            <p className="av-slide-view__timed-preview" data-testid="av-timed-preview">
              {timedPreview.title}
            </p>
          )
        ) : (
          <AvSlideContent
            text={contentLines ? undefined : contentText}
            markdown={markdown}
            lines={contentLines}
            contentLayer={contentLayer}
            geometryOverlay={geometryOverlay}
            geometryOverlaySize={geometryOverlaySize}
            compact={compact}
            adaptiveWidth
          />
        )}
      </div>
    </>
  )
}

export function AvSlideView({
  contentText,
  contentLines,
  markdown,
  deckPage,
  onDeckPageStatus,
  timedPreview,
  videoPreviewRef,
  videoPreviewPlaying,
  onVideoPreviewProgress,
  countdownEndsAtMs,
  countdownRemainingMs,
  contentLayer,
  backgroundLayer,
  geometryOverlay,
  geometryOverlayOpacity,
  geometryOverlayColor,
  geometryOverlaySize,
  geometryOverlayThickness,
  geometryOverlayRotatedBackground,
  fallbackBackgroundLayer,
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

  if (screenState === 'blank' && !deckPage) {
    return (
      <div className={cn('av-slide-view', className)} aria-hidden>
        {compact ? (
          showBackground ? (
            <AvBackgroundLayer
              layer={backgroundLayer}
              geometryOverlay={geometryOverlay}
              geometryOverlayOpacity={geometryOverlayOpacity}
              geometryOverlayColor={geometryOverlayColor}
              geometryOverlaySize={geometryOverlaySize}
              geometryOverlayThickness={geometryOverlayThickness}
              geometryOverlayRotatedBackground={geometryOverlayRotatedBackground}
              fallbackLayer={fallbackBackgroundLayer}
              className="av-slide-view__background"
              videoPreview={compact}
            />
          ) : null
        ) : (
          <AvSlideScaledStage>
            {showBackground ? (
              <AvBackgroundLayer
                layer={backgroundLayer}
                geometryOverlay={geometryOverlay}
                geometryOverlayOpacity={geometryOverlayOpacity}
                geometryOverlayColor={geometryOverlayColor}
                geometryOverlaySize={geometryOverlaySize}
                geometryOverlayThickness={geometryOverlayThickness}
                geometryOverlayRotatedBackground={geometryOverlayRotatedBackground}
                fallbackLayer={fallbackBackgroundLayer}
                className="av-slide-view__background"
                videoPreview={preview}
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
      contentLines={contentLines}
      markdown={markdown}
      deckPage={deckPage}
      onDeckPageStatus={onDeckPageStatus}
      timedPreview={timedPreview}
      videoPreviewRef={videoPreviewRef}
      videoPreviewPlaying={videoPreviewPlaying}
      onVideoPreviewProgress={onVideoPreviewProgress}
      countdownEndsAtMs={countdownEndsAtMs}
      countdownRemainingMs={countdownRemainingMs}
      contentLayer={contentLayer}
      backgroundLayer={backgroundLayer}
      geometryOverlay={geometryOverlay}
      geometryOverlayOpacity={geometryOverlayOpacity}
      geometryOverlayColor={geometryOverlayColor}
      geometryOverlaySize={geometryOverlaySize}
      geometryOverlayThickness={geometryOverlayThickness}
      geometryOverlayRotatedBackground={geometryOverlayRotatedBackground}
      fallbackBackgroundLayer={fallbackBackgroundLayer}
      compact={compact}
      showBackground={compact || preview || Boolean(deckPage) ? showBackground : false}
      preview={preview}
    />
  )

  if (compact) {
    return (
      <div
        className={cn(
          'av-slide-view',
          deckPage && 'av-slide-view--deck',
          !showBackground && 'av-slide-view--transparent-preview',
          className,
        )}
      >
        {slideBody}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'av-slide-view',
        deckPage && 'av-slide-view--deck',
        preview && 'av-slide-view--preview',
        !showBackground && 'av-slide-view--transparent-preview',
        className,
      )}
    >
      <AvSlideScaledStage>
        {preview || deckPage ? (
          slideBody
        ) : (
          <>
            {showBackground ? (
              <AvBackgroundLayer
                layer={backgroundLayer}
                geometryOverlay={geometryOverlay}
                geometryOverlayOpacity={geometryOverlayOpacity}
                geometryOverlayColor={geometryOverlayColor}
                geometryOverlaySize={geometryOverlaySize}
                geometryOverlayThickness={geometryOverlayThickness}
                geometryOverlayRotatedBackground={geometryOverlayRotatedBackground}
                fallbackLayer={fallbackBackgroundLayer}
                className="av-slide-view__background"
                videoPreview={preview}
              />
            ) : null}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={
                  markdown ?? contentText ?? contentLines?.map((line) => line.primary).join('\n') ?? ''
                }
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
          </>
        )}
      </AvSlideScaledStage>
      {screenState === 'blank' && deckPage ? (
        <div className="av-slide-view__blank-overlay">
          <AvBackgroundLayer
            layer={backgroundLayer}
            geometryOverlay={geometryOverlay}
            geometryOverlayOpacity={geometryOverlayOpacity}
            geometryOverlayColor={geometryOverlayColor}
            geometryOverlaySize={geometryOverlaySize}
            geometryOverlayThickness={geometryOverlayThickness}
            geometryOverlayRotatedBackground={geometryOverlayRotatedBackground}
            fallbackLayer={fallbackBackgroundLayer}
            className="av-slide-view__blank-background"
            videoPreview={preview}
          />
          <p className="sr-only">{t('player.av.blankOn')}</p>
        </div>
      ) : null}
    </div>
  )
}
