import { describe, expect, it } from 'vitest'

import { profilePictureContentType } from '@/api/profile-picture'

describe('profilePictureContentType', () => {
  it('accepts jpeg and png', () => {
    expect(profilePictureContentType(new File([], 'a', { type: 'image/jpeg' }))).toBe('image/jpeg')
    expect(profilePictureContentType(new File([], 'a', { type: 'image/png' }))).toBe('image/png')
  })

  it('accepts by extension when mime is empty', () => {
    expect(profilePictureContentType(new File([], 'photo.jpg', { type: '' }))).toBe('image/jpeg')
  })

  it('rejects other formats', () => {
    expect(profilePictureContentType(new File([], 'x.heic', { type: 'image/heic' }))).toBeNull()
  })
})
