import type { Transition } from 'motion/react'
import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react'

import { cn } from '@/lib/utils'

/** Lucide Animated (MIT) — https://github.com/pqoqubbw/icons */
export interface LayersIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface LayersIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  /** When set, drives animation from a parent hover target (e.g. full tab link). */
  isHovered?: boolean
}

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 14,
  mass: 1,
}

export const LayersIcon = forwardRef<LayersIconHandle, LayersIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, isHovered, ...props }, ref) => {
    const controls = useAnimation()
    const external = isHovered !== undefined

    useImperativeHandle(ref, () => ({
      startAnimation: async () => {
        await controls.start('firstState')
        await controls.start('secondState')
      },
      stopAnimation: () => controls.start('normal'),
    }))

    useEffect(() => {
      if (!external) return
      let cancelled = false
      async function run() {
        if (isHovered) {
          await controls.start('firstState')
          if (!cancelled) await controls.start('secondState')
        } else {
          await controls.start('normal')
        }
      }
      void run()
      return () => {
        cancelled = true
      }
    }, [external, isHovered, controls])

    const handleMouseEnter = useCallback(
      async (e: React.MouseEvent<HTMLDivElement>) => {
        if (external) return
        onMouseEnter?.(e)
        await controls.start('firstState')
        await controls.start('secondState')
      },
      [controls, external, onMouseEnter],
    )

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (external) return
        void controls.start('normal')
        onMouseLeave?.(e)
      },
      [controls, external, onMouseLeave],
    )

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <motion.path
            animate={controls}
            d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { y: 0 },
              firstState: { y: -9 },
              secondState: { y: 0 },
            }}
          />
          <motion.path
            animate={controls}
            d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { y: 0 },
              firstState: { y: -5 },
              secondState: { y: 0 },
            }}
          />
        </svg>
      </div>
    )
  },
)

LayersIcon.displayName = 'LayersIcon'
