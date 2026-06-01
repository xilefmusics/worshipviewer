import type { APIRequestContext } from '@playwright/test'

export type TeamRole = 'admin' | 'content_maintainer' | 'guest'

export type User = {
  id: string
  email: string
  role: string
}

export type Team = {
  id: string
  name: string
  owner?: { id: string; email: string } | null
  members: Array<{ role: TeamRole; user: { id: string; email: string } }>
}

export type Collection = {
  id: string
  title: string
  owner: string
  cover: string
  songs: unknown[]
}

export type Song = {
  id: string
  owner: string
  not_a_song: boolean
  data: { titles: string[]; sections?: unknown[] }
}

export type Setlist = {
  id: string
  title: string
  owner: string
  songs: unknown[]
}

export type Invitation = {
  id: string
  team: string
}

export type MintedUser = {
  email: string
  userId: string
  sessionId: string
}

const MINIMAL_SONG_DATA = {
  titles: ['Untitled'],
  sections: [{ type: 'verse', lines: [{ lyrics: 'Hello world', chords: '' }] }],
}

let tokenCounter = 0

/** Unique suffix for test-scoped entity names (avoids collisions in shared in-memory DB). */
export function uniqueToken(label = 't'): string {
  tokenCounter += 1
  return `${label}-${Date.now()}-${tokenCounter}`
}

