import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { components } from '@/api/schema'
import { PlayerAv } from '@/components/player/av/PlayerAv'

const navigate = vi.fn()
const broadcast = vi.fn()
const closeSync = vi.fn()
const writeSessionState = vi.fn()
const writePreferences = vi.fn()
const setIndexSearchSync = vi.fn()
const setEvictionWatch = vi.fn()
const readSessionState = vi.fn()
const readPreferences = vi.fn()
const readViewState = vi.fn()
const writeViewState = vi.fn()

let viewState = { transposeByItem: {}, languageByItem: { 0: 1 } }
let projectionListener: ((message: unknown) => void) | null = null

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
    <a {...props}>{children}</a>
  ),
  useNavigate: () => navigate,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@/hooks/usePlayerIndexSearchSync', () => ({
  usePlayerIndexSearchSync: (...args: unknown[]) => setIndexSearchSync(...args),
}))

vi.mock('@/hooks/useSetlistEvictionWatch', () => ({
  useSetlistEvictionWatch: (setlistId: string | undefined, enabled: boolean) => {
    setEvictionWatch(setlistId, enabled)
    return false
  },
}))

let bilingualEnabled = false

vi.mock('@/hooks/useTocMultilingualPreference', () => ({
  useTocMultilingualPreference: () => true,
}))

vi.mock('@/hooks/useAvBilingualPreference', () => ({
  useAvBilingualPreference: () => bilingualEnabled,
}))

vi.mock('@/lib/player/av-projection-sync', () => ({
  AV_PROJECTION_SHARED_SESSION_ID: 'shared',
  createAvProjectionChannel: (_sessionId: string, listener?: (message: unknown) => void) => {
    projectionListener = listener ?? null
    return {
      send: broadcast,
      close: closeSync,
      readLatestCommand: vi.fn(),
    }
  },
  createAvProjectionSync: () => ({
    broadcast,
    close: closeSync,
    readLatest: vi.fn(),
  }),
  getAvProjectionSessionId: () => 'shared',
  newAvOutputWindowName: () => 'wv-av-output-test',
}))

vi.mock('@/lib/player/av-preferences', () => ({
  AV_TEXT_SHADOW_LIGHT_THRESHOLD: 50,
  DEFAULT_AV_PREFERENCES: {
    contentLayer: {
      maxLinesPerSlide: 2,
      balanceSlideLines: true,
      fontSize: 60,
      textAlign: 'center',
      verticalAlign: 'center',
      horizontalAlign: 'center',
      textShadow: 'none',
      textTransform: 'uppercase',
      primaryTextLightness: 100,
      secondaryTextLightness: 65,
    },
    backgroundLayer: { preset: 2 },
    transition: { style: 'none', durationMs: 0 },
    projection: { outputFullscreenOnDblClick: true },
  },
  resolveAvTextLightness: (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(100, Math.max(0, Math.trunc(value)))
      : fallback,
  buildAvProjectionPayload: (input: unknown) => input,
  effectiveAvTransition: (transition: unknown) => transition,
  readAvPreferences: () => readPreferences(),
  writeAvPreferences: (...args: unknown[]) => writePreferences(...args),
}))

vi.mock('@/lib/player/av-session-state', () => ({
  readAvSessionState: (...args: unknown[]) => readSessionState(...args),
  writeAvSessionState: (...args: unknown[]) => writeSessionState(...args),
}))

vi.mock('@/lib/player/player-view-state', () => ({
  readPlayerViewState: (...args: unknown[]) => readViewState(...args),
  writePlayerViewState: (...args: unknown[]) => writeViewState(...args),
  setLanguageForItem: (state: unknown, itemIndex: number, languageIndex: number) => {
    const next = state as { languageByItem?: Record<number, number> }
    return {
      ...(next ?? {}),
      languageByItem: { ...(next?.languageByItem ?? {}), [itemIndex]: languageIndex },
    }
  },
  clearLanguageForItem: (state: unknown, itemIndex: number) => {
    const next = state as { languageByItem?: Record<number, number> }
    const languageByItem = { ...(next?.languageByItem ?? {}) }
    delete languageByItem[itemIndex]
    return { ...(next ?? {}), languageByItem }
  },
}))

vi.mock('@/components/player/PlayerEditMenu', () => ({
  PlayerEditMenu: () => null,
}))

vi.mock('@/components/player/av/AvOutlinePanel', () => ({
  AvOutlinePanel: ({ rows }: { rows: Array<{ label: string; slideIndex: number }> }) => (
    <div data-testid="outline-rows">{rows.map((row) => row.label).join('|')}</div>
  ),
}))

vi.mock('@/components/player/av/AvSectionShortcuts', () => ({
  AvSectionShortcuts: () => null,
}))

vi.mock('@/components/player/av/AvBackgroundSelector', () => ({
  AvBackgroundSelector: () => <div data-testid="background-selector" />,
}))

vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: ({
    contentText,
    contentLines,
    deckPage,
    timedPreview,
  }: {
    contentText?: string
    contentLines?: Array<{ primary: string; secondary?: string }>
    deckPage?: { mediaId: string; assetId: string }
    timedPreview?: { kind: string; title: string }
  }) => (
    <div data-testid="preview-text">
      {timedPreview
        ? `media:${timedPreview.kind}:${timedPreview.title}`
        : deckPage
          ? `deck:${deckPage.mediaId}:${deckPage.assetId}`
          : contentLines
            ? contentLines
                .map((line) =>
                  line.secondary ? `${line.primary}|${line.secondary}` : line.primary,
                )
                .join('//')
            : contentText}
    </div>
  ),
}))

