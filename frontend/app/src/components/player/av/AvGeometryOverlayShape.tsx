import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'

import { cn } from '@/lib/utils'
import type { AvGeometryOverlay } from '@/lib/player/av-preferences'

type BackgroundCutout = { key: string; clipPath: string }
const GEOMETRY_OVERLAY_MAX_SCALE = 1.28
const HEART_OVERLAY_MAX_SCALE = 1.38
const FULL_HEIGHT_OVERLAY_MAX_SCALE = 10 / 7

type SlicedRectangleLayout = {
  panelWidth: number
  gapWidth: number
  groupWidth: number
}

function slicedRectangleLayout(thickness: number, panelCount: 3 | 4): SlicedRectangleLayout {
  const fourPanelWidth = 10 + thickness * 0.1363636364
  const fourPanelGap = (100 - fourPanelWidth * 4) / 3
  const scale = panelCount === 3 ? 0.8 : 1
  const panelWidth = fourPanelWidth * scale
  const gapWidth = fourPanelGap * scale

  return {
    panelWidth,
    gapWidth,
    groupWidth: panelWidth * panelCount + gapWidth * (panelCount - 1),
  }
}

type AvGeometryOverlayShapeProps = {
  overlay: Exclude<AvGeometryOverlay, 'none'>
  opacity?: number
  color?: number
  size?: number
  thickness?: number
  rotatedBackground?: boolean
  videoSrc?: string
  backgroundImageSrc?: string
  masterVideoRef?: RefObject<HTMLVideoElement | null>
  className?: string
}

function crossClipPath(): string {
  const x = 'var(--av-geometry-overlay-bar-half-thickness-x, 4.2%)'
  const y = 'var(--av-geometry-overlay-bar-half-thickness-y, 7.47%)'
  const horizontalTop = `calc(36.7% - ${y})`
  const horizontalBottom = `calc(36.7% + ${y})`
  return `polygon(
    calc(50% - ${x}) 15%, calc(50% + ${x}) 15%,
    calc(50% + ${x}) ${horizontalTop}, 69.6% ${horizontalTop},
    69.6% ${horizontalBottom}, calc(50% + ${x}) ${horizontalBottom},
    calc(50% + ${x}) 85%, calc(50% - ${x}) 85%,
    calc(50% - ${x}) ${horizontalBottom}, 30.4% ${horizontalBottom},
    30.4% ${horizontalTop}, calc(50% - ${x}) ${horizontalTop}
  )`
}

const HEART_POINTS = (() => {
  const samples = Array.from({ length: 96 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2
    const sine = Math.sin(angle)
    const rawY = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle)
    return { x: 50 + 50 * sine ** 3, rawY }
  })
  const minY = Math.min(...samples.map(({ rawY }) => rawY))
  const maxY = Math.max(...samples.map(({ rawY }) => rawY))
  return samples.map(({ x, rawY }) => ({
    x: Math.abs(x - 50) < 0.001 ? 50 : x,
    y: ((maxY - rawY) / (maxY - minY)) * 100,
  }))
})()

function heartClipPath(forCanvas = false): string {
  const polygon = HEART_POINTS.map(({ x, y }) => {
    const horizontal = forCanvas
      ? x === 50
        ? '50%'
        : `calc(50% ${x < 50 ? '-' : '+'} ${Math.abs(x - 50) * 0.7}cqh)`
      : `${x}%`
    const vertical = forCanvas ? `${15 + y * 0.7}%` : `${y}%`
    return `${horizontal} ${vertical}`
  }).join(', ')
  return `polygon(${polygon})`
}

