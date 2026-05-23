import { describe, expect, it } from 'vitest'

import type { User } from '@/api/session'
import { emailInitials, resolveAvatarPlan } from '@/lib/user-avatar'

function user(partial: Partial<User> & Pick<User, 'email' | 'id'>): User {
  const { email, id, ...rest } = partial
  return {
    created_at: '2020-01-01T00:00:00Z',
    role: 'default',
    email,
    id,
    ...rest,
  }
}

describe('emailInitials', () => {
  it('uses first two letters uppercased', () => {
    expect(emailInitials('xilef@test.com')).toBe('XI')
    expect(emailInitials('ab')).toBe('AB')
  })

  it('handles short email', () => {
    expect(emailInitials('a')).toBe('A')
    expect(emailInitials('')).toBe('?')
  })
})

describe('resolveAvatarPlan', () => {
  it('prefers avatar_blob_id over oauth_avatar_blob_id', () => {
    expect(
      resolveAvatarPlan(
        user({
          id: '1',
          email: 'a@b.c',
          avatar_blob_id: 'av1',
          oauth_picture_url: 'https://example.com/p.png',
          oauth_avatar_blob_id: 'oauth1',
        }),
      ),
    ).toEqual({ type: 'blob', id: 'av1' })
  })

  it('ignores oauth_picture_url for plan (blobs only)', () => {
    expect(
      resolveAvatarPlan(
        user({
          id: '1',
          email: 'a@b.c',
          oauth_picture_url: 'https://example.com/p.png',
          oauth_avatar_blob_id: 'oauth1',
        }),
      ),
    ).toEqual({ type: 'blob', id: 'oauth1' })
  })

  it('falls back to oauth_avatar_blob_id', () => {
    expect(
      resolveAvatarPlan(
        user({
          id: '1',
          email: 'a@b.c',
          oauth_avatar_blob_id: 'oauth1',
        }),
      ),
    ).toEqual({ type: 'blob', id: 'oauth1' })
  })

  it('returns none when nothing set', () => {
    expect(resolveAvatarPlan(user({ id: '1', email: 'a@b.c' }))).toEqual({ type: 'none' })
  })
})
