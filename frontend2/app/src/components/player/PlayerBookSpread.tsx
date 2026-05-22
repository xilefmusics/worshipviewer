import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { bookSpreadLayout } from '@/lib/chord-a4-scale'

type PlayerBookSpreadProps = {
  left: ReactNode
  right?: ReactNode
}

export function PlayerBookSpread({ left, right }: PlayerBookSpreadProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
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

  const hasTwoPages = right != null
  const layout = useMemo(
    () => bookSpreadLayout(viewportSize.width, viewportSize.height, hasTwoPages),
    [hasTwoPages, viewportSize.height, viewportSize.width],
  )

  return (
    <div ref={containerRef} className="player-book-spread">
      <div
        className="player-book-spread__wrapper"
        style={
          layout.width > 0 && layout.height > 0
            ? { width: layout.width, height: layout.height }
            : undefined
        }
      >
        <div className="player-book-spread__page" style={{ width: layout.pageWidth }}>
          {left}
        </div>
        {right ? (
          <div className="player-book-spread__page" style={{ width: layout.pageWidth }}>
            {right}
          </div>
        ) : null}
      </div>
    </div>
  )
}
