/** Internal reducer for the replacement room protocol. */
export type RoomChange =
  | { type: 'selection'; song: number; slide: number; activate: boolean }
  | { type: 'vote'; song: number; voted: boolean }

export type RoomMessage = {
  id: string
  room_id: string
  visit_id: string
  order: { epoch: number; sequence: number }
  change: RoomChange
}

type SongState = { played: boolean; voters: Set<string> }
export type RoomReplay = {
  roomId: string
  slideCounts: number[]
  songs: SongState[]
  selection: { song: number; slide: number } | null
  lastOrder: RoomMessage['order'] | null
  seen: Map<string, RoomMessage>
}

export function createRoomReplay(roomId: string, slideCounts: number[]): RoomReplay {
  return { roomId, slideCounts: [...slideCounts], songs: slideCounts.map(() => ({ played: false, voters: new Set() })), selection: null, lastOrder: null, seen: new Map() }
}

function sameMessage(a: RoomMessage, b: RoomMessage): boolean {
  const sameChange = a.change.type === b.change.type && a.change.song === b.change.song && (
    a.change.type === 'selection' && b.change.type === 'selection'
      ? a.change.slide === b.change.slide && a.change.activate === b.change.activate
      : a.change.type === 'vote' && b.change.type === 'vote' && a.change.voted === b.change.voted
  )
  return a.id === b.id && a.room_id === b.room_id && a.visit_id === b.visit_id && a.order.epoch === b.order.epoch && a.order.sequence === b.order.sequence && sameChange
}

/** Returns a new state; a replay with missing messages is still valid. */
export function applyRoomMessage(state: RoomReplay, message: RoomMessage): RoomReplay {
  if (message.room_id !== state.roomId || !message.id || !message.visit_id || !Number.isSafeInteger(message.order.epoch) || message.order.epoch <= 0 || !Number.isSafeInteger(message.order.sequence) || message.order.sequence <= 0) throw new Error('Invalid room message')
  const previous = state.seen.get(message.id)
  if (previous) {
    if (!sameMessage(previous, message)) throw new Error('Conflicting room message ID')
    return state
  }
  const { epoch, sequence } = message.order
  if (state.lastOrder && (epoch < state.lastOrder.epoch || (epoch === state.lastOrder.epoch && sequence <= state.lastOrder.sequence))) throw new Error('Room message out of order')
  const { song } = message.change
  if (!Number.isSafeInteger(song) || song < 0 || song >= state.songs.length) throw new Error('Invalid song')
  if (message.change.type === 'selection' && (!Number.isSafeInteger(message.change.slide) || message.change.slide < 0 || message.change.slide >= state.slideCounts[song])) throw new Error('Invalid slide')
  const songs = [...state.songs]
  const selected = songs[song]
  const updated = { played: selected.played, voters: new Set(selected.voters) }
  songs[song] = updated
  let selection = state.selection
  if (message.change.type === 'selection') {
    selection = { song, slide: message.change.slide }
    if (message.change.activate) { updated.played = true; updated.voters.clear() }
  } else if (message.change.voted) {
    updated.voters.add(message.visit_id)
    updated.played = false
  } else updated.voters.delete(message.visit_id)
  const seen = new Map(state.seen)
  seen.set(message.id, message)
  return { ...state, songs, selection, lastOrder: message.order, seen }
}

export function rankRoomSongs(state: RoomReplay): number[] {
  return state.songs.map((_, index) => index).sort((a, b) => Number(state.songs[a].played) - Number(state.songs[b].played) || state.songs[b].voters.size - state.songs[a].voters.size || a - b)
}
