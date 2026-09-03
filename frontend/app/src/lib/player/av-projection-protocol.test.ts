import { describe, expect, it } from 'vitest'

import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'
import {
  buildAvProjectionCommand,
  lyricsPayloadFromCommand,
  parseAvProjectionCommandSnapshot,
  parseAvProjectionMessage,
  sameAvProjectionContent,
} from '@/lib/player/av-projection-protocol'

const layers = {
  contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
  backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
  transition: DEFAULT_AV_PREFERENCES.transition,
}

describe('av-projection-protocol', () => {
  it('builds a replace command wrapping lyrics or deck pages', () => {
    const lyrics = buildAvProjectionCommand({
      sessionId: 'shared',
      commandId: 1,
      ...layers,
      screenState: 'live',
      itemTitle: 'Song',
      nextPreview: 'Next',
      content: { type: 'lyrics', contentText: 'Hello', contentLines: [{ primary: 'Hello' }] },
    })
    expect(lyrics.type).toBe('command')
    expect(lyrics.content).toEqual({
      type: 'lyrics',
      contentText: 'Hello',
      contentLines: [{ primary: 'Hello' }],
    })

    const deck = buildAvProjectionCommand({
      sessionId: 'shared',
      commandId: 2,
      ...layers,
      screenState: 'live',
      itemTitle: 'Deck',
      nextPreview: null,
      content: { type: 'deck_page', mediaId: 'm1', assetId: 'a1' },
    })
    expect(deck.content).toEqual({ type: 'deck_page', mediaId: 'm1', assetId: 'a1' })
  })

  it('clear intent forces empty content', () => {
    const command = buildAvProjectionCommand({
      sessionId: 'shared',
      commandId: 3,
      intent: 'clear',
      ...layers,
      screenState: 'live',
      itemTitle: 'Song',
      nextPreview: null,
      content: { type: 'lyrics', contentText: 'Hello' },
    })
    expect(command.intent).toBe('clear')
    expect(command.content).toEqual({ type: 'empty' })
  })

  it('maps lyrics commands to room payloads and withholds deck/timed content', () => {
    const lyrics = buildAvProjectionCommand({
      sessionId: 'shared',
      commandId: 1,
      ...layers,
      screenState: 'live',
      itemTitle: 'Song',
      nextPreview: null,
      content: { type: 'lyrics', contentText: 'Hello', contentLines: [{ primary: 'Hello' }] },
    })
    expect(lyricsPayloadFromCommand(lyrics)?.contentText).toBe('Hello')

    const deck = buildAvProjectionCommand({
      sessionId: 'shared',
      commandId: 2,
      ...layers,
      screenState: 'live',
      itemTitle: 'Deck',
      nextPreview: null,
      content: { type: 'deck_page', mediaId: 'm1', assetId: 'a1' },
    })
    expect(lyricsPayloadFromCommand(deck)).toBeNull()

    const video = buildAvProjectionCommand({
      sessionId: 'shared',
      commandId: 3,
      ...layers,
      screenState: 'live',
      itemTitle: 'Clip',
      nextPreview: null,
      content: { type: 'video', mediaId: 'm1', assetId: 'v1' },
      playback: { action: 'play', volume: 1, muted: false, loop: false },
    })
    expect(lyricsPayloadFromCommand(video)).toBeNull()
    expect(video.playback?.action).toBe('play')
  })

  it('adapts legacy lyric snapshots into tagged commands', () => {
    const command = parseAvProjectionCommandSnapshot(
      {
        contentText: 'Hello',
        contentLines: [{ primary: 'Hello', secondary: 'Hallo' }],
        ...layers,
        screenState: 'live',
        itemTitle: 'Song',
        nextPreview: null,
      },
      'shared',
    )
    expect(command?.type).toBe('command')
    expect(command?.content).toEqual({
      type: 'lyrics',
      contentText: 'Hello',
      contentLines: [{ primary: 'Hello', secondary: 'Hallo' }],
    })
  })

  it('parses tagged messages and rejects unknown envelopes', () => {
    expect(parseAvProjectionMessage({ type: 'hello', sessionId: 'shared', outputId: 'o1', ready: true })).toMatchObject({
      type: 'hello',
      outputId: 'o1',
    })
    expect(parseAvProjectionMessage({ contentText: 'Hello' })).toBeNull()
  })

  it('compares content identity for cleanup', () => {
    expect(
      sameAvProjectionContent(
        { type: 'deck_page', mediaId: 'm1', assetId: 'a1' },
        { type: 'deck_page', mediaId: 'm1', assetId: 'a1' },
      ),
    ).toBe(true)
    expect(
      sameAvProjectionContent(
        { type: 'video', mediaId: 'm1', assetId: 'v1' },
        { type: 'video', mediaId: 'm1', assetId: 'v1' },
      ),
    ).toBe(true)
    expect(
      sameAvProjectionContent(
        { type: 'video', mediaId: 'm1', assetId: 'v1' },
        { type: 'audio', mediaId: 'm1', assetId: 'v1' },
      ),
    ).toBe(false)
    expect(
      sameAvProjectionContent(
        { type: 'youtube', videoId: 'dQw4w9WgXcQ', canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        { type: 'youtube', videoId: 'dQw4w9WgXcQ', canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      ),
    ).toBe(true)
    expect(
      sameAvProjectionContent(
        { type: 'livestream', url: 'https://example.com/live.m3u8', streamType: 'hls' },
        { type: 'livestream', url: 'https://example.com/live.m3u8', streamType: 'direct' },
      ),
    ).toBe(false)
    expect(
      sameAvProjectionContent(
        { type: 'web_page', url: 'https://example.com/page' },
        { type: 'web_page', url: 'https://example.com/page' },
      ),
    ).toBe(true)
  })

  it('withholds youtube, livestream, and web_page from Room payloads', () => {
    for (const content of [
      { type: 'youtube' as const, videoId: 'dQw4w9WgXcQ', canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { type: 'livestream' as const, url: 'https://example.com/live.m3u8', streamType: 'hls' as const },
      { type: 'web_page' as const, url: 'https://example.com/page' },
    ]) {
      const command = buildAvProjectionCommand({
        sessionId: 'shared',
        commandId: 4,
        ...layers,
        screenState: 'live',
        itemTitle: 'Remote',
        nextPreview: null,
        content,
        playback: { action: 'play', volume: 1, muted: false, loop: false },
      })
      expect(lyricsPayloadFromCommand(command)).toBeNull()
    }
  })
})
