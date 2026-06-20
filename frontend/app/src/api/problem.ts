import type { components } from './schema'

export type Problem = components['schemas']['Problem']

function problemText(value: unknown, key: 'title' | 'detail'): string | null {
  if (!value || typeof value !== 'object' || !(key in value)) return null
  const candidate = (value as Record<string, unknown>)[key]
  if (typeof candidate !== 'string') return null
  const trimmed = candidate.trim()
  return trimmed ? trimmed : null
}

export async function parseProblemResponse(res: Response): Promise<Problem | null> {
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('json')) return null
  try {
    const body: unknown = await res.json()
    if (
      body &&
      typeof body === 'object' &&
      'title' in body &&
      typeof (body as Problem).title === 'string'
    ) {
      return body as Problem
    }
  } catch {
    /* ignore */
  }
  return null
}

export function problemMessageFromBody(body: unknown, fallback: string): string {
  return problemText(body, 'detail') ?? problemText(body, 'title') ?? fallback
}
