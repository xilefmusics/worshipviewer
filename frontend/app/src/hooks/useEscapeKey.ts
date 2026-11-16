import { useEffect } from 'react'

/** Runs a callback for an unhandled Escape key while enabled. */
export function useEscapeKey(enabled: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return

      event.preventDefault()
      onEscape()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onEscape])
}
