import { describe, expect, it } from 'vitest'

import {
  COLLECTIONS_VIEW_MODE_KEY,
  getDefaultViewMode,
  readCollectionsViewMode,
  readHubViewMode,
  writeCollectionsViewMode,
} from '@/lib/hub-view-mode'

function mockStorage() {
  const storage = new Map<string, string>()
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
  }
}

describe('hub view mode', () => {
  it('defaults collections to card and songs/setlists to list', () => {
    expect(getDefaultViewMode('collections')).toBe('card')
    expect(getDefaultViewMode('songs')).toBe('list')
    expect(getDefaultViewMode('setlists')).toBe('list')
  })

  it('falls back to card for collections when storage key is missing', () => {
    const storage = mockStorage()
    expect(readCollectionsViewMode(storage)).toBe('card')
    expect(readHubViewMode('collections', storage)).toBe('card')
  })

  it('always returns list for songs and setlists', () => {
    const storage = mockStorage()
    storage.setItem(COLLECTIONS_VIEW_MODE_KEY, 'card')
    expect(readHubViewMode('songs', storage)).toBe('list')
    expect(readHubViewMode('setlists', storage)).toBe('list')
  })

  it('persists collections preference only', () => {
    const storage = mockStorage()
    writeCollectionsViewMode('list', storage)
    expect(readCollectionsViewMode(storage)).toBe('list')
  })

  it('ignores invalid stored values for collections', () => {
    const storage = mockStorage()
    storage.setItem(COLLECTIONS_VIEW_MODE_KEY, 'grid')
    expect(readCollectionsViewMode(storage)).toBe('card')
  })
})
