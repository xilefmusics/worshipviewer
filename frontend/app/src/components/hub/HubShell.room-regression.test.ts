import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('HubShell room network isolation', () => {
  it('does not mount room discovery on unrelated hub pages', () => {
    const source = readFileSync(new URL('./HubShell.tsx', import.meta.url), 'utf8')

    expect(source).not.toContain('HubRoomJoinPrompt')
    expect(source).not.toContain('listRooms')
    expect(source).not.toContain("queryKey: ['rooms'")
  })
})
