import { afterEach, describe, expect, it, vi } from 'vitest'

import { readSsoSessionIdFromDocumentCookie } from './sso-session-cookie'

describe('readSsoSessionIdFromDocumentCookie', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when sso_session is not present', () => {
    vi.stubGlobal('document', { cookie: 'other=1' })
    expect(readSsoSessionIdFromDocumentCookie()).toBeNull()
  })

  it('returns decoded value when sso_session is set', () => {
    vi.stubGlobal('document', { cookie: 'a=b; sso_session=abc-123%20x; c=d' })
    expect(readSsoSessionIdFromDocumentCookie()).toBe('abc-123 x')
  })
})
