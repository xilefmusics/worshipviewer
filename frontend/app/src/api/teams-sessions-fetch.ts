import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'
import { parseTotalCount } from '@/lib/list-pagination'

export type Team = components['schemas']['Team']
export type TeamMember = components['schemas']['TeamMember']
export type TeamInvitation = components['schemas']['TeamInvitation']
export type SessionBody = components['schemas']['SessionBody']
export type HttpAuditMetrics = components['schemas']['HttpAuditMetrics']
export type CreateTeam = components['schemas']['CreateTeam']
export type PatchTeam = components['schemas']['PatchTeam']
export type TeamRole = components['schemas']['TeamRole']

const PAGE_SIZE = 50

export class ApiUnauthorizedError extends Error {
  override readonly name = 'ApiUnauthorizedError'
}

function listErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const p = body as { title?: string; detail?: string }
    if (typeof p.detail === 'string' && p.detail.trim()) return p.detail.trim()
    if (typeof p.title === 'string' && p.title.trim()) return p.title.trim()
  }
  if (typeof body === 'string' && body.trim()) return body.slice(0, 300)
  return `Request failed (${status})`
}

/** Coerce various list JSON shapes to an array; avoids crashes if the wire format drifts. */
function normalizeListJson<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    const inner = o.items ?? o.data ?? o.sessions
    if (Array.isArray(inner)) return inner as T[]
  }
  return []
}

async function on401(queryClient: QueryClient): Promise<never> {
  await redirectToLoginAfterUnauthorized(queryClient)
  throw new ApiUnauthorizedError()
}

export async function fetchTeamsPage(
  queryClient: QueryClient,
  args: { page: number; q: string; signal?: AbortSignal },
): Promise<{ items: Team[]; total: number | undefined }> {
  const { data, response, error } = await api.GET('/api/v1/teams', {
    params: {
      query: {
        page: args.page,
        page_size: PAGE_SIZE,
        q: args.q.trim() || undefined,
      },
    },
    signal: args.signal,
  })
  if (response.status === 401) return on401(queryClient)
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  return { items: normalizeListJson<Team>(data), total: parseTotalCount(response) }
}

export async function fetchTeamDetail(
  queryClient: QueryClient,
  args: { id: string; signal?: AbortSignal },
): Promise<Team> {
  const { data, response, error } = await api.GET('/api/v1/teams/{id}', {
    params: { path: { id: args.id } },
    signal: args.signal,
  })
  if (response.status === 401) return on401(queryClient)
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid team response')
  }
  return data as Team
}

export async function fetchSessionsPage(
  queryClient: QueryClient,
  args: { page: number; q: string; signal?: AbortSignal },
): Promise<{ items: SessionBody[]; total: number | undefined }> {
  const q = args.q.trim()
  // First page unfiltered: omit `page`/`page_size` so the server uses its defaults. Some APIs reject
  // `page=0` together with `page_size` (400) even though the spec allows page 0.
  const explicitPaging = args.page > 0 || q.length > 0
  const query: {
    page?: number
    page_size?: number
    q?: string
  } = explicitPaging
    ? {
        page: args.page,
        page_size: PAGE_SIZE,
        ...(q ? { q } : {}),
      }
    : {}
  const { data, response, error } = await api.GET('/api/v1/users/me/sessions', {
    params: Object.keys(query).length > 0 ? { query } : {},
    signal: args.signal,
  })
  if (response.status === 401) return on401(queryClient)
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  return { items: normalizeListJson<SessionBody>(data), total: parseTotalCount(response) }
}

/** Session HTTP audit aggregates; `null` when metrics are missing (e.g. 404). */
export async function fetchSessionMetrics(
  queryClient: QueryClient,
  args: { id: string; signal?: AbortSignal },
): Promise<HttpAuditMetrics | null> {
  const { data, response, error } = await api.GET('/api/v1/users/me/sessions/{id}/metrics', {
    params: { path: { id: args.id } },
    signal: args.signal,
  })
  if (response.status === 401) return on401(queryClient)
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  return (data ?? null) as HttpAuditMetrics | null
}

/** Credential used for this request; `null` when the API reports no matching session (e.g. 404). */
export async function fetchCurrentSession(
  queryClient: QueryClient,
  args: { signal?: AbortSignal },
): Promise<SessionBody | null> {
  const { data, response, error } = await api.GET('/api/v1/users/me/sessions/current', {
    signal: args.signal,
  })
  if (response.status === 401) return on401(queryClient)
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  return (data ?? null) as SessionBody | null
}

export async function fetchTeamInvitationsPage(
  queryClient: QueryClient,
  args: { teamId: string; page: number; signal?: AbortSignal },
): Promise<{ items: TeamInvitation[]; total: number | undefined }> {
  const { data, response, error } = await api.GET('/api/v1/teams/{team_id}/invitations', {
    params: {
      path: { team_id: args.teamId },
      query: {
        page: args.page,
        page_size: PAGE_SIZE,
      },
    },
    signal: args.signal,
  })
  if (response.status === 401) return on401(queryClient)
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  return { items: normalizeListJson<TeamInvitation>(data), total: parseTotalCount(response) }
}
