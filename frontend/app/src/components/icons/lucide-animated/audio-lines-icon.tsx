import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react'

import { cn } from '@/lib/utils'

/** Lucide Animated (MIT) — https://github.com/pqoqubbw/icons */
export interface AudioLinesIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface AudioLinesIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

export const AudioLinesIcon = forwardRef<AudioLinesIconHandle, AudioLinesIconProps>(
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

    const pathInitial = external ? (isHovered ? 'animate' : 'normal') : 'normal'

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
          <path d="M2 10v3" />
          <motion.path
            animate={controls}
            d="M6 6v11"
            initial={pathInitial}
            variants={{
              normal: { d: 'M6 6v11' },
              animate: {
                d: ['M6 6v11', 'M6 10v3', 'M6 6v11'],
                transition: {
                  duration: 1.5,
                  repeat: Number.POSITIVE_INFINITY,
                },
              },
            }}
          />
          <motion.path
            animate={controls}
            d="M10 3v18"
            initial={pathInitial}
            variants={{
              normal: { d: 'M10 3v18' },
              animate: {
                d: ['M10 3v18', 'M10 9v5', 'M10 3v18'],
                transition: {
                  duration: 1,
                  repeat: Number.POSITIVE_INFINITY,
                },
              },
            }}
          />
          <motion.path
            animate={controls}
            d="M14 8v7"
            initial={pathInitial}
            variants={{
              normal: { d: 'M14 8v7' },
              animate: {
                d: ['M14 8v7', 'M14 6v11', 'M14 8v7'],
                transition: {
                  duration: 0.8,
                  repeat: Number.POSITIVE_INFINITY,
                },
              },
            }}
          />
          <motion.path
            animate={controls}
            d="M18 5v13"
            initial={pathInitial}
            variants={{
              normal: { d: 'M18 5v13' },
              animate: {
                d: ['M18 5v13', 'M18 7v9', 'M18 5v13'],
                transition: {
                  duration: 1.5,
                  repeat: Number.POSITIVE_INFINITY,
                },
              },
            }}
          />
          <path d="M22 10v3" />
        </svg>
      </div>
    )
  },
)

AudioLinesIcon.displayName = 'AudioLinesIcon'
