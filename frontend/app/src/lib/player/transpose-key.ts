import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'

/** Step a musical key by semitones within the chromatic circle. */
export function stepMusicalKey(key: string, delta: number): string | null {
  const idx = MUSICAL_KEYS.indexOf(key as (typeof MUSICAL_KEYS)[number])
  if (idx === -1) return null
  const next = ((idx + delta) % 12 + 12) % 12
  return MUSICAL_KEYS[next]
}

/** Transpose from a resolved display key, or null when no valid starting key. */
export function resolveTransposeKey(
  displayKey: string | null | undefined,
  delta: 1 | -1,
): string | null {
  if (!displayKey) return null
  return stepMusicalKey(displayKey, delta)
}
