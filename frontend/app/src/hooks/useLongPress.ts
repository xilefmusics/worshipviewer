import { useCallback, useRef } from 'react'

/**
 * ~500 ms hold → `onLongPress`. Cancels on release or cancel; on mouse, also cancels on leave.
 */
export function useLongPress(
  onLongPress: (event: React.PointerEvent<HTMLElement>, target: HTMLElement) => void,
  options?: { delayMs?: number },
) {
  const delayMs = options?.delayMs ?? 500
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activePointerId = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    activePointerId.current = null
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      clear()
      activePointerId.current = e.pointerId
      const target = e.currentTarget
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        activePointerId.current = null
        try {
          navigator.vibrate?.(10)
        } catch {
          /* no-op on unsupported platforms (e.g. iOS) */
        }
        onLongPress(e, target)
      }, delayMs)
    },
    [clear, delayMs, onLongPress],
  )

  const onPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (activePointerId.current !== e.pointerId) return
      clear()
    },
    [clear],
  )

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse') return
      onPointerEnd(e)
    },
    [onPointerEnd],
  )

  return {
    onPointerDown,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onPointerLeave,
  }
}
