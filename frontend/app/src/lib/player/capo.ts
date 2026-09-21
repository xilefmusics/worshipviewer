import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'

export const CAPO_SHAPE_KEYS = ['G', 'C', 'E', 'D', 'A'] as const
export const CAPO_FRET_MIN = 1
export const CAPO_FRET_MAX = 11

export type CapoShapeKey = (typeof MUSICAL_KEYS)[number]

export type PlayerKeyState = {
  soundingKey: string | null
  displayKey: string | null
  capoShapeKey: CapoShapeKey | null
  capoFret: number | null
}

export function isCapoShapeKey(value: unknown): value is CapoShapeKey {
  return typeof value === 'string' && (MUSICAL_KEYS as readonly string[]).includes(value)
}

/** Return the capo fret that makes the selected shape sound as the target key. */
export function capoFretForKeys(
  soundingKey: string | null | undefined,
  shapeKey: string | null | undefined,
): number | null {
  const soundingIndex = soundingKey == null ? -1 : MUSICAL_KEYS.indexOf(soundingKey as (typeof MUSICAL_KEYS)[number])
  const shapeIndex = shapeKey == null ? -1 : MUSICAL_KEYS.indexOf(shapeKey as (typeof MUSICAL_KEYS)[number])
  if (soundingIndex === -1 || shapeIndex === -1) return null
  return (soundingIndex - shapeIndex + MUSICAL_KEYS.length) % MUSICAL_KEYS.length
}

/** Resolve the chord-rendering key and capo metadata for one player item. */
export function resolvePlayerKeyState(
  baseKey: string | null | undefined,
  soundingKeyOverride: string | null | undefined,
  capoShapeKey: string | null | undefined,
): PlayerKeyState {
  const soundingKey = soundingKeyOverride || baseKey || null
  if (!isCapoShapeKey(capoShapeKey) || capoFretForKeys(soundingKey, capoShapeKey) == null) {
    return {
      soundingKey,
      displayKey: soundingKey,
      capoShapeKey: null,
      capoFret: null,
    }
  }

  return {
    soundingKey,
    displayKey: capoShapeKey,
    capoShapeKey,
    capoFret: capoFretForKeys(soundingKey, capoShapeKey),
  }
}
