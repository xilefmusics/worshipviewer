import type { Variants } from 'motion/react'
import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react'

import { cn } from '@/lib/utils'

export interface MessageSquareIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface MessageSquareIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const BUBBLE_VARIANTS: Variants = {
  normal: { y: 0, scale: 1 },
  animate: {
    y: [0, -1, 0],
    scale: [1, 1.04, 1],
    transition: { duration: 0.4, ease: 'easeOut' },
  },
}

const MESSAGE_LINE_VARIANTS: Variants = {
  normal: { pathLength: 1 },
  animate: {
    pathLength: [0, 1],
    transition: { duration: 0.3, ease: 'easeOut' },
  },
}

export const MessageSquareIcon = forwardRef<MessageSquareIconHandle, MessageSquareIconProps>(
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
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (external) return
        void controls.start('animate')
        onMouseEnter?.(event)
      },
      [controls, external, onMouseEnter],
    )

    const handleMouseLeave = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (external) return
        void controls.start('normal')
        onMouseLeave?.(event)
      },
      [controls, external, onMouseLeave],
    )

    return (
      <div
        className={cn('inline-flex', className)}
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
            d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5l-4 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
            variants={BUBBLE_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M8 10h8"
            variants={MESSAGE_LINE_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M8 14h5"
            variants={{
              ...MESSAGE_LINE_VARIANTS,
              animate: {
                ...MESSAGE_LINE_VARIANTS.animate,
                transition: { duration: 0.3, delay: 0.12, ease: 'easeOut' },
              },
            }}
          />
        </svg>
      </div>
    )
  },
)

MessageSquareIcon.displayName = 'MessageSquareIcon'