export class SeedClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseURL: string,
    private readonly sessionId: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Cookie: `sso_session=${this.sessionId}`,
      ...extra,
    }
  }

  private async json<T>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
    if (!res.ok()) {
      const body = await res.text()
      throw new Error(`API ${res.status()}: ${body}`)
    }
    return (await res.json()) as T
  }

  async getMe(): Promise<User> {
    const res = await this.request.get(`${this.baseURL}/api/v1/users/me`, {
      headers: this.headers(),
    })
    return this.json<User>(res)
  }

  /** Admin-only: create user + session without exercising OTP login UI. */
  async mintUser(email: string): Promise<MintedUser> {
    const createRes = await this.request.post(`${this.baseURL}/api/v1/users`, {
      headers: this.headers({ 'Content-Type': 'application/json' }),
      data: { email, role: 'default' },
    })
    const user = await this.json<User>(createRes)
    return this.createSessionForUser(user.id, user.email)
  }

  async createSessionForUser(userId: string, email: string): Promise<MintedUser> {
    const sessRes = await this.request.post(`${this.baseURL}/api/v1/users/${userId}/sessions`, {
      headers: this.headers(),
    })
    const session = await this.json<{ id: string }>(sessRes)
    return { email, userId, sessionId: session.id }
  }

  async createTeam(name: string): Promise<Team> {
    const res = await this.request.post(`${this.baseURL}/api/v1/teams`, {
      headers: this.headers({ 'Content-Type': 'application/json' }),
      data: { name, members: [] },
    })
    return this.json<Team>(res)
  }

  async patchTeam(
    teamId: string,
    body: { name?: string; members?: Array<{ user: { id: string }; role: TeamRole }> },
  ): Promise<Team> {
    const res = await this.request.patch(`${this.baseURL}/api/v1/teams/${teamId}`, {
      headers: this.headers({ 'Content-Type': 'application/json' }),
      data: body,
    })
    return this.json<Team>(res)
  }

  async deleteTeam(teamId: string): Promise<void> {
    const res = await this.request.delete(`${this.baseURL}/api/v1/teams/${teamId}`, {
      headers: this.headers(),
    })
    if (!res.ok() && res.status() !== 204) {
      throw new Error(`deleteTeam failed: ${res.status()}`)
    }
  }

  async createInvitation(teamId: string): Promise<Invitation> {
    const res = await this.request.post(
      `${this.baseURL}/api/v1/teams/${teamId}/invitations`,
      { headers: this.headers() },
    )
    return this.json<Invitation>(res)
  }

  async revokeInvitation(teamId: string, invitationId: string): Promise<void> {
    const res = await this.request.delete(
      `${this.baseURL}/api/v1/teams/${teamId}/invitations/${invitationId}`,
      { headers: this.headers() },
    )
    if (!res.ok() && res.status() !== 204) {
      throw new Error(`revokeInvitation failed: ${res.status()}`)
    }
  }

  async createCollection(opts: {
    title: string
    owner?: string
    songs?: unknown[]
  }): Promise<Collection> {
    const res = await this.request.post(`${this.baseURL}/api/v1/collections`, {
      headers: this.headers({ 'Content-Type': 'application/json' }),
      data: {
        title: opts.title,
        cover: 'mysongs',
        songs: opts.songs ?? [],
        ...(opts.owner ? { owner: opts.owner } : {}),
      },
    })
    return this.json<Collection>(res)
  }

  async patchCollection(id: string, songIds: string[]): Promise<Collection> {
    const res = await this.request.patch(`${this.baseURL}/api/v1/collections/${id}`, {
      headers: this.headers({ 'Content-Type': 'application/json' }),
      data: {
        songs: songIds.map((id, i) => ({ id, nr: String(i + 1), key: null, tempo: null })),
      },
    })
    return this.json<Collection>(res)
  }

  async deleteCollection(id: string): Promise<void> {
    const res = await this.request.delete(`${this.baseURL}/api/v1/collections/${id}`, {
      headers: this.headers(),
    })
    if (!res.ok() && res.status() !== 204) {
      throw new Error(`deleteCollection failed: ${res.status()}`)
    }
  }

  async createSong(opts: {
    collection: string
    title?: string
    not_a_song?: boolean
  }): Promise<Song> {
    const data = {
      ...MINIMAL_SONG_DATA,
      titles: [opts.title ?? 'Untitled'],
    }
    const res = await this.request.post(`${this.baseURL}/api/v1/songs`, {
      headers: this.headers({ 'Content-Type': 'application/json' }),
      data: {
        collection: opts.collection,
        not_a_song: opts.not_a_song ?? false,
        blobs: [],
        data,
      },
    })
    return this.json<Song>(res)
  }

  async patchSong(id: string, body: Record<string, unknown>): Promise<Song> {
    const res = await this.request.patch(`${this.baseURL}/api/v1/songs/${id}`, {
      headers: this.headers({ 'Content-Type': 'application/json' }),
      data: body,
    })
    return this.json<Song>(res)
  }

  async deleteSong(id: string): Promise<void> {
    const res = await this.request.delete(`${this.baseURL}/api/v1/songs/${id}`, {
      headers: this.headers(),
    })
    if (!res.ok() && res.status() !== 204) {
      throw new Error(`deleteSong failed: ${res.status()}`)
    }
  }

  async createSetlist(opts: {
    title: string
    owner?: string
    songs?: unknown[]
  }): Promise<Setlist> {
    const res = await this.request.post(`${this.baseURL}/api/v1/setlists`, {
      headers: this.headers({ 'Content-Type': 'application/json' }),
      data: {
        title: opts.title,
        songs: opts.songs ?? [],
        ...(opts.owner ? { owner: opts.owner } : {}),
      },
    })
    return this.json<Setlist>(res)
  }

  async patchSetlist(id: string, body: Record<string, unknown>): Promise<Setlist> {
    const res = await this.request.patch(`${this.baseURL}/api/v1/setlists/${id}`, {
      headers: this.headers({ 'Content-Type': 'application/json' }),
      data: body,
    })
    return this.json<Setlist>(res)
  }

  async deleteSetlist(id: string): Promise<void> {
    const res = await this.request.delete(`${this.baseURL}/api/v1/setlists/${id}`, {
      headers: this.headers(),
    })
    if (!res.ok() && res.status() !== 204) {
      throw new Error(`deleteSetlist failed: ${res.status()}`)
    }
  }

  async listTeams(q?: string): Promise<Team[]> {
    const params = q ? `?q=${encodeURIComponent(q)}` : ''
    const res = await this.request.get(`${this.baseURL}/api/v1/teams${params}`, {
      headers: this.headers(),
    })
    return this.json<Team[]>(res)
  }

  async getPersonalTeamId(): Promise<string> {
    const teams = await this.listTeams()
    const personal = teams.find((t) => t.name.toLowerCase() === 'personal')
    if (!personal) throw new Error('personal team not found')
    return personal.id
  }

  async addMemberToTeam(
    teamId: string,
    team: Team,
    userId: string,
    role: TeamRole,
  ): Promise<Team> {
    const members = [
      ...team.members.map((m) => ({ user: { id: m.user.id }, role: m.role })),
      { user: { id: userId }, role },
    ]
    return this.patchTeam(teamId, { members })
  }
}
