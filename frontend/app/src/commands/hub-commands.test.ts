import { describe, expect, it } from 'vitest'

import { hubNavigateCommands } from '@/commands/hub-commands'

describe('hub navigation commands', () => {
  it('keeps Teams and Player Rooms as unique searchable destinations', () => {
    const relevant = hubNavigateCommands.filter((command) =>
      command.id === 'teams' || command.id === 'player-rooms',
    )

    expect(relevant).toEqual([
      expect.objectContaining({
        id: 'player-rooms',
        labelKey: 'hub.tabs.playerRooms',
        to: '/player-rooms',
      }),
      expect.objectContaining({
        id: 'teams',
        labelKey: 'hub.profile.teams',
        to: '/teams',
      }),
    ])
    expect(relevant[0]?.keywords).toEqual(
      expect.arrayContaining(['player rooms', 'player-rooms', 'rooms', 'player-räume', 'räume']),
    )
    expect(relevant[1]?.keywords).toEqual(expect.arrayContaining(['team', 'teams']))
    expect(new Set(relevant.map((command) => command.to)).size).toBe(2)
  })
})
