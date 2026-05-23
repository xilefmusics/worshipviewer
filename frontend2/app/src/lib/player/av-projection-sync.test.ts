import { describe, expect, it } from 'vitest'

import { DEFAULT_AV_PREFERENCES, type AvProjectionPayload } from '@/lib/player/av-preferences'
import {
  createAvProjectionSync,
  readAvProjectionSnapshot,
  writeAvProjectionSnapshot,
} from '@/lib/player/av-projection-sync'

describe('av-projection-sync', () => {
  it('writes and reads snapshot from storage', () => {
    const map = new Map<string, string>()
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value)
      },
    }
    const payload: AvProjectionPayload = {
      contentText: 'Hello',
      contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
      backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
      transition: DEFAULT_AV_PREFERENCES.transition,
      screenState: 'live',
      itemTitle: 'Song',
      nextPreview: 'Next',
    }

    writeAvProjectionSnapshot('session-1', payload, storage)
    expect(readAvProjectionSnapshot('session-1', storage)).toEqual(payload)
  })

  it('broadcast persists latest snapshot', () => {
    const map = new Map<string, string>()
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value)
      },
    }
    const sync = createAvProjectionSync('session-2', storage)
    const payload: AvProjectionPayload = {
      contentText: 'Slide',
      contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
      backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
      transition: DEFAULT_AV_PREFERENCES.transition,
      screenState: 'blackout',
      itemTitle: 'Title',
      nextPreview: null,
    }
    sync.broadcast(payload)
    expect(sync.readLatest()).toEqual(payload)
    sync.close()
  })
})
