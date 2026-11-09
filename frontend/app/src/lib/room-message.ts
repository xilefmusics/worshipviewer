import type { RoomAvConfiguration, RoomBackground } from '@/lib/room-message-api'

/** Internal reducer for the replacement room protocol. */
export type RoomChange =
  | { type: 'selection'; song: number; section?: number; slide: number; activate: boolean }
  | { type: 'vote'; song: number; voted: boolean }
  | { type: 'set_background'; background: RoomBackground }
  | { type: 'set_av_configuration'; configuration: RoomAvConfiguration }

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
  sectionCounts: number[]
  songs: SongState[]
  selection: { song: number; section: number; slide: number } | null
  background: RoomBackground | null
  avConfiguration: RoomAvConfiguration | null
  lastOrder: RoomMessage['order'] | null
  seen: Map<string, RoomMessage>
}

export function createRoomReplay(roomId: string, sectionCounts: number[]): RoomReplay {
  return { roomId, sectionCounts: [...sectionCounts], songs: sectionCounts.map(() => ({ played: false, voters: new Set() })), selection: null, background: null, avConfiguration: null, lastOrder: null, seen: new Map() }
}

function sameAvConfiguration(a: RoomAvConfiguration, b: RoomAvConfiguration): boolean {
  const leftLanguages = Object.entries(a.language_by_item).sort(([left], [right]) => Number(left) - Number(right))
  const rightLanguages = Object.entries(b.language_by_item).sort(([left], [right]) => Number(left) - Number(right))
  return a.content_layer.max_lines_per_slide === b.content_layer.max_lines_per_slide &&
    a.content_layer.balance_slide_lines === b.content_layer.balance_slide_lines &&
    a.content_layer.font_size === b.content_layer.font_size &&
    a.content_layer.text_align === b.content_layer.text_align &&
    a.content_layer.vertical_align === b.content_layer.vertical_align &&
    a.content_layer.horizontal_align === b.content_layer.horizontal_align &&
    a.content_layer.text_shadow === b.content_layer.text_shadow &&
    a.content_layer.text_transform === b.content_layer.text_transform &&
    a.content_layer.primary_text_lightness === b.content_layer.primary_text_lightness &&
    a.content_layer.secondary_text_lightness === b.content_layer.secondary_text_lightness &&
    a.transition.style === b.transition.style && a.transition.duration_ms === b.transition.duration_ms &&
    a.bilingual_enabled === b.bilingual_enabled &&
    a.collapse_lyric_whitespace === b.collapse_lyric_whitespace &&
    a.screen_state === b.screen_state &&
    leftLanguages.length === rightLanguages.length &&
    leftLanguages.every(([key, value], index) => key === rightLanguages[index]?.[0] && value === rightLanguages[index]?.[1])
}

function sameMessage(a: RoomMessage, b: RoomMessage): boolean {
  if (a.change.type !== b.change.type) return false
  let sameChange = false
  if (a.change.type === 'selection' && b.change.type === 'selection') {
    sameChange = a.change.song === b.change.song && a.change.section === b.change.section &&
      a.change.slide === b.change.slide && a.change.activate === b.change.activate
  } else if (a.change.type === 'vote' && b.change.type === 'vote') {
    sameChange = a.change.song === b.change.song && a.change.voted === b.change.voted
  } else if (a.change.type === 'set_background' && b.change.type === 'set_background') {
    const left = a.change.background
    const right = b.change.background
    sameChange = left.preset === right.preset &&
      left.image?.media_id === right.image?.media_id && left.image?.asset_id === right.image?.asset_id
  } else if (a.change.type === 'set_av_configuration' && b.change.type === 'set_av_configuration') {
    sameChange = sameAvConfiguration(a.change.configuration, b.change.configuration)
  }
  return a.id === b.id && a.room_id === b.room_id && a.visit_id === b.visit_id && a.order.epoch === b.order.epoch && a.order.sequence === b.order.sequence && sameChange
}

function validRoomBackground(background: RoomBackground): boolean {
  return Number.isSafeInteger(background.preset) && background.preset >= 0 && background.preset <= 4 &&
    (background.image == null || (
      typeof background.image.media_id === 'string' && background.image.media_id.trim().length > 0 && background.image.media_id.length <= 128 &&
      typeof background.image.asset_id === 'string' && background.image.asset_id.trim().length > 0 && background.image.asset_id.length <= 128
    ))
}