function geometryBackgroundCutouts(overlay: Exclude<AvGeometryOverlay, 'none'>, thickness: number): BackgroundCutout[] {
  if (overlay === 'gospel') return []
  const crossX = 'var(--av-geometry-overlay-bar-half-thickness-x, 4.2%)'
  if (overlay === 'cross') return [{ key: 'cross', clipPath: crossClipPath() }]
  if (overlay === 'inverted_cross') {
    const crossY = 'var(--av-geometry-overlay-bar-half-thickness-y, 4.2%)'
    return [
      {
        key: 'top-left',
        clipPath: `inset(15% calc(50% + ${crossX}) calc(63.3% + ${crossY}) 30.4%)`,
      },
      {
        key: 'top-right',
        clipPath: `inset(15% 30.4% calc(63.3% + ${crossY}) calc(50% + ${crossX}))`,
      },
      {
        key: 'bottom-left',
        clipPath: `inset(calc(36.7% + ${crossY}) calc(50% + ${crossX}) 15% 30.4%)`,
      },
      {
        key: 'bottom-right',
        clipPath: `inset(calc(36.7% + ${crossY}) 30.4% 15% calc(50% + ${crossX}))`,
      },
    ]
  }
  if (overlay === 'sliced_square') {
    return [
      {
        key: 'left',
        clipPath: 'inset(15% calc(50% + 35cqh - var(--av-geometry-overlay-sliced-square-panel-width, 30.8cqh)) 15% calc(50% - 35cqh))',
      },
      {
        key: 'right',
        clipPath: 'inset(15% calc(50% - 35cqh) 15% calc(50% + 35cqh - var(--av-geometry-overlay-sliced-square-panel-width, 30.8cqh)))',
      },
    ]
  }
  if (overlay === 'sliced_rectangle' || overlay === 'sliced_rectangle_three') {
    const panelCount = overlay === 'sliced_rectangle_three' ? 3 : 4
    const layout = slicedRectangleLayout(thickness, panelCount)
    const panelWidth = layout.panelWidth * 0.7
    const gap = layout.gapWidth * 0.7
    const groupWidth = layout.groupWidth * 0.7
    return Array.from({ length: panelCount }, (_, index) => {
      const left = 50 - groupWidth / 2 + index * (panelWidth + gap)
      const right = 100 - left - panelWidth
      return { key: `panel-${index + 1}`, clipPath: `inset(15% ${right}% 15% ${left}%)` }
    })
  }
  if (overlay === 'circle') return [{ key: 'circle', clipPath: 'circle(35cqh at 50% 50%)' }]
  if (overlay === 'square') {
    return [{ key: 'square', clipPath: 'inset(15% calc(50% - 35cqh) 15% calc(50% - 35cqh))' }]
  }
  if (overlay === 'rectangle') return [{ key: 'rectangle', clipPath: 'inset(15% 15%)' }]
  if (overlay === 'triangle') {
    return [{ key: 'triangle', clipPath: 'polygon(50% 15%, calc(50% + 35cqh) 85%, calc(50% - 35cqh) 85%)' }]
  }
  if (overlay === 'inverted_triangle') {
    return [{ key: 'inverted-triangle', clipPath: 'polygon(calc(50% - 35cqh) 15%, calc(50% + 35cqh) 15%, 50% 85%)' }]
  }
  if (overlay === 'diamond') {
    return [{ key: 'diamond', clipPath: 'polygon(50% 15%, calc(50% + 35cqh) 50%, 50% 85%, calc(50% - 35cqh) 50%)' }]
  }

  return [{ key: 'heart', clipPath: heartClipPath(true) }]
}

function RotatedBackgroundFill({
  src,
  poster,
  masterVideoRef,
  clipPath,
}: {
  src?: string
  poster?: string
  masterVideoRef?: RefObject<HTMLVideoElement | null>
  clipPath: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const master = masterVideoRef?.current
    const video = videoRef.current
    if (!master || !video) return

    const syncPlayback = () => {
      if (
        master.readyState >= HTMLMediaElement.HAVE_METADATA &&
        video.readyState >= HTMLMediaElement.HAVE_METADATA &&
        Math.abs(master.currentTime - video.currentTime) > 0.2
      ) {
        video.currentTime = master.currentTime
      }
      if (master.paused) video.pause()
      else if (video.paused) void video.play().catch(() => undefined)
    }

    master.addEventListener('timeupdate', syncPlayback)
    master.addEventListener('seeking', syncPlayback)
    master.addEventListener('seeked', syncPlayback)
    master.addEventListener('play', syncPlayback)
    master.addEventListener('pause', syncPlayback)
    video.addEventListener('loadedmetadata', syncPlayback)
    syncPlayback()

    return () => {
      master.removeEventListener('timeupdate', syncPlayback)
      master.removeEventListener('seeking', syncPlayback)
      master.removeEventListener('seeked', syncPlayback)
      master.removeEventListener('play', syncPlayback)
      master.removeEventListener('pause', syncPlayback)
      video.removeEventListener('loadedmetadata', syncPlayback)
    }
  }, [masterVideoRef, src])

  return src ? (
    <div className="av-geometry-overlay__background-cutout" style={{ clipPath } as CSSProperties}>
      <video
        ref={videoRef}
        className="av-geometry-overlay__background-fill"
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        crossOrigin="use-credentials"
        preload="auto"
        aria-hidden
      />
    </div>
  ) : poster ? (
    <div className="av-geometry-overlay__background-cutout" style={{ clipPath } as CSSProperties}>
      <img
        className="av-geometry-overlay__background-fill"
        src={poster}
        alt=""
        crossOrigin="use-credentials"
      />
    </div>
  ) : null
}

