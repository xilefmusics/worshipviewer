import { describe, expect, it } from 'vitest'

import { collectionCoverContentType } from '@/api/collection-cover-upload'

describe('collectionCoverContentType', () => {
  it('accepts jpeg by mime', () => {
    expect(collectionCoverContentType(new File([], 'x', { type: 'image/jpeg' }))).toBe('image/jpeg')
  })

  it('accepts png by mime', () => {
    expect(collectionCoverContentType(new File([], 'x', { type: 'image/png' }))).toBe('image/png')
  })

  it('accepts by extension when mime is empty', () => {
    expect(collectionCoverContentType(new File([], 'photo.JPG', { type: '' }))).toBe('image/jpeg')
    expect(collectionCoverContentType(new File([], 'art.png', { type: '' }))).toBe('image/png')
  })

  it('rejects svg and unknown types', () => {
    expect(collectionCoverContentType(new File([], 'x.svg', { type: 'image/svg+xml' }))).toBeNull()
    expect(collectionCoverContentType(new File([], 'x.webp', { type: 'image/webp' }))).toBeNull()
  })
})
