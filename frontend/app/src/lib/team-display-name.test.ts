import { describe, expect, it } from 'vitest'

import type { Team } from '@/api/teams-sessions-fetch'

import { getTeamDisplayName, isPersonalTeamName } from './team-display-name'

function t(key: string, opt?: { email?: string }): string {
  if (key === 'teams.personalDisplayMine') return 'My Team'
  if (key === 'teams.personalDisplayOwner' && opt?.email) return `${opt.email}'s Team`
  return key
}

const personalTeam = (overrides: Partial<Team> = {}): Team => ({
  id: 't1',
  name: 'Personal',
  owner: { id: 'u1', email: 'owner@example.com' },
  members: [{ role: 'admin', user: { id: 'u1', email: 'owner@example.com' } }],
  ...overrides,
})

describe('isPersonalTeamName', () => {
  it('matches Personal case-insensitively', () => {
    expect(isPersonalTeamName('Personal')).toBe(true)
    expect(isPersonalTeamName('personal')).toBe(true)
    expect(isPersonalTeamName('  Personal  ')).toBe(true)
  })
  it('returns false for other names', () => {
    expect(isPersonalTeamName('Worship')).toBe(false)
  })
})

describe('getTeamDisplayName', () => {
  it('returns the raw name for non-personal teams', () => {
    const team = personalTeam({ name: 'Band' })
    expect(getTeamDisplayName(team, 'u1', t)).toBe('Band')
  })
  it('uses My Team when the current user is the personal team owner', () => {
    const team = personalTeam()
    expect(getTeamDisplayName(team, 'u1', t)).toBe('My Team')
  })
  it("uses the possessive when the viewer is not the personal team's owner", () => {
    const team = personalTeam()
    expect(getTeamDisplayName(team, 'other', t)).toBe("owner@example.com's Team")
  })
  it('uses admin member when owner is missing from payload', () => {
    const base = personalTeam()
    const team: Team = { id: base.id, name: base.name, members: base.members }
    expect(getTeamDisplayName(team, 'u1', t)).toBe('My Team')
  })
})
