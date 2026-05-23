import type { components } from './schema'

export type Problem = components['schemas']['Problem']

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
