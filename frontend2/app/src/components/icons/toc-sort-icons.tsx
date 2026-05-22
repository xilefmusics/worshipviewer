import type { Transition } from 'motion/react'
import { motion, useAnimation } from 'motion/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { useCallback, useEffect } from 'react'

import { cn } from '@/lib/utils'

type TocSortIconProps = HTMLAttributes<HTMLDivElement> & {
  size?: number
  isHovered?: boolean
}

const SPRING: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 16,
  mass: 0.9,
}

function TocSortIconShell({
  isHovered,
  size = 16,
  className,
  onMouseEnter,
  onMouseLeave,
  children,
  ...props
}: TocSortIconProps & { children: (controls: ReturnType<typeof useAnimation>) => ReactNode }) {
  const controls = useAnimation()
  const external = isHovered !== undefined

  useEffect(() => {
    if (!external) return
    let cancelled = false
    async function run() {
      if (isHovered) {
        await controls.start('animate')
        if (!cancelled) await controls.start('settle')
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
      await controls.start('animate')
      await controls.start('settle')
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
      className={cn('inline-flex', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children(controls)}
      </svg>
    </div>
  )
}

/** Lucide `list-ordered` — lines sweep in when active/hovered. */
export function TocSortOrderIcon({ isHovered, size, className, ...props }: TocSortIconProps) {
  return (
    <TocSortIconShell isHovered={isHovered} size={size} className={className} {...props}>
      {(controls) => (
        <>
          <motion.path
            animate={controls}
            d="M10 6h11"
            transition={{ ...SPRING, delay: 0 }}
            variants={{
              normal: { scaleX: 1, x: 0 },
              animate: { scaleX: 0.55, x: -2 },
              settle: { scaleX: 1, x: 0 },
            }}
            style={{ transformOrigin: '10px 6px', transformBox: 'fill-box' }}
          />
          <motion.path
            animate={controls}
            d="M10 12h11"
            transition={{ ...SPRING, delay: 0.04 }}
            variants={{
              normal: { scaleX: 1, x: 0 },
              animate: { scaleX: 0.55, x: -2 },
              settle: { scaleX: 1, x: 0 },
            }}
            style={{ transformOrigin: '10px 12px', transformBox: 'fill-box' }}
          />
          <motion.path
            animate={controls}
            d="M10 18h11"
            transition={{ ...SPRING, delay: 0.08 }}
            variants={{
              normal: { scaleX: 1, x: 0 },
              animate: { scaleX: 0.55, x: -2 },
              settle: { scaleX: 1, x: 0 },
            }}
            style={{ transformOrigin: '10px 18px', transformBox: 'fill-box' }}
          />
          <motion.path
            animate={controls}
            d="M4 10h2"
            transition={SPRING}
            variants={{
              normal: { y: 0 },
              animate: { y: -1 },
              settle: { y: 0 },
            }}
          />
          <motion.path
            animate={controls}
            d="M4 6h1v4"
            transition={SPRING}
            variants={{
              normal: { y: 0 },
              animate: { y: -1 },
              settle: { y: 0 },
            }}
          />
          <motion.path
            animate={controls}
            d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"
            transition={SPRING}
            variants={{
              normal: { y: 0 },
              animate: { y: 1 },
              settle: { y: 0 },
            }}
          />
        </>
      )}
    </TocSortIconShell>
  )
}

/** A→Z — arrow bounces, letters pulse when active/hovered. */
export function TocSortAlphabeticalIcon({ isHovered, size, className, ...props }: TocSortIconProps) {
  return (
    <TocSortIconShell isHovered={isHovered} size={size} className={className} {...props}>
      {(controls) => (
        <>
          <motion.path
            animate={controls}
            d="M6 5v10"
            transition={SPRING}
            variants={{
              normal: { pathLength: 1 },
              animate: { pathLength: 0.75 },
              settle: { pathLength: 1 },
            }}
          />
          <motion.path
            animate={controls}
            d="m4 13 2 2 2-2"
            transition={SPRING}
            variants={{
              normal: { y: 0 },
              animate: { y: 2 },
              settle: { y: 0 },
            }}
          />
          <motion.text
            animate={controls}
            x="16"
            y="10.5"
            fill="currentColor"
            stroke="none"
            fontSize="7.5"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            textAnchor="middle"
            transition={SPRING}
            variants={{
              normal: { scale: 1 },
              animate: { scale: 1.15 },
              settle: { scale: 1 },
            }}
            style={{ transformOrigin: '16px 10.5px', transformBox: 'fill-box' }}
          >
            A
          </motion.text>
          <motion.text
            animate={controls}
            x="16"
            y="19"
            fill="currentColor"
            stroke="none"
            fontSize="7.5"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            textAnchor="middle"
            transition={{ ...SPRING, delay: 0.05 }}
            variants={{
              normal: { scale: 1 },
              animate: { scale: 1.15 },
              settle: { scale: 1 },
            }}
            style={{ transformOrigin: '16px 19px', transformBox: 'fill-box' }}
          >
            Z
          </motion.text>
        </>
      )}
    </TocSortIconShell>
  )
}

/** Lucide `heart` — pulse when active/hovered (lucide-animated pattern). */
export function TocSortLikedIcon({ isHovered, size, className, ...props }: TocSortIconProps) {
  return (
    <TocSortIconShell isHovered={isHovered} size={size} className={className} {...props}>
      {(controls) => (
        <motion.path
          animate={controls}
          d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
          transition={{ duration: 0.45 }}
          variants={{
            normal: { scale: 1 },
            animate: { scale: [1, 1.12, 1] },
            settle: { scale: 1 },
          }}
          style={{ transformOrigin: '12px 12px', transformBox: 'fill-box' }}
        />
      )}
    </TocSortIconShell>
  )
}
