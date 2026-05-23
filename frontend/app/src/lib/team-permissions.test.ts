import { describe, expect, it } from 'vitest'

import type { Team } from '@/api/teams-sessions-fetch'

import { canEditTeamLibrary, isUserTeamAdmin } from './team-permissions'

describe('isUserTeamAdmin', () => {
  it('is true when the user appears in members as admin', () => {
    const team: Team = {
      id: 't1',
      name: 'Band',
      members: [
        { role: 'admin', user: { id: 'u1', email: 'a@x.com' } },
        { role: 'guest', user: { id: 'u2', email: 'b@x.com' } },
      ],
    }
    expect(isUserTeamAdmin(team, 'u1')).toBe(true)
    expect(isUserTeamAdmin(team, 'u2')).toBe(false)
  })

  it('treats personal-team owner as admin when owner is omitted from members', () => {
    const team: Team = {
      id: 't1',
      name: 'personal',
      owner: { id: 'u-owner', email: 'me@x.com' },
      members: [{ role: 'guest', user: { id: 'u-guest', email: 'guest@x.com' } }],
    }
    expect(isUserTeamAdmin(team, 'u-owner')).toBe(true)
    expect(isUserTeamAdmin(team, 'u-guest')).toBe(false)
  })
})

describe('canEditTeamLibrary', () => {
  it('allows admin and content_maintainer', () => {
    const team: Team = {
      id: 't1',
      name: 'Band',
      members: [
        { role: 'admin', user: { id: 'adm', email: 'a@x.com' } },
        { role: 'content_maintainer', user: { id: 'cm', email: 'b@x.com' } },
        { role: 'guest', user: { id: 'g', email: 'c@x.com' } },
      ],
    }
    expect(canEditTeamLibrary(team, 'adm')).toBe(true)
    expect(canEditTeamLibrary(team, 'cm')).toBe(true)
    expect(canEditTeamLibrary(team, 'g')).toBe(false)
  })

  it('allows personal-team owner omitted from membership row', () => {
    const team: Team = {
      id: 't1',
      name: 'personal',
      owner: { id: 'owner', email: 'me@x.com' },
      members: [{ role: 'guest', user: { id: 'guest', email: 'g@x.com' } }],
    }
    expect(canEditTeamLibrary(team, 'owner')).toBe(true)
    expect(canEditTeamLibrary(team, 'guest')).toBe(false)
  })
})
