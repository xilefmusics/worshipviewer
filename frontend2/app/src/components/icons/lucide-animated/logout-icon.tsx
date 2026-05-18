import type { Variants } from 'motion/react'
import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react'

import { cn } from '@/lib/utils'

/** Lucide Animated (MIT) — https://github.com/pqoqubbw/icons */
export interface LogoutIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface LogoutIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const PATH_VARIANTS: Variants = {
  normal: {
    x: 0,
    translateX: 0,
  },
  animate: {
    x: 2,
    translateX: [0, -3, 0],
    transition: {
      duration: 0.4,
    },
  },
}

export const LogoutIcon = forwardRef<LogoutIconHandle, LogoutIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, isHovered, ...props }, ref) => {
    const controls = useAnimation()
    const external = isHovered !== undefined

    useImperativeHandle(ref, () => ({
      startAnimation: () => controls.start('animate'),
      stopAnimation: () => controls.start('normal'),
    }))

    useEffect(() => {
      if (!external) return
      if (isHovered) {
        void controls.start('animate')
      } else {
        void controls.start('normal')
      }
    }, [external, isHovered, controls])

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (external) return
        void controls.start('animate')
        onMouseEnter?.(e)
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
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <motion.polyline
            animate={controls}
            points="16 17 21 12 16 7"
            variants={PATH_VARIANTS}
          />
          <motion.line
            animate={controls}
            variants={PATH_VARIANTS}
            x1="21"
            x2="9"
            y1="12"
            y2="12"
          />
        </svg>
      </div>
    )
  },
)

LogoutIcon.displayName = 'LogoutIcon'
