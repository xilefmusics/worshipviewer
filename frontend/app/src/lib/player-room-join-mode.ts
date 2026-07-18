import type { PlayerRoomMode } from '@/lib/player-room'

export type PlayerRoomJoinModeChoice = 'chords' | 'text' | 'av' | 'slide'

export function playerRoomJoinModeChoiceToWire(mode: PlayerRoomJoinModeChoice): {
  mode: PlayerRoomMode
  hideChords: boolean
} {
  if (mode === 'av') return { mode: 'av', hideChords: false }
  if (mode === 'slide') return { mode: 'slide', hideChords: false }
  if (mode === 'text') return { mode: 'sheet', hideChords: true }
  return { mode: 'sheet', hideChords: false }
}
