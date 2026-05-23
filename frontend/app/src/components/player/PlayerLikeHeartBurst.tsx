import { motion, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'

const INSTAGRAM_HEART = '#ed4956'

type PlayerLikeHeartBurstProps = {
  onFinished?: () => void
}

export function PlayerLikeHeartBurst({ onFinished }: PlayerLikeHeartBurstProps) {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) onFinished?.()
  }, [onFinished, reduceMotion])

  if (reduceMotion) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      aria-hidden
    >
      <motion.svg
        width={96}
        height={96}
        viewBox="0 0 24 24"
        className="drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.28, 1], opacity: [0, 1, 0] }}
        transition={{
          duration: 0.9,
          times: [0, 0.22, 1],
          ease: [0.175, 0.885, 0.32, 1.275],
        }}
        onAnimationComplete={onFinished}
      >
        <path
          d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
          fill={INSTAGRAM_HEART}
          stroke="#fff"
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
      </motion.svg>
    </div>
  )
}
