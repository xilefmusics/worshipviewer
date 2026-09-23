import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('HubShell room network isolation', () => {
  it('does not mount room discovery on unrelated hub pages', () => {
    const source = readFileSync(new URL('./HubShell.tsx', import.meta.url), 'utf8')

    expect(source).not.toContain('HubRoomJoinPrompt')
    expect(source).not.toContain('listRooms')
    expect(source).not.toContain("queryKey: ['rooms'")
  })

  it('keeps Rooms hub controls available without a feature flag', () => {
    const source = readFileSync(new URL('./HubShell.tsx', import.meta.url), 'utf8')

    expect(source).not.toContain('roomsV2Enabled')
    expect(source).toContain('const showLibraryFilters = isLibraryListPath(pathname)')
    expect(source).toContain("pathname === '/rooms' && writableRoomTeams.length === 0")
  })

  it('keeps library room creation actions available without a feature flag', () => {
    const source = readFileSync(new URL('./EntityListView.tsx', import.meta.url), 'utf8')

    expect(source).not.toContain('isRoomsV2Enabled')
    expect(source).toContain('<CreateRoomDialog')
    expect(source).toContain('<RoomIcon')
  })
})
