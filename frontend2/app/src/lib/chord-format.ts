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
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): ChordFormatPreference {
  return resolveChordFormatPreference(storage.getItem(CHORD_FORMAT_STORAGE_KEY))
}

export function writeChordFormatPreference(
  preference: ChordFormatPreference,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): void {
  storage.setItem(CHORD_FORMAT_STORAGE_KEY, preference)
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(new CustomEvent(CHORD_FORMAT_CHANGE_EVENT, { detail: preference }))
  }
}