vi.mock('@/components/player/av/AvSlidesPanel', () => ({
  AvSlidesPanel: ({
    entries,
    currentSlideIndex,
    onSelectSlide,
  }: {
    entries: Array<{ text: string; slideIndex: number }>
    currentSlideIndex: number | null
    onSelectSlide: (slideIndex: number) => void
  }) => (
    <div>
      <div data-testid="slide-entry-texts">{entries.map((entry) => entry.text).join('|')}</div>
      <div data-testid="selected-slide-index">{String(currentSlideIndex)}</div>
      {entries.map((entry) => (
        <button
          key={entry.slideIndex}
          type="button"
          onClick={() => onSelectSlide(entry.slideIndex)}
        >
          Select slide {entry.slideIndex}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/player/PlayerTocSidebar', () => ({
  PlayerTocSidebar: ({
    currentLanguageIndex,
    onSelect,
  }: {
    currentLanguageIndex: number | null
    onSelect: (sourceIdx: number, languageIndex: number | null) => void
  }) => (
    <div>
      <div data-testid="toc-current-language">{String(currentLanguageIndex)}</div>
      <button type="button" onClick={() => onSelect(0, 1)}>
        German row
      </button>
      <button type="button" onClick={() => onSelect(0, 0)}>
        English row
      </button>
    </div>
  ),
}))

type Player = components['schemas']['Player']

const player = {
  index: 0,
  toc: [
    {
      idx: 0,
      nr: '1',
      title: 'Anchor',
      id: 'song-1',
      liked: false,
    },
  ],
  items: [
    {
      type: 'chords',
      language: 'de',
      song: {
        id: 'song-1',
        blobs: [],
        not_a_song: false,
        owner: 'user:test',
        user_specific_addons: { liked: false },
        data: {
          sections: [
            {
              title: 'Verse 1',
              lines: [
                {
                  parts: [{ comment: false, languages: ['Hello', 'Hallo'] }],
                },
              ],
            },
            {
              title: 'Chorus',
              lines: [
                {
                  parts: [{ comment: false, languages: ['Goodbye', 'Tschuess'] }],
                },
              ],
            },
          ],
          languages: ['en', 'de'],
          titles: ['Anchor', 'Anker'],
        },
      },
    },
  ] as Player['items'],
} as Player

const secondSongItem = {
  type: 'chords',
  language: 'en',
  song: {
    id: 'song-2',
    blobs: [],
    not_a_song: false,
    owner: 'user:test',
    user_specific_addons: { liked: false },
    data: {
      sections: [
        {
          title: 'Verse 1',
          lines: [
            {
              parts: [{ comment: false, languages: ['Second song line'] }],
            },
          ],
        },
      ],
      languages: ['en'],
      titles: ['Second Song'],
    },
  },
} as Player['items'][number]

const twoItemPlayer = {
  index: 0,
  toc: [
    {
      idx: 0,
      nr: '1',
      title: 'Anchor',
      id: 'song-1',
      liked: false,
    },
    {
      idx: 1,
      nr: '2',
      title: 'Second Song',
      id: 'song-2',
      liked: false,
    },
  ],
  items: [...player.items, secondSongItem],
} as Player

beforeEach(() => {
  bilingualEnabled = false
  projectionListener = null
  navigate.mockReset()
  broadcast.mockReset()
  closeSync.mockReset()
  writeSessionState.mockReset()
  writePreferences.mockReset()
  setIndexSearchSync.mockReset()
  setEvictionWatch.mockReset()
  readSessionState.mockReset().mockReturnValue({
    itemIndex: 0,
    slideIndex: 0,
    screenState: 'live',
  })
  readPreferences.mockReset().mockReturnValue({
    contentLayer: {
      maxLinesPerSlide: 2,
      balanceSlideLines: true,
      fontSize: 60,
      textAlign: 'center',
      verticalAlign: 'center',
      horizontalAlign: 'center',
      textShadow: 'none',
      textTransform: 'uppercase',
      primaryTextLightness: 100,
      secondaryTextLightness: 65,
    },
    backgroundLayer: { preset: 2 },
    transition: { style: 'none', durationMs: 0 },
    projection: { outputFullscreenOnDblClick: true },
  })
  viewState = { transposeByItem: {}, languageByItem: { 0: 1 } }
  readViewState.mockReset().mockReturnValue(viewState)
  writeViewState.mockReset().mockImplementation((...args: unknown[]) => {
    const next = args[2] as typeof viewState
    viewState = next
  })
})

describe('PlayerAv', () => {
  it('renders a supplied TOC sidebar in the player body', () => {
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={player}
        allowNetworkFetch={false}
        tocSidebar={<div data-testid="custom-toc-sidebar">Queue</div>}
      />,
    )

    expect(screen.getByTestId('custom-toc-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('toc-current-language')).not.toBeInTheDocument()
  })

  it('keeps AV item keyboard navigation with supplied room sidebars', async () => {
    const user = userEvent.setup()

    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={twoItemPlayer}
        allowNetworkFetch={false}
        tocSidebar={<button type="button">Queue</button>}
        roomSidebar={<div data-testid="room-sidebar">Room</div>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument()
    expect(screen.getByTestId('room-sidebar')).toBeInTheDocument()

    await user.keyboard('n')

    expect(screen.getByText('Second Song')).toBeInTheDocument()
  })

  it('shows the header language switcher and updates AV content from it', async () => {
    viewState = { transposeByItem: {}, languageByItem: { 0: 0 } }
    readViewState.mockReturnValue(viewState)
    const user = userEvent.setup()

    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={player}
        allowNetworkFetch={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'player.language.current' })).toHaveTextContent('en')
    expect(screen.getByTestId('preview-text')).toHaveTextContent('Hello')

    await user.click(screen.getByRole('button', { name: 'player.language.current' }))
    await user.click(screen.getByRole('button', { name: 'de' }))

    expect(screen.getByRole('button', { name: 'player.language.current' })).toHaveTextContent('de')
    expect(screen.getByText('Anker')).toBeInTheDocument()
    expect(screen.getByTestId('preview-text')).toHaveTextContent('Hallo')

    await waitFor(() => {
      expect(writeViewState).toHaveBeenCalledWith(
        'setlist',
        'setlist-1',
        expect.objectContaining({
          languageByItem: { 0: 1 },
        }),
      )
    })
  })

  it('reads the stored per-item language and updates AV content from the TOC selection', async () => {
    const user = userEvent.setup()

    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={player}
        allowNetworkFetch={false}
      />,
    )

    expect(screen.getByTestId('toc-current-language')).toHaveTextContent('1')
    expect(screen.getByText('Anker')).toBeInTheDocument()
    expect(screen.getByTestId('preview-text')).toHaveTextContent('Hallo')
    expect(screen.getByTestId('slide-entry-texts')).toHaveTextContent('Hallo|Tschuess')

    await user.click(screen.getByRole('button', { name: 'English row' }))

    expect(screen.getByTestId('toc-current-language')).toHaveTextContent('0')
    expect(screen.getByText('Anchor')).toBeInTheDocument()
    expect(screen.getByTestId('preview-text')).toHaveTextContent('Hello')
    expect(screen.getByTestId('slide-entry-texts')).toHaveTextContent('Hello|Goodbye')

    await waitFor(() => {
      expect(writeViewState).toHaveBeenCalledWith(
        'setlist',
        'setlist-1',
        expect.objectContaining({
          languageByItem: { 0: 0 },
        }),
      )
    })
  })

  it('shows bilingual structured preview content when the preference is enabled', () => {
    bilingualEnabled = true

    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={player}
        allowNetworkFetch={false}
      />,
    )

    expect(screen.getByTestId('preview-text')).toHaveTextContent('Hallo|Hello')
  })

  it('broadcasts structured contentLines when bilingual AV is enabled', async () => {
    bilingualEnabled = true
    const user = userEvent.setup()

    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={player}
        allowNetworkFetch={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'English row' }))

    await waitFor(() => {
      expect(broadcast).toHaveBeenCalled()
    })

    const lastPayload = broadcast.mock.calls.at(-1)?.[0] as {
      content?: { type: string; contentText?: string; contentLines?: Array<{ primary: string; secondary?: string }> }
    }
    expect(lastPayload.content).toEqual({
      type: 'lyrics',
      contentText: 'Hello',
      contentLines: [{ primary: 'Hello', secondary: 'Hallo' }],
    })
  })

  it('does not republish an unchanged room projection when the callback changes', async () => {
    const user = userEvent.setup()
    const firstRoomProjectionChange = vi.fn()
    const nextRoomProjectionChange = vi.fn()
    const { rerender } = render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={player}
        allowNetworkFetch={false}
        canControlRoomProjection
        onRoomProjectionChange={firstRoomProjectionChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'English row' }))
    await waitFor(() => expect(firstRoomProjectionChange).toHaveBeenCalled())

    rerender(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={player}
        allowNetworkFetch={false}
        canControlRoomProjection
        onRoomProjectionChange={nextRoomProjectionChange}
      />,
    )

    await waitFor(() => expect(nextRoomProjectionChange).not.toHaveBeenCalled())
  })

  it('keeps the projected output on the last selected slide when switching songs', async () => {
    const user = userEvent.setup()

    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={twoItemPlayer}
        allowNetworkFetch={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select slide 1' }))

    await waitFor(() => {
      expect(broadcast).toHaveBeenCalled()
    })

    const projectedPayload = broadcast.mock.calls.at(-1)?.[0] as {
      content?: { type: string; contentText?: string }
    }
    expect(projectedPayload.content?.contentText).toBe('Tschuess')

    broadcast.mockClear()

    await user.keyboard('n')

    expect(screen.getByText('Second Song')).toBeInTheDocument()
    expect(screen.getByTestId('preview-text')).toHaveTextContent('Tschuess')

    for (const call of broadcast.mock.calls) {
      const payload = call[0] as { content?: { type: string; contentText?: string } }
      expect(payload.content?.contentText).not.toBe('Second song line')
    }

    await user.click(screen.getByRole('button', { name: 'Select slide 0' }))

    await waitFor(() => {
      expect(broadcast).toHaveBeenCalled()
    })

    expect(screen.getByTestId('preview-text')).toHaveTextContent('Second song line')
    const nextPayload = broadcast.mock.calls.at(-1)?.[0] as {
      content?: { type: string; contentText?: string }
    }
    expect(nextPayload.content?.contentText).toBe('Second song line')
  })

  it('lets an AV-only room host navigate slides without changing musical state', async () => {
    const user = userEvent.setup()
    const onRoomProjectionChange = vi.fn()
    const onRoomMusicalStateChange = vi.fn()

    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={twoItemPlayer}
        allowNetworkFetch={false}
        roomMusicalState={{ item_index: 0, language: 'de', transposition: null }}
        canControlRoomProjection
        canControlRoomMusicalState={false}
        onRoomProjectionChange={onRoomProjectionChange}
        onRoomMusicalStateChange={onRoomMusicalStateChange}
      />,
    )

    await user.keyboard('{ArrowRight}')
    await waitFor(() => {
      expect(onRoomProjectionChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ contentText: 'Tschuess' }),
      )
    })

    await user.keyboard('{Home}')
    await waitFor(() => {
      expect(onRoomProjectionChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ contentText: 'Hallo' }),
      )
    })

    await user.keyboard('{End}')
    await waitFor(() => {
      expect(onRoomProjectionChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ contentText: 'Tschuess' }),
      )
    })

    await user.keyboard('{PageUp}{PageDown}n')

    expect(screen.getByText('Anker')).toBeInTheDocument()
    expect(screen.queryByText('Second Song')).not.toBeInTheDocument()
    expect(onRoomMusicalStateChange).not.toHaveBeenCalled()
  })

  const deckPlayer = {
    index: 0,
    toc: [{ idx: 0, nr: '', title: 'Deck', id: 'media-1', liked: false }],
    items: [
      {
        type: 'media',
        id: 'media-1',
        title: 'Deck',
        content: {
          type: 'slide_deck',
          pages: [{ blob_id: 'page-a' }, { blob_id: 'page-b' }],
        },
      },
    ],
  } as Player

  const mixedPlayer = {
    index: 0,
    toc: [
      { idx: 0, nr: '1', title: 'Anchor', id: 'song-1', liked: false },
      { idx: 1, nr: '', title: 'Deck', id: 'media-1', liked: false },
    ],
    items: [
      ...player.items,
      {
        type: 'media',
        id: 'media-1',
        title: 'Deck',
        content: {
          type: 'slide_deck',
          pages: [{ blob_id: 'page-a' }, { blob_id: 'page-b' }],
        },
      },
    ],
  } as Player

  it('does not watch media setlists for offline mirror eviction', () => {
    render(
      <PlayerAv
        type="setlist"
        id="setlist-with-media"
        player={mixedPlayer}
        allowNetworkFetch={false}
      />,
    )

    expect(setEvictionWatch).toHaveBeenLastCalledWith(undefined, false)
  })

  it('I3: warns when a page is projected with no ready output', async () => {
    const user = userEvent.setup()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={player}
        allowNetworkFetch={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select slide 1' }))
    await waitFor(() => {
      expect(screen.getByText('player.av.missingOutput')).toBeInTheDocument()
    })
  })

  it('projects a selected deck page as a tagged command and not through Rooms', async () => {
    const user = userEvent.setup()
    const onRoomProjectionChange = vi.fn()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={deckPlayer}
        allowNetworkFetch={false}
        canControlRoomProjection
        onRoomProjectionChange={onRoomProjectionChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select slide 1' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    const command = broadcast.mock.calls.at(-1)?.[0] as {
      type?: string
      content?: { type: string; mediaId?: string; assetId?: string }
    }
    expect(command.type).toBe('command')
    expect(command.content).toEqual({ type: 'deck_page', mediaId: 'media-1', assetId: 'page-b' })
    expect(screen.getByTestId('preview-text')).toHaveTextContent('deck:media-1:page-b')
    expect(onRoomProjectionChange).not.toHaveBeenCalled()
  })

  it('keeps the projected lyric when selecting a mixed-setlist deck TOC row', async () => {
    const user = userEvent.setup()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={mixedPlayer}
        allowNetworkFetch={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select slide 1' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    const lyricCommand = broadcast.mock.calls.at(-1)?.[0] as {
      content?: { type: string; contentText?: string }
    }
    expect(lyricCommand.content?.contentText).toBe('Tschuess')

    broadcast.mockClear()
    await user.keyboard('n')
    expect(screen.getByText('Deck')).toBeInTheDocument()
    expect(screen.getByTestId('preview-text')).toHaveTextContent('Tschuess')
    for (const call of broadcast.mock.calls) {
      const payload = call[0] as { content?: { type: string } }
      expect(payload.content?.type).not.toBe('deck_page')
    }
  })

  const videoPlayer = {
    index: 0,
    toc: [{ idx: 0, nr: '', title: 'Clip', id: 'media-2', liked: false }],
    items: [
      {
        type: 'media',
        id: 'media-2',
        title: 'Clip',
        content: { type: 'video', blob_id: 'v1', duration_ms: 4000, width: 1920, height: 1080 },
      },
    ],
  } as Player

  const mixedVideoPlayer = {
    index: 0,
    toc: [
      { idx: 0, nr: '1', title: 'Anchor', id: 'song-1', liked: false },
      { idx: 1, nr: '', title: 'Clip', id: 'media-2', liked: false },
    ],
    items: [
      ...player.items,
      {
        type: 'media',
        id: 'media-2',
        title: 'Clip',
        content: { type: 'video', blob_id: 'v1', duration_ms: 4000, width: 1920, height: 1080 },
      },
    ],
  } as Player

  async function helloOutput() {
    await waitFor(() => expect(projectionListener).toBeTruthy())
    act(() => {
      projectionListener?.({ type: 'hello', sessionId: 'shared', outputId: 'out-1', ready: true })
    })
  }

  it('I4: keeps the projected lyric when selecting a mixed-setlist video TOC row', async () => {
    const user = userEvent.setup()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={mixedVideoPlayer}
        allowNetworkFetch={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select slide 1' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    broadcast.mockClear()
    await user.keyboard('n')
    expect(screen.getByRole('button', { name: 'player.av.play' })).toBeInTheDocument()
    expect(screen.getByTestId('preview-text')).toHaveTextContent('Tschuess')
    expect(screen.queryByTestId('av-projected-video')).not.toBeInTheDocument()
    for (const call of broadcast.mock.calls) {
      const payload = call[0] as { content?: { type: string } }
      expect(payload.content?.type).not.toBe('video')
    }
  })

  it('I4: warns on Play with no output and leaves projection unchanged', async () => {
    const user = userEvent.setup()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={mixedVideoPlayer}
        allowNetworkFetch={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Select slide 1' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    broadcast.mockClear()
    await user.keyboard('n')
    await user.click(screen.getByRole('button', { name: 'player.av.play' }))
    expect(screen.getByText('player.av.missingOutputPlay')).toBeInTheDocument()
    expect(screen.getByTestId('preview-text')).toHaveTextContent('Tschuess')
    for (const call of broadcast.mock.calls) {
      const payload = call[0] as { content?: { type: string } }
      expect(payload.content?.type).not.toBe('video')
    }
  })

  it('I4: Play replaces the output with uploaded video and stays silent on the controller', async () => {
    const user = userEvent.setup()
    const onRoomProjectionChange = vi.fn()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={videoPlayer}
        allowNetworkFetch={false}
        canControlRoomProjection
        onRoomProjectionChange={onRoomProjectionChange}
      />,
    )
    await helloOutput()
    await user.click(screen.getByRole('button', { name: 'player.av.play' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    const command = broadcast.mock.calls.at(-1)?.[0] as {
      type?: string
      content?: { type: string; mediaId?: string; assetId?: string }
      playback?: { action?: string }
    }
    expect(command.type).toBe('command')
    expect(command.content).toEqual({ type: 'video', mediaId: 'media-2', assetId: 'v1' })
    expect(command.playback?.action).toBe('play')
    expect(screen.getByTestId('preview-text')).toHaveTextContent('media:video:Clip')
    expect(screen.queryByTestId('av-projected-video')).not.toBeInTheDocument()
    expect(onRoomProjectionChange).not.toHaveBeenCalled()
  })

  it('I4: pause issues a same-content playback command', async () => {
    const user = userEvent.setup()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={videoPlayer}
        allowNetworkFetch={false}
      />,
    )
    await helloOutput()
    await user.click(screen.getByRole('button', { name: 'player.av.play' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    broadcast.mockClear()
    await user.click(screen.getByRole('button', { name: 'player.av.pause' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    const command = broadcast.mock.calls.at(-1)?.[0] as {
      content?: { type: string }
      playback?: { action?: string }
    }
    expect(command.content?.type).toBe('video')
    expect(command.playback?.action).toBe('pause')
  })

  it('I4: Blank pauses projected video and Live restores paused rather than playing', async () => {
    const user = userEvent.setup()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={videoPlayer}
        allowNetworkFetch={false}
      />,
    )
    await helloOutput()
    await user.click(screen.getByRole('button', { name: 'player.av.play' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    broadcast.mockClear()
    await user.keyboard('r')
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    const blankCommand = broadcast.mock.calls.at(-1)?.[0] as {
      screenState?: string
      playback?: { action?: string }
      content?: { type: string }
    }
    expect(blankCommand.screenState).toBe('blank')
    expect(blankCommand.playback?.action).toBe('pause')
    expect(blankCommand.content?.type).toBe('video')
    broadcast.mockClear()
    await user.keyboard('r')
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    const liveCommand = broadcast.mock.calls.at(-1)?.[0] as {
      screenState?: string
      playback?: { action?: string }
    }
    expect(liveCommand.screenState).toBe('live')
    expect(liveCommand.playback?.action).toBe('pause')
  })

  const youtubePlayer = {
    index: 0,
    toc: [{ idx: 0, nr: '', title: 'Clip', id: 'media-yt', liked: false }],
    items: [
      {
        type: 'media',
        id: 'media-yt',
        title: 'Clip',
        content: {
          type: 'youtube',
          video_id: 'dQw4w9WgXcQ',
          canonical_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      },
    ],
  } as Player

  const mixedYoutubePlayer = {
    index: 0,
    toc: [
      { idx: 0, nr: '1', title: 'Anchor', id: 'song-1', liked: false },
      { idx: 1, nr: '', title: 'Clip', id: 'media-yt', liked: false },
    ],
    items: [
      ...player.items,
      {
        type: 'media',
        id: 'media-yt',
        title: 'Clip',
        content: {
          type: 'youtube',
          video_id: 'dQw4w9WgXcQ',
          canonical_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      },
    ],
  } as Player

  const livestreamPlayer = {
    index: 0,
    toc: [{ idx: 0, nr: '', title: 'Stream', id: 'media-live', liked: false }],
    items: [
      {
        type: 'media',
        id: 'media-live',
        title: 'Stream',
        content: { type: 'livestream', url: 'https://example.com/live.m3u8', stream_type: 'hls' },
      },
    ],
  } as Player

  const spotifyPlayer = {
    index: 0,
    toc: [{ idx: 0, nr: '', title: 'Prelude', id: 'media-spotify', liked: false }],
    items: [
      {
        type: 'media',
        id: 'media-spotify',
        title: 'Prelude',
        content: {
          type: 'spotify',
          resource_type: 'playlist',
          spotify_id: '37i9dQZF1DXcBWIGoYBM5M',
          canonical_url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
        },
      },
    ],
  } as Player

  const webPlayer = {
    index: 0,
    toc: [{ idx: 0, nr: '', title: 'Bulletin', id: 'media-web', liked: false }],
    items: [
      {
        type: 'media',
        id: 'media-web',
        title: 'Bulletin',
        content: { type: 'web_page', url: 'https://example.com/bulletin' },
      },
    ],
  } as Player

  it('I5: keeps the projected lyric when selecting YouTube, livestream, or web TOC rows', async () => {
    const user = userEvent.setup()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={mixedYoutubePlayer}
        allowNetworkFetch={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Select slide 1' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    broadcast.mockClear()
    await user.keyboard('n')
    expect(screen.getByRole('button', { name: 'player.av.play' })).toBeInTheDocument()
    expect(screen.getByTestId('preview-text')).toHaveTextContent('Tschuess')
    for (const call of broadcast.mock.calls) {
      const payload = call[0] as { content?: { type: string } }
      expect(payload.content?.type).not.toBe('youtube')
    }
  })

  it('I5: Play replaces the output with YouTube content and stays silent on the controller', async () => {
    const user = userEvent.setup()
    const onRoomProjectionChange = vi.fn()
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={youtubePlayer}
        allowNetworkFetch={false}
        canControlRoomProjection
        onRoomProjectionChange={onRoomProjectionChange}
      />,
    )
    await helloOutput()
    await user.click(screen.getByRole('button', { name: 'player.av.play' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    const command = broadcast.mock.calls.at(-1)?.[0] as {
      content?: { type: string; videoId?: string }
      playback?: { action?: string }
    }
    expect(command.content).toEqual({
      type: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
    expect(command.playback?.action).toBe('play')
    expect(screen.getByTestId('preview-text')).toHaveTextContent('media:youtube:Clip')
    expect(screen.queryByTestId('av-projected-youtube')).not.toBeInTheDocument()
    expect(onRoomProjectionChange).not.toHaveBeenCalled()
  })

  it('I5: livestream without a DVR range does not expose seek', async () => {
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={livestreamPlayer}
        allowNetworkFetch={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'player.av.play' })).toBeInTheDocument()
    expect(screen.queryByLabelText('player.av.seek')).not.toBeInTheDocument()
  })

  it('opens Spotify externally without sending playback to an output', () => {
    render(
      <PlayerAv
        type="setlist"
        id="setlist-1"
        player={spotifyPlayer}
        allowNetworkFetch={false}
      />,
    )

    const open = screen.getByRole('link', { name: 'media.actions.openSpotify' })
    expect(open).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    )
    expect(open).toHaveAttribute('target', '_blank')
    expect(screen.getByTestId('av-spotify-panel')).toBeInTheDocument()
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('I5: web pages require Show and warn when no output is open', async () => {
    const user = userEvent.setup()
    render(
      <PlayerAv type="setlist" id="setlist-1" player={webPlayer} allowNetworkFetch={false} />,
    )
    expect(screen.getByRole('button', { name: 'player.av.show' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'player.av.play' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'player.av.show' }))
    expect(screen.getByText('player.av.missingOutputShow')).toBeInTheDocument()
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('I5: Show projects a web page and Hide/Reload issue pause/restart', async () => {
    const user = userEvent.setup()
    render(
      <PlayerAv type="setlist" id="setlist-1" player={webPlayer} allowNetworkFetch={false} />,
    )
    await helloOutput()
    await user.click(screen.getByRole('button', { name: 'player.av.show' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    expect(broadcast.mock.calls.at(-1)?.[0]).toMatchObject({
      content: { type: 'web_page', url: 'https://example.com/bulletin' },
      playback: { action: 'play' },
    })
    broadcast.mockClear()
    await user.click(screen.getByRole('button', { name: 'player.av.hide' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    expect(broadcast.mock.calls.at(-1)?.[0]).toMatchObject({ playback: { action: 'pause' } })
    broadcast.mockClear()
    await user.click(screen.getByRole('button', { name: 'player.av.show' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    broadcast.mockClear()
    await user.click(screen.getByRole('button', { name: 'player.av.reload' }))
    await waitFor(() => expect(broadcast).toHaveBeenCalled())
    expect(broadcast.mock.calls.at(-1)?.[0]).toMatchObject({ playback: { action: 'restart' } })
  })
})
