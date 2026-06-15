import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'
import type { ChordRepresentation } from '@/ports/chord-engine'

export const CHORD_FORMAT_STORAGE_KEY = 'wv_chord_format'

export const CHORD_FORMAT_CHANGE_EVENT = 'wv-chord-format-change'

export type ChordFormatPreference = 'letters' | 'nashville'

export function resolveChordFormatPreference(value: string | null): ChordFormatPreference {
  if (value === 'nashville') return 'nashville'
  return 'letters'
}

export function chordFormatToRepresentation(preference: ChordFormatPreference): ChordRepresentation {
  return preference === 'nashville' ? 'nashville' : 'default'
}

export function readChordFormatPreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): ChordFormatPreference {
  return resolveChordFormatPreference(safeGetItem(CHORD_FORMAT_STORAGE_KEY, storage))
}

export function writeChordFormatPreference(
  preference: ChordFormatPreference,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  safeSetItem(CHORD_FORMAT_STORAGE_KEY, preference, storage)
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(new CustomEvent(CHORD_FORMAT_CHANGE_EVENT, { detail: preference }))
  }
}
