import { describe, expect, it } from 'vitest'

import {
  buildRoomSettingsReturnNavigation,
  buildSettingsSearch,
  parseRoomSettingsReturnSearch,
} from '@/lib/settings-route'

describe('settings-route', () => {
  it('round-trips a room return destination through settings search', () => {
    const settingsSearch = buildSettingsSearch('playerRoles', null, {
      roomId: 'room-42',
      mode: 'slide',
    })

    expect(settingsSearch).toEqual({
      tab: 'playerRoles',
      roomReturnId: 'room-42',
      roomReturnMode: 'slide',
    })
    const roomReturn = parseRoomSettingsReturnSearch(settingsSearch)
    expect(roomReturn).toEqual({ roomId: 'room-42', mode: 'slide' })
    if (!roomReturn) throw new Error('Expected room return context')
    expect(buildSettingsSearch('general', null, roomReturn)).toEqual({
      tab: 'general',
      roomReturnId: 'room-42',
      roomReturnMode: 'slide',
    })
    expect(buildRoomSettingsReturnNavigation(roomReturn)).toEqual({
      to: '/rooms/$roomId',
      params: { roomId: 'room-42' },
      search: { mode: 'slide' },
    })
  })

  it('ignores incomplete or invalid room return search params', () => {
    expect(parseRoomSettingsReturnSearch({ roomReturnId: 'room-42' })).toBeNull()
    expect(
      parseRoomSettingsReturnSearch({ roomReturnId: 'room-42', roomReturnMode: 'unknown' }),
    ).toBeNull()
    expect(
      parseRoomSettingsReturnSearch({ roomReturnId: '  ', roomReturnMode: 'sheet' }),
    ).toBeNull()
  })
})
