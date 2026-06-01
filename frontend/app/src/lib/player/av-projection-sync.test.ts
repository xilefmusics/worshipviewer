import { describe, expect, it, vi } from 'vitest'

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
    sync.close()
    expect(readAvProjectionSnapshot('session-2', storage)).toEqual(payload)
  })

  it('debounces rapid localStorage writes', () => {
    vi.useFakeTimers()
    const setItem = vi.fn()
    const storage = {
      getItem: () => null,
      setItem,
    }
    const sync = createAvProjectionSync('session-3', storage)
    const payload: AvProjectionPayload = {
      contentText: 'A',
      contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
      backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
      transition: DEFAULT_AV_PREFERENCES.transition,
      screenState: 'live',
      itemTitle: 'T',
      nextPreview: null,
    }
    sync.broadcast(payload)
    sync.broadcast({ ...payload, contentText: 'B' })
    expect(setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(75)
    expect(setItem).toHaveBeenCalledOnce()
    sync.close()
    vi.useRealTimers()
  })
})
