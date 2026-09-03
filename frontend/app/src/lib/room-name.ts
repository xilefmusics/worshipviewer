const ROOM_NAME_VERBS = [
  'Praise',
  'Sing',
  'Worship',
  'Pray',
  'Rejoice',
  'Glorify',
  'Exalt',
  'Serve',
  'Gather',
  'Celebrate',
  'Proclaim',
] as const

const ROOM_NAME_NOUNS = [
  'Hymn',
  'Psalm',
  'Chorus',
  'Grace',
  'Hallelujah',
  'Amen',
  'Light',
  'Song',
  'Praise',
  'Gospel',
  'Worship',
] as const

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

export function randomRoomName(): string {
  return `${pickRandom(ROOM_NAME_VERBS)} ${pickRandom(ROOM_NAME_NOUNS)}`
}
