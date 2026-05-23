/** Absolute app URL that opens the join flow for a team invitation. */
export function buildTeamInviteLink(teamId: string, invitationId: string): string {
  const origin = typeof globalThis.window !== 'undefined' ? globalThis.window.location.origin : ''
  const q = new URLSearchParams({
    team_id: teamId,
    invitation_id: invitationId,
  })
  return `${origin}/join?${q.toString()}`
}

/**
 * Prefer server-provided `invite_url` when present (OpenAPI may lag); otherwise build `/join?...`.
 */
export function resolveTeamInviteLink(teamId: string, invitationId: string, payload: unknown): string {
  if (payload !== null && typeof payload === 'object' && 'invite_url' in payload) {
    const raw = (payload as { invite_url?: unknown }).invite_url
    if (typeof raw === 'string' && raw.length > 0) return raw
  }
  return buildTeamInviteLink(teamId, invitationId)
}
