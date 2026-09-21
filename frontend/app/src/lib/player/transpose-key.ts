import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'

export const TRANSPOSE_OFFSETS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const

export function formatTransposeOffset(offset: number): string {
  return offset > 0 ? `+${offset}` : String(offset)
}

/** Format the user-facing interval from the played key up to the selected key. */
export function formatPlayedKeyOffset(offset: number): string {
  return formatTransposeOffset(-offset)
}

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

/** Resolve the signed semitone distance in the -5…+6 range. */
export function transposeOffsetBetweenKeys(
  baseKey: string | null | undefined,
  soundingKey: string | null | undefined,
): number | null {
  if (!baseKey || !soundingKey) return null
  const baseIndex = MUSICAL_KEYS.indexOf(baseKey as (typeof MUSICAL_KEYS)[number])
  const soundingIndex = MUSICAL_KEYS.indexOf(soundingKey as (typeof MUSICAL_KEYS)[number])
  if (baseIndex === -1 || soundingIndex === -1) return null
  return (((soundingIndex - baseIndex + 5) % 12) + 12) % 12 - 5
}
