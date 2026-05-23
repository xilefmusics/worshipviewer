import { describe, expect, it, vi } from 'vitest'

import { parseRetryAfterSeconds } from '@/lib/http-retry-after'

describe('parseRetryAfterSeconds', () => {
  it('returns undefined when header missing', () => {
    expect(parseRetryAfterSeconds(new Response(null))).toBeUndefined()
  })

  it('parses non-negative integers', () => {
    expect(
      parseRetryAfterSeconds(new Response(null, { headers: { 'retry-after': '12' } })),
    ).toBe(12)
    expect(parseRetryAfterSeconds(new Response(null, { headers: { 'retry-after': '0' } }))).toBe(0)
  })

  it('returns undefined for bad numeric strings', () => {
    expect(
      parseRetryAfterSeconds(new Response(null, { headers: { 'retry-after': '-1' } })),
    ).toBeUndefined()
    expect(
      parseRetryAfterSeconds(new Response(null, { headers: { 'retry-after': 'nope' } })),
    ).toBeUndefined()
  })

  it('parses HTTP-date Retry-After relative to Date.now()', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-09T14:30:00.000Z'))
    const headers = new Headers()
    headers.set('retry-after', 'Sat, 09 May 2026 14:30:06 GMT')
    expect(parseRetryAfterSeconds(new Response(null, { headers }))).toBe(6)
    vi.useRealTimers()
  })
})
