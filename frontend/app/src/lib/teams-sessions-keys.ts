export const teamsListRootKey = ['teams', 'list'] as const
export function teamsListKey(q: string) {
  return [...teamsListRootKey, q] as const
}

export function teamDetailKey(id: string) {
  return ['teams', 'detail', id] as const
}

export function teamInvitationsKey(teamId: string) {
  return ['teams', 'invitations', teamId] as const
}

export const sessionsListRootKey = ['sessions', 'me'] as const
/** Active credential for this browser (pairs with `/api/v1/users/me/sessions/current`). */
export const sessionsCurrentCredentialKey = [...sessionsListRootKey, 'current'] as const

export function sessionsListKey(q: string) {
  return [...sessionsListRootKey, q] as const
}

export function sessionMetricsKey(sessionId: string) {
  return [...sessionsListRootKey, 'metrics', sessionId] as const
}
