import { useEffect, useRef, useState } from 'react'

import {
  AV_SLIDE_DESIGN_HEIGHT_PX,
  AV_SLIDE_DESIGN_WIDTH_PX,
  avSlideScaleToFitViewport,
} from '@/lib/player/av-slide-scale'

type AvSlideScaledStageProps = {
  children: React.ReactNode
}

export function AvSlideScaledStage({ children }: AvSlideScaledStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = stageRef.current
    if (!el) return

    const updateSize = () => {
      const rect = el.getBoundingClientRect()
      setViewportSize({ width: rect.width, height: rect.height })
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    updateSize()
    return () => observer.disconnect()
  }, [])

  const scale = avSlideScaleToFitViewport(viewportSize.width, viewportSize.height)

  return (
    <div ref={stageRef} className="av-slide-view__stage">
      {scale != null ? (
        <div
          className="av-slide-view__scaled-slot"
          style={{
            width: AV_SLIDE_DESIGN_WIDTH_PX * scale,
            height: AV_SLIDE_DESIGN_HEIGHT_PX * scale,
          }}
        >
          <div
            className="av-slide-view__scaled-canvas"
            style={{
              width: AV_SLIDE_DESIGN_WIDTH_PX,
              height: AV_SLIDE_DESIGN_HEIGHT_PX,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            {children}
          </div>
        </div>
      ) : null}
    </div>
  )
}
