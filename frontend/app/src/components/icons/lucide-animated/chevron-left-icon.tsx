import type { Transition } from 'motion/react'
import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useImperativeHandle } from 'react'

import { cn } from '@/lib/utils'

export interface ChevronLeftIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface ChevronLeftIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const DEFAULT_TRANSITION: Transition = {
  times: [0, 0.4, 1],
  duration: 0.5,
}

/** Lucide Animated (MIT) — https://lucide-animated.com/icons/chevron-left */
export const ChevronLeftIcon = forwardRef<ChevronLeftIconHandle, ChevronLeftIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation()

    useImperativeHandle(ref, () => ({
      startAnimation: () => controls.start('animate'),
      stopAnimation: () => controls.start('normal'),
    }))

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        void controls.start('animate')
        onMouseEnter?.(e)
      },
      [controls, onMouseEnter],
    )

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        void controls.start('normal')
        onMouseLeave?.(e)
      },
      [controls, onMouseLeave],
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
          <motion.path
            animate={controls}
            d="m15 18-6-6 6-6"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x: 0 },
              animate: { x: [0, -2, 0] },
            }}
          />
        </svg>
      </div>
    )
  },
)

ChevronLeftIcon.displayName = 'ChevronLeftIcon'