function validRoomAvConfiguration(configuration: RoomAvConfiguration, songCount: number): boolean {
  const content = configuration.content_layer
  const transition = configuration.transition
  return Number.isSafeInteger(content.max_lines_per_slide) && content.max_lines_per_slide >= 1 && content.max_lines_per_slide <= 10 &&
    typeof content.balance_slide_lines === 'boolean' &&
    Number.isSafeInteger(content.font_size) && content.font_size >= 20 && content.font_size <= 120 &&
    ['left', 'center', 'right'].includes(content.text_align) &&
    ['top', 'center', 'bottom'].includes(content.vertical_align) &&
    ['left', 'center', 'right'].includes(content.horizontal_align) &&
    ['none', 'subtle', 'medium', 'strong'].includes(content.text_shadow) &&
    ['none', 'uppercase', 'lowercase', 'capitalize'].includes(content.text_transform) &&
    Number.isSafeInteger(content.primary_text_lightness) && content.primary_text_lightness >= 0 && content.primary_text_lightness <= 100 &&
    Number.isSafeInteger(content.secondary_text_lightness) && content.secondary_text_lightness >= 0 && content.secondary_text_lightness <= 100 &&
    ['none', 'fade', 'slide'].includes(transition.style) &&
    Number.isSafeInteger(transition.duration_ms) && transition.duration_ms >= 0 && transition.duration_ms <= 2000 &&
    typeof configuration.bilingual_enabled === 'boolean' &&
    typeof configuration.collapse_lyric_whitespace === 'boolean' &&
    ['live', 'blank', 'blackout'].includes(configuration.screen_state) &&
    configuration.language_by_item != null && typeof configuration.language_by_item === 'object' && !Array.isArray(configuration.language_by_item) &&
    Object.entries(configuration.language_by_item).length <= songCount &&
    Object.entries(configuration.language_by_item).every(([song, language]) => Number.isSafeInteger(Number(song)) && Number(song) >= 0 && Number(song) < songCount && Number.isSafeInteger(language) && language >= 0 && language <= 255)
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
  let songs = state.songs
  let selection = state.selection
  let background = state.background
  let avConfiguration = state.avConfiguration
  if (message.change.type === 'set_background') {
    if (!validRoomBackground(message.change.background)) throw new Error('Invalid background')
    background = message.change.background
  } else if (message.change.type === 'set_av_configuration') {
    if (!validRoomAvConfiguration(message.change.configuration, state.sectionCounts.length)) throw new Error('Invalid AV configuration')
    avConfiguration = message.change.configuration
  } else {
    const { song } = message.change
    if (!Number.isSafeInteger(song) || song < 0 || song >= state.songs.length) throw new Error('Invalid song')
    if (message.change.type === 'selection') {
      const section = message.change.section ?? message.change.slide
      if (!Number.isSafeInteger(section) || section < 0 || section >= state.sectionCounts[song]) throw new Error('Invalid section')
      if (!Number.isSafeInteger(message.change.slide) || message.change.slide < 0) throw new Error('Invalid slide')
    }
    songs = [...state.songs]
    const selected = songs[song]
    const updated = { played: selected.played, voters: new Set(selected.voters) }
    songs[song] = updated
    if (message.change.type === 'selection') {
      const legacyMessage = message.change.section == null
      selection = {
        song,
        section: message.change.section ?? message.change.slide,
        slide: legacyMessage ? 0 : message.change.slide,
      }
      if (message.change.activate) { updated.played = true; updated.voters.clear() }
    } else if (message.change.voted) {
      updated.voters.add(message.visit_id)
      updated.played = false
    } else updated.voters.delete(message.visit_id)
  }
  const seen = new Map(state.seen)
  seen.set(message.id, message)
  return { ...state, songs, selection, background, avConfiguration, lastOrder: message.order, seen }
}

export function rankRoomSongs(state: RoomReplay): number[] {
  return state.songs.map((_, index) => index).sort((a, b) => Number(state.songs[a].played) - Number(state.songs[b].played) || state.songs[b].voters.size - state.songs[a].voters.size || a - b)
}
