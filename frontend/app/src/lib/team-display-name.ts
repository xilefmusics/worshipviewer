import type { Team } from '@/api/teams-sessions-fetch'

type Translate = (key: string, options?: { email?: string }) => string

/** True when the API uses the canonical personal-team name (case-insensitive). */
export function isPersonalTeamName(name: string): boolean {
  return name.trim().toLowerCase() === 'personal'
}

/** Resolves the user id that "owns" a personal team for display / access checks. */
export function resolveTeamOwnerUserId(team: Team): string | undefined {
  return team.owner?.id ?? team.members.find((m) => m.role === 'admin')?.user.id ?? team.members[0]?.user.id
}

/**
 * Human-friendly label for the team list/detail. Personal teams show as "My Team" for the
 * owner, or "…'s Team" (localized) using the owner email when the viewer is someone else.
 */
export function getTeamDisplayName(team: Team, currentUserId: string | undefined, t: Translate): string {
  if (!isPersonalTeamName(team.name)) return team.name

  const ownerId = resolveTeamOwnerUserId(team)
  if (currentUserId && ownerId === currentUserId) {
    return t('teams.personalDisplayMine')
  }

  const email = team.owner?.email ?? team.members[0]?.user.email
  if (email) {
    return t('teams.personalDisplayOwner', { email })
  }

  return t('teams.personalDisplayMine')
}
