import { motion, useReducedMotion } from 'motion/react'

/** Minimal full-screen loading state used during session bootstrap and query restore. */
export function SessionLoadingFallback({ label }: { label: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-[var(--color-muted-foreground)]"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <motion.span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted-foreground)]/55"
        aria-hidden
        animate={
          reduceMotion ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.9, 1, 0.9] }
        }
        transition={
          reduceMotion ? undefined : { duration: 1.05, repeat: Infinity, ease: 'easeInOut' }
        }
      />
      <span>{label}</span>
    </motion.div>
  )
}
