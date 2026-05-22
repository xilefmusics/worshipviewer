import { describe, expect, it } from 'vitest'

import {
  buildPlayerReturnSearch,
  buildSongEditorReturnSearch,
  parseOptionalPlayerIndex,
  parsePlayerEditorReturnSearch,
} from '@/lib/player/player-editor-return'

describe('player-editor-return', () => {
  it('parses optional player index', () => {
    expect(parseOptionalPlayerIndex(3)).toBe(3)
    expect(parseOptionalPlayerIndex('7')).toBe(7)
    expect(parseOptionalPlayerIndex(-1)).toBeUndefined()
    expect(parseOptionalPlayerIndex('abc')).toBeUndefined()
  })

  it('parses return context from song editor search params', () => {
    expect(
      parsePlayerEditorReturnSearch({
        playerType: 'setlist',
        playerId: 'sl1',
        playerIndex: '4',
      }),
    ).toEqual({
      playerType: 'setlist',
      playerId: 'sl1',
      playerIndex: 4,
    })
    expect(parsePlayerEditorReturnSearch({ playerType: 'setlist', playerId: 'sl1' })).toBeNull()
  })

  it('builds round-trip search params', () => {
    const context = { playerType: 'collection' as const, playerId: 'c1', playerIndex: 2 }
    expect(buildSongEditorReturnSearch(context)).toEqual({
      playerType: 'collection',
      playerId: 'c1',
      playerIndex: 2,
    })
    expect(buildPlayerReturnSearch(context)).toEqual({
      type: 'collection',
      id: 'c1',
      index: 2,
    })
  })
})