export function AvGeometryOverlayShape({
  overlay,
  opacity = 77,
  color = 77,
  size = 77,
  thickness = 77,
  rotatedBackground = false,
  videoSrc,
  backgroundImageSrc,
  masterVideoRef,
  className,
}: AvGeometryOverlayShapeProps) {
  const clampedOpacity = Math.max(0, Math.min(100, opacity))
  const clampedColor = Math.max(0, Math.min(100, color))
  const clampedSize = Math.max(0, Math.min(100, size))
  const clampedThickness = Math.max(0, Math.min(100, thickness))
  const crossStemHalfThickness = 2 + clampedThickness * 0.08
  const crossHorizontalHalfThickness = crossStemHalfThickness * (16 / 9)
  const slicedRectanglePanelCount = overlay === 'sliced_rectangle_three' ? 3 : 4
  const slicedRectangleDimensions = slicedRectangleLayout(clampedThickness, slicedRectanglePanelCount)
  const overlayScale = clampedSize / 64
  const geometryOverlayMaxScale = overlay === 'rectangle' ||
    overlay === 'square' ||
    overlay === 'circle' ||
    overlay === 'cross' ||
    overlay === 'inverted_cross' ||
    overlay === 'triangle' ||
    overlay === 'inverted_triangle' ||
    overlay === 'diamond' ||
    overlay === 'sliced_square' ||
    overlay === 'sliced_rectangle' ||
    overlay === 'sliced_rectangle_three'
    ? FULL_HEIGHT_OVERLAY_MAX_SCALE
    : overlay === 'heart'
      ? HEART_OVERLAY_MAX_SCALE
      : GEOMETRY_OVERLAY_MAX_SCALE
  const geometryOverlayScale = overlay === 'gospel'
    ? overlayScale
    : Math.min(overlayScale, geometryOverlayMaxScale)
  const backgroundCutouts = geometryBackgroundCutouts(overlay, clampedThickness)
  const hasRotatedBackgroundFill = overlay !== 'gospel' && rotatedBackground && Boolean(videoSrc || backgroundImageSrc)
  const rotatedBackgroundStyle = {
    '--av-geometry-overlay-opacity': clampedOpacity / 100,
    '--av-geometry-overlay-scale': geometryOverlayScale,
    '--av-geometry-overlay-bar-half-thickness-x': `${crossStemHalfThickness * 0.7}%`,
    '--av-geometry-overlay-bar-half-thickness-y': `${crossHorizontalHalfThickness * 0.7}%`,
    '--av-geometry-overlay-sliced-square-panel-width': `${(27.25 + clampedThickness * 0.2175) * 0.7}cqh`,
  } as CSSProperties

  return (
    <div
      className={cn(
        'av-geometry-overlay',
        `av-geometry-overlay--${overlay}`,
        hasRotatedBackgroundFill && 'av-geometry-overlay--rotated-background',
        className,
      )}
      aria-hidden
      data-testid={`av-geometry-overlay-${overlay}`}
      data-opacity={clampedOpacity}
      data-color={clampedColor}
      data-size={clampedSize}
      data-thickness={clampedThickness}
      data-rotated-background={rotatedBackground}
      style={{
        '--av-geometry-overlay-opacity': clampedOpacity / 100,
        '--av-geometry-overlay-grayscale': clampedOpacity === 0
          ? 0
          : (100 - clampedColor) / 100,
        '--av-geometry-overlay-scale': geometryOverlayScale,
        '--av-geometry-overlay-bar-half-thickness-x': `${crossStemHalfThickness}%`,
        '--av-geometry-overlay-bar-half-thickness-y': `${crossHorizontalHalfThickness}%`,
        ...rotatedBackgroundStyle,
      } as CSSProperties}
    >
      <div className="av-geometry-overlay__canvas">
        {hasRotatedBackgroundFill ? backgroundCutouts.map((cutout) => (
          <RotatedBackgroundFill
            key={cutout.key}
            src={videoSrc}
            poster={backgroundImageSrc}
            masterVideoRef={masterVideoRef}
            clipPath={cutout.clipPath}
          />
        )) : overlay === 'gospel' ? (
          <div className="av-geometry-overlay__gospel-symbols">
            <span className="av-geometry-overlay__gospel-symbol">♥︎</span>
            <span className="av-geometry-overlay__gospel-symbol">÷</span>
            <span className="av-geometry-overlay__gospel-symbol">✝︎</span>
            <span className="av-geometry-overlay__gospel-symbol">?</span>
          </div>
        ) : overlay === 'sliced_rectangle' || overlay === 'sliced_rectangle_three' ? (
          <div
            className={cn(
              'av-geometry-overlay__sliced-rectangle',
              overlay === 'sliced_rectangle_three' && 'av-geometry-overlay__sliced-rectangle--three',
            )}
            style={{
              top: '15%',
              left: overlay === 'sliced_rectangle_three' ? '50%' : '15%',
              width: overlay === 'sliced_rectangle_three'
                ? `${slicedRectangleDimensions.groupWidth * 0.7}%`
                : '70%',
              height: '70%',
              transform: overlay === 'sliced_rectangle_three' ? 'translateX(-50%)' : undefined,
              '--av-geometry-overlay-slice-width': `${overlay === 'sliced_rectangle_three'
                ? (slicedRectangleDimensions.panelWidth / slicedRectangleDimensions.groupWidth) * 100
                : slicedRectangleDimensions.panelWidth}%`,
            } as CSSProperties}
          >
            {Array.from({ length: slicedRectanglePanelCount }, (_, index) => (
              <span key={index} className="av-geometry-overlay__sliced-rectangle-panel" />
            ))}
          </div>
        ) : overlay === 'sliced_square' ? (
          <div
            className="av-geometry-overlay__sliced-square"
            style={{
              top: '15%',
              left: '50%',
              width: '70cqh',
              height: '70%',
              transform: 'translateX(-50%)',
              aspectRatio: '1 / 1',
            }}
          >
            <span className="av-geometry-overlay__sliced-square-panel av-geometry-overlay__sliced-square-panel--left" />
            <span className="av-geometry-overlay__sliced-square-panel av-geometry-overlay__sliced-square-panel--right" />
          </div>
        ) : overlay === 'cross' || overlay === 'inverted_cross' ? (
          <div className="av-geometry-overlay__cross" style={{ inset: '15%' }}>
            {overlay === 'cross' ? (
              <span className="av-geometry-overlay__cross-shape" />
            ) : (
              <>
                <span className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--top-left" />
                <span className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--top-right" />
                <span className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--bottom-left" />
                <span className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--bottom-right" />
              </>
            )}
          </div>
        ) : (
          <span
            className={cn('av-geometry-overlay__shape', `av-geometry-overlay__shape--${overlay}`)}
            style={overlay === 'rectangle'
              ? { top: '15%', left: '15%', width: '70%', height: '70%' }
              : {
                  top: '15%',
                  left: '50%',
                  width: '70cqh',
                  height: '70%',
                  transform: 'translateX(-50%)',
                  aspectRatio: '1 / 1',
                  ...(overlay === 'heart' ? { clipPath: heartClipPath() } : {}),
                }}
          />
        )}
      </div>
    </div>
  )
}
