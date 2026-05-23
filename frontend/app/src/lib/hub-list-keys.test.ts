import { describe, expect, it } from 'vitest'

import { SESSION_QUERY_KEY } from '@/api/session'
import { hubListKey, isHubListQueryKey } from '@/lib/hub-list-keys'
import { teamsListKey } from '@/lib/teams-sessions-keys'

describe('isHubListQueryKey', () => {
  it('is true for hub list keys (collections, songs, setlists)', () => {
    expect(isHubListQueryKey(hubListKey('collections', ''))).toBe(true)
    expect(isHubListQueryKey(hubListKey('songs', 'x'))).toBe(true)
    expect(isHubListQueryKey(hubListKey('setlists', ''))).toBe(true)
  })

  it('is false for session, teams, and other roots', () => {
    expect(isHubListQueryKey(SESSION_QUERY_KEY)).toBe(false)
    expect(isHubListQueryKey(teamsListKey(''))).toBe(false)
  })

  it('is false for non-arrays and wrong shapes', () => {
    expect(isHubListQueryKey({})).toBe(false)
    expect(isHubListQueryKey('hubLists')).toBe(false)
  })
})
