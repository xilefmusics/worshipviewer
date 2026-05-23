import type { Transition } from 'motion/react'
import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react'

import { cn } from '@/lib/utils'

/** Lucide “monitor-play”; Motion pattern matches other lucide-animated icons in this app. */
export interface OutputIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface OutputIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const SPRING: Transition = {
  type: 'spring',
  stiffness: 220,
  damping: 18,
}

export const OutputIcon = forwardRef<OutputIconHandle, OutputIconProps>(
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
          <motion.rect
            animate={controls}
            height="14"
            rx="2"
            transition={SPRING}
            variants={{
              normal: { y: 0, opacity: 1 },
              animate: { y: -0.5, opacity: 0.92 },
            }}
            width="20"
            x="2"
            y="3"
          />
          <motion.path
            animate={controls}
            d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.278l-3.664 2.25a.75.75 0 0 1-1.142-.64z"
            fill="currentColor"
            stroke="none"
            transition={SPRING}
            variants={{
              normal: { scale: 1, opacity: 1 },
              animate: { scale: 1.12, opacity: 1 },
            }}
          />
          <motion.path
            animate={controls}
            d="M8 21h8M12 17v4"
            transition={SPRING}
            variants={{
              normal: { y: 0 },
              animate: { y: 0.35 },
            }}
          />
        </svg>
      </div>
    )
  },
)

OutputIcon.displayName = 'OutputIcon'
