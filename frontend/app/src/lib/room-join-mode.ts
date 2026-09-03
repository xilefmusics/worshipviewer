import type { RoomMode } from '@/lib/room'

export type RoomJoinModeChoice = 'chords' | 'text' | 'av' | 'slide'

export function roomJoinModeChoiceToWire(mode: RoomJoinModeChoice): {
  mode: RoomMode
  hideChords: boolean
} {
  if (mode === 'av') return { mode: 'av', hideChords: false }
  if (mode === 'slide') return { mode: 'slide', hideChords: false }
  if (mode === 'text') return { mode: 'sheet', hideChords: true }
  return { mode: 'sheet', hideChords: false }
}
