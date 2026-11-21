import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AvOutputPage } from '@/components/player/av/AvOutputPage'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'
import { buildAvProjectionCommand } from '@/lib/player/av-projection-protocol'

let slideViewProps: Record<string, unknown> | null = null
let onMessage: ((message: unknown) => void) | null = null
const send = vi.fn()
const native = vi.hoisted(() => ({ isTauri: vi.fn(() => false), invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/core', () => native)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: (props: Record<string, unknown>) => {
    slideViewProps = props
    return <div data-testid="slide-view" />
  },
}))

vi.mock('@/components/player/av/AvProjectedRemoteLayer', () => ({
  AvProjectedRemoteLayer: ({ command }: { command: { content: { type: string } } }) => (
    <div data-testid="projected-media">{command.content.type}</div>
  ),
}))

vi.mock('@/lib/player/av-projection-sync', () => ({
  createAvProjectionChannel: (_sessionId: string, listener: (message: unknown) => void) => {
    onMessage = listener
    return {
      send,
      readLatestCommand: () => null,
      close: vi.fn(),
    }
  },
  readOrCreateAvOutputId: () => 'out-1',
}))

const layers = {
  contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
  backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
  transition: DEFAULT_AV_PREFERENCES.transition,
}

beforeEach(() => {
  slideViewProps = null
  onMessage = null
  send.mockReset()
  native.isTauri.mockReturnValue(false)
  native.invoke.mockClear()
  window.history.replaceState(null, '', '/')
})

describe('AvOutputPage', () => {
  it('waits for the background before showing a native display', async () => {
    native.isTauri.mockReturnValue(true)
    const animationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    window.history.replaceState(null, '', '/?nativeDisplay=1')
    const pending = document.createElement('span')
    pending.setAttribute('data-av-background-pending', '')
    document.body.appendChild(pending)
    render(<AvOutputPage sessionId="shared" />)
    act(() => {
      onMessage?.(buildAvProjectionCommand({
        sessionId: 'shared', commandId: 1, ...layers, screenState: 'live',
        itemTitle: 'Song', nextPreview: null, content: { type: 'lyrics', contentText: 'Hello' },
      }))
    })
    expect(native.invoke).not.toHaveBeenCalled()
    pending.remove()
    await waitFor(() => expect(native.invoke).toHaveBeenCalledWith('presentation_ready'))
    animationFrame.mockRestore()
  })

  it('renders structured content lines when the command includes them', async () => {
    render(<AvOutputPage sessionId="shared" />)
    act(() => {
      onMessage?.(
        buildAvProjectionCommand({
          sessionId: 'shared',
          commandId: 1,
          ...layers,
          screenState: 'live',
          itemTitle: 'Song',
          nextPreview: null,
          content: {
            type: 'lyrics',
            contentText: 'Hello',
            contentLines: [{ primary: 'Hello', secondary: 'Hallo' }],
          },
        }),
      )
    })

    await waitFor(() => {
      expect(slideViewProps?.contentLines).toEqual([{ primary: 'Hello', secondary: 'Hallo' }])
    })
    expect(slideViewProps?.contentText).toBeUndefined()
    expect(slideViewProps?.screenState).toBe('live')
  })

  it('falls back to contentText when structured lines are absent', async () => {
    render(<AvOutputPage sessionId="shared" />)
    act(() => {
      onMessage?.(
        buildAvProjectionCommand({
          sessionId: 'shared',
          commandId: 1,
          ...layers,
          screenState: 'live',
          itemTitle: 'Song',
          nextPreview: null,
          content: { type: 'lyrics', contentText: 'Hello' },
        }),
      )
    })

    await waitFor(() => {
      expect(slideViewProps?.contentText).toBe('Hello')
    })
    expect(slideViewProps?.contentLines).toBeUndefined()
  })

  it('passes blank screen state without structured lines leaking through the view props', async () => {
    render(<AvOutputPage sessionId="shared" />)
    act(() => {
      onMessage?.(
        buildAvProjectionCommand({
          sessionId: 'shared',
          commandId: 2,
          ...layers,
          screenState: 'blank',
          itemTitle: 'Song',
          nextPreview: null,
          content: { type: 'lyrics', contentText: '' },
        }),
      )
    })

    await waitFor(() => {
      expect(slideViewProps?.screenState).toBe('blank')
    })
    expect(slideViewProps?.contentText).toBe('')
    expect(slideViewProps?.contentLines).toBeUndefined()
  })

  it('projects a deck page over the current background', async () => {
    render(<AvOutputPage sessionId="shared" />)
    act(() => {
      onMessage?.(
        buildAvProjectionCommand({
          sessionId: 'shared',
          commandId: 3,
          ...layers,
          screenState: 'live',
          itemTitle: 'Deck',
          nextPreview: null,
          content: { type: 'deck_page', mediaId: 'media-1', assetId: 'page-a' },
        }),
      )
    })

    await waitFor(() => {
      expect(slideViewProps?.deckPage).toEqual({ mediaId: 'media-1', assetId: 'page-a' })
    })
    expect(slideViewProps?.screenState).toBe('live')
  })

  it('I4: mounts uploaded media for a video command and defers the initial ack', async () => {
    render(<AvOutputPage sessionId="shared" />)
    act(() => {
      onMessage?.(
        buildAvProjectionCommand({
          sessionId: 'shared',
          commandId: 4,
          ...layers,
          screenState: 'live',
          itemTitle: 'Clip',
          nextPreview: null,
          content: { type: 'video', mediaId: 'media-2', assetId: 'v1' },
          playback: { action: 'play', volume: 1, muted: false, loop: false },
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('projected-media')).toHaveTextContent('video')
    })
    const videoAcks = send.mock.calls.filter((call) => {
      const message = call[0] as { type?: string; playback?: unknown }
      return message.type === 'ack' && message.playback
    })
    expect(videoAcks).toHaveLength(0)
  })

  it('I5: mounts remote layers for youtube, livestream, and web_page and defers the ack', async () => {
    render(<AvOutputPage sessionId="shared" />)
    let commandId = 10
    for (const content of [
      {
        type: 'youtube' as const,
        videoId: 'dQw4w9WgXcQ',
        canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      { type: 'livestream' as const, url: 'https://example.com/live.m3u8', streamType: 'hls' as const },
      { type: 'web_page' as const, url: 'https://example.com/page' },
    ]) {
      send.mockClear()
      const id = commandId
      commandId += 1
      act(() => {
        onMessage?.(
          buildAvProjectionCommand({
            sessionId: 'shared',
            commandId: id,
            ...layers,
            screenState: 'live',
            itemTitle: 'Remote',
            nextPreview: null,
            content,
            playback: { action: 'play', volume: 1, muted: false, loop: false },
          }),
        )
      })
      await waitFor(() => {
        expect(screen.getByTestId('projected-media')).toHaveTextContent(content.type)
      })
      const playbackAcks = send.mock.calls.filter((call) => {
        const message = call[0] as { type?: string; playback?: unknown }
        return message.type === 'ack' && message.playback
      })
      expect(playbackAcks).toHaveLength(0)
    }
  })
})
