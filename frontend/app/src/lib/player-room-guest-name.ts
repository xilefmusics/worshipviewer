const WORSHIP_GUEST_ADJECTIVES = [
  'Passionate',
  'Joyful',
  'Thankful',
  'Faithful',
  'Humble',
  'Reverent',
  'Grateful',
  'Devoted',
  'Radiant',
  'Hopeful',
  'Peaceful',
  'Earnest',
  'Loving',
  'Praising',
  'Singing',
  'Anointed',
  'Blessed',
  'Gentle',
  'Bold',
  'Spirit-led',
] as const

const WORSHIP_GUEST_NOUNS = [
  'Worshipper',
  'Singer',
  'Psalmist',
  'Believer',
  'Saint',
  'Servant',
  'Heart',
  'Voice',
  'Vessel',
  'Disciple',
  'Worshiper',
  'Minister',
  'Praiser',
  'Hymnist',
] as const

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

export function randomPlayerRoomGuestDisplayName(): string {
  return `${pickRandom(WORSHIP_GUEST_ADJECTIVES)} ${pickRandom(WORSHIP_GUEST_NOUNS)}`
}
