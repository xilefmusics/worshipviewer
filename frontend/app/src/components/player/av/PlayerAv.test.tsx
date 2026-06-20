import { render, screen, waitFor } from '@testing-library/react'
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
  useSetlistEvictionWatch: () => {
    setEvictionWatch()
    return false
  },
}))

vi.mock('@/hooks/useTocMultilingualPreference', () => ({
  useTocMultilingualPreference: () => true,
}))

vi.mock('@/lib/player/av-projection-sync', () => ({
  AV_PROJECTION_SHARED_SESSION_ID: 'shared',
  createAvProjectionSync: () => ({
    broadcast,
    close: closeSync,
    readLatest: vi.fn(),
  }),
  getAvProjectionSessionId: () => 'shared',
}))

vi.mock('@/lib/player/av-preferences', () => ({
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
    },
    backgroundLayer: { preset: 2 },
    transition: { style: 'none', durationMs: 0 },
    projection: { outputFullscreenOnDblClick: true },
  },
  buildAvProjectionPayload: (input: unknown) => input,
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

vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: ({ contentText }: { contentText: string }) => (
    <div data-testid="preview-text">{contentText}</div>
  ),
}))

vi.mock('@/components/player/av/AvSlidesPanel', () => ({
  AvSlidesPanel: ({
    entries,
    currentSlideIndex,
  }: {
    entries: Array<{ text: string; slideIndex: number }>
    currentSlideIndex: number | null
  }) => (
    <div>
      <div data-testid="slide-entry-texts">{entries.map((entry) => entry.text).join('|')}</div>
      <div data-testid="selected-slide-index">{String(currentSlideIndex)}</div>
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

beforeEach(() => {
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
})
