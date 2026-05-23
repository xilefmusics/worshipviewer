import type { Team } from '@/api/teams-sessions-fetch'

import { isPersonalTeamName } from '@/lib/team-display-name'

/**
 * Whether the user may administer the team in the UI (members, invitations, non-personal rename, etc.).
 * Personal-team owners are omitted from `team.members` per API; they still have admin rights.
 */
export function isUserTeamAdmin(team: Team, userId: string): boolean {
  const row = team.members.find((m) => m.user.id === userId)
  if (row?.role === 'admin') return true
  if (!isPersonalTeamName(team.name)) return false
  const ownerId =
    team.owner?.id ?? team.members.find((m) => m.role === 'admin')?.user.id ?? team.members[0]?.user.id
  return ownerId === userId
}

/** Library edit (setlists, songs, collections) per team membership. */
export function canEditTeamLibrary(team: Team, userId: string): boolean {
  const row = team.members.find((m) => m.user.id === userId)
  if (row?.role === 'content_maintainer') return true
  return isUserTeamAdmin(team, userId)
}
