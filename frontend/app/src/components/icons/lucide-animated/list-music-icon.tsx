import type { Transition } from 'motion/react'
import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react'

import { cn } from '@/lib/utils'

/** Lucide list-music paths + Motion — same pattern as Lucide Animated (https://github.com/pqoqubbw/icons). */
export interface ListMusicIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface ListMusicIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 16,
  mass: 0.9,
}

export const ListMusicIcon = forwardRef<ListMusicIconHandle, ListMusicIconProps>(
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
          <motion.path
            animate={controls}
            d="M21 15V6"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { y: 0 },
              firstState: { y: -1 },
              secondState: { y: 0 },
            }}
          />
          <motion.path
            animate={controls}
            d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { y: 0, opacity: 1 },
              firstState: { y: -0.35, opacity: 0.88 },
              secondState: { y: 0, opacity: 1 },
            }}
          />
          <motion.path
            animate={controls}
            d="M12 12H3"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x: 0 },
              firstState: { x: 1.5 },
              secondState: { x: 0 },
            }}
          />
          <motion.path
            animate={controls}
            d="M16 6H3"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x: 0 },
              firstState: { x: 1.5 },
              secondState: { x: 0 },
            }}
          />
          <motion.path
            animate={controls}
            d="M12 18H3"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x: 0 },
              firstState: { x: 1.5 },
              secondState: { x: 0 },
            }}
          />
        </svg>
      </div>
    )
  },
)

ListMusicIcon.displayName = 'ListMusicIcon'
