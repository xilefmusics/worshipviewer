import { describe, expect, it } from 'vitest'

import { buildAuthLoginRedirectParam, sanitizeAppRedirect } from '@/lib/returnTo'

describe('sanitizeAppRedirect', () => {
  it('allows same-origin style paths with query', () => {
    expect(sanitizeAppRedirect('/lib?q=1')).toBe('/lib?q=1')
    expect(sanitizeAppRedirect('/')).toBe('/')
  })

  it('rejects protocol-relative and obvious junk', () => {
    expect(sanitizeAppRedirect('//evil.com')).toBe('/')
    expect(sanitizeAppRedirect('/http/evil')).toBe('/')
    expect(sanitizeAppRedirect('https://evil.com')).toBe('/')
  })

  it('rewrites setlist editor deep links to hub list for post-login', () => {
    expect(sanitizeAppRedirect('/setlists/abc-123')).toBe('/setlists')
    expect(sanitizeAppRedirect('/setlists/abc-123?x=1')).toBe('/setlists')
  })

  it('rewrites collection editor deep links to hub list for post-login', () => {
    expect(sanitizeAppRedirect('/collections/abc-123')).toBe('/collections')
    expect(sanitizeAppRedirect('/collections/abc-123?x=1')).toBe('/collections')
  })
})

describe('buildAuthLoginRedirectParam', () => {
  it('matches sanitized path', () => {
    expect(buildAuthLoginRedirectParam('/x?y=1')).toBe('/x?y=1')
  })
})
