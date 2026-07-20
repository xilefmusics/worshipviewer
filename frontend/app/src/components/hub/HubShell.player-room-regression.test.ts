import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('HubShell player-room network isolation', () => {
  it('does not mount player-room discovery on unrelated hub pages', () => {
    const source = readFileSync(new URL('./HubShell.tsx', import.meta.url), 'utf8')

    expect(source).not.toContain('HubPlayerRoomJoinPrompt')
    expect(source).not.toContain('listPlayerRooms')
    expect(source).not.toContain("queryKey: ['player-rooms'")
  })
})
