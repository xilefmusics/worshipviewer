import type { Transition } from 'motion/react'
import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react'

import { cn } from '@/lib/utils'

/** Animated door icon for a room. */
export interface RoomIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface RoomIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const TRANSITION: Transition = {
  type: 'spring',
  stiffness: 240,
  damping: 18,
}

export const RoomIcon = forwardRef<RoomIconHandle, RoomIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, isHovered, ...props }, ref) => {
    const controls = useAnimation()
    const external = isHovered !== undefined

    useImperativeHandle(ref, () => ({
      startAnimation: () => controls.start('animate'),
      stopAnimation: () => controls.start('normal'),
    }))

    useEffect(() => {
      if (!external) return
      void controls.start(isHovered ? 'animate' : 'normal')
    }, [controls, external, isHovered])

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
          <path d="M3 21h18" />
          <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
          <motion.path
            animate={controls}
            d="M6 21 15 19V7L6 5Z"
            transition={TRANSITION}
            variants={{
              normal: { x: 0 },
              animate: { x: -1 },
            }}
          />
          <motion.circle
            animate={controls}
            cx="12.5"
            cy="14"
            r="0.75"
            transition={TRANSITION}
            variants={{
              normal: { x: 0 },
              animate: { x: -1 },
            }}
          />
        </svg>
      </div>
    )
  },
)

RoomIcon.displayName = 'RoomIcon'
