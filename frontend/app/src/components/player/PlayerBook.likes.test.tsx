import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { components } from '@/api/schema'
import { PlayerBook } from '@/components/player/PlayerBook'

const mocks = vi.hoisted(() => ({
  setSongLikeStatus: vi.fn(),
  toastError: vi.fn(),
}))
const localStorageState = new Map<string, string>()
const localStorageMock = {
  getItem: (key: string) => localStorageState.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageState.set(key, value),
  removeItem: (key: string) => localStorageState.delete(key),
  clear: () => localStorageState.clear(),
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    'aria-label': ariaLabel,
    hash,
  }: {
    children: React.ReactNode
    'aria-label'?: string
    hash?: string
  }) => (
    <a href="/" aria-label={ariaLabel} data-hash={hash}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, info: vi.fn() },
}))

vi.mock('@/api/songs-like', () => ({
  setSongLikeStatus: mocks.setSongLikeStatus,
}))

vi.mock('@/components/player/BlobSlide', () => ({ BlobSlide: () => null }))
vi.mock('@/components/player/ChordsSlide', () => ({
  ChordsSlide: ({ song, displayKey, soundingKey, selectedKey, capoFret, transposeOffset }: { song: components['schemas']['Song']; displayKey?: string | null; soundingKey?: string | null; selectedKey?: string | null; capoFret?: number | null; transposeOffset?: number | null }) => (
    <div data-player-chord-surface data-display-key={displayKey ?? ''} data-sounding-key={soundingKey ?? ''} data-selected-key={selectedKey ?? ''} data-capo-fret={capoFret ?? ''} data-transpose-offset={transposeOffset ?? ''}>{song.id}</div>
  ),
}))
vi.mock('@/components/player/ChordsThreeColumnSlide', () => ({
  ChordsThreeColumnSlide: ({ song, displayKey, soundingKey, selectedKey, capoFret, transposeOffset }: { song: components['schemas']['Song']; displayKey?: string | null; soundingKey?: string | null; selectedKey?: string | null; capoFret?: number | null; transposeOffset?: number | null }) => (
    <div data-player-chord-surface data-display-key={displayKey ?? ''} data-sounding-key={soundingKey ?? ''} data-selected-key={selectedKey ?? ''} data-capo-fret={capoFret ?? ''} data-transpose-offset={transposeOffset ?? ''}>{song.id}</div>
  ),
}))
vi.mock('@/components/player/PlayerBookSpread', () => ({
  PlayerBookSpread: ({ left }: { left: React.ReactNode }) => <>{left}</>,
}))
vi.mock('@/components/player/PlayerEditMenu', () => ({ PlayerEditMenu: () => null }))
vi.mock('@/components/player/PlayerLikeHeartBurst', () => ({
  PlayerLikeHeartBurst: ({ liked }: { liked: boolean }) => (
    <div data-testid="like-feedback" data-liked={liked} />
  ),
}))
vi.mock('@/components/player/PlayerTocSidebar', () => ({
  PlayerTocSidebar: ({ toc }: { toc: components['schemas']['TocItem'][] }) => (
    <div data-testid="liked-toc">
      {toc
        .filter((row) => row.liked)
        .map((row) => <div key={`${row.idx}:${row.title}`}>{row.title}</div>)}
    </div>
  ),
}))

vi.mock('@/hooks/useChordFormatPreference', () => ({
  useChordFormatPreference: () => 'letters',
}))
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsPhoneWidth: () => false,
  useMediaQuery: () => false,
}))
vi.mock('@/hooks/use-online', () => ({ useOnline: () => true }))
vi.mock('@/hooks/usePlayerIndexSearchSync', () => ({
  usePlayerIndexSearchSync: () => undefined,
}))
vi.mock('@/hooks/usePlayerScrollPreference', () => ({
  usePlayerLayoutPreference: () => ({
    linkedOrientations: true,
    portrait: {
      mode: 'page',
      pageCount: 1,
      columnCount: 1,
      nextSongPreview: false,
      overflowStyle: 'scroll',
      expandSections: false,
    },
    landscape: {
      mode: 'page',
      pageCount: 1,
      columnCount: 1,
      nextSongPreview: false,
      overflowStyle: 'scroll',
      expandSections: false,
    },
  }),
}))
vi.mock('@/hooks/useTocMultilingualPreference', () => ({
  useTocMultilingualPreference: () => false,
}))
vi.mock('@/lib/chord-engine', () => ({
  getChordEngine: async () => ({ renderA4Html: vi.fn(), renderA4SectionHtmls: vi.fn() }),
}))
vi.mock('@/lib/player/apply-song-flow', () => ({
  useResolvedSongWithFlow: (song: components['schemas']['Song']) => song,
}))

type Player = components['schemas']['Player']
type Song = components['schemas']['Song']

function song(id: string, liked: boolean, key?: string): Song {
  return {
    id,
    blobs: [],
    not_a_song: false,
    owner: 'team-1',
    user_specific_addons: { liked },
    data: { titles: [id], sections: [], ...(key ? { key } : {}) },
  } as Song
}

function player(): Player {
  return {
    index: 0,
    between_items: false,
    orientation: 'portrait',
    scroll_type: 'one_page',
    scroll_type_cache_other_orientation: 'book',
    toc: [
      { idx: 0, nr: '1', title: 'Current', id: 'song-1', liked: true },
      { idx: 1, nr: '2', title: 'Current duplicate', id: 'song-1', liked: true },
      { idx: 2, nr: '3', title: 'Other', id: 'song-2', liked: true },
    ],
    items: [
      { type: 'chords', song: song('song-1', false), language: null, flow: null },
      { type: 'chords', song: song('song-1', false), language: null, flow: null },
      { type: 'chords', song: song('song-2', false), language: null, flow: null },
    ],
  }
}

function capoPlayer(): Player {
  const value = player()
  return {
    ...value,
    items: value.items.map((item) =>
      item.type === 'chords' ? { ...item, song: song(item.song.id, item.song.user_specific_addons.liked, 'A') } : item,
    ),
  }
}

function savedCapoPlayer(): Player {
  const value = capoPlayer()
  return {
    ...value,
    items: value.items.map((item, index) =>
      item.type === 'chords' && index === 0 ? { ...item, capo_shape: { level: 10 } } : item,
    ),
  }
}

function renderPlayer(
  value: Player,
  roomSidebar: React.ReactNode = <div>room</div>,
  tocSidebar?: React.ReactNode,
  embedded = false,
  roomMusicalState?: { item_index: number; started: boolean; language: string | null; transposition: string | null },
  canControlRoomMusicalState = false,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PlayerBook
        type="setlist"
        id="setlist-1"
        player={value}
        allowNetworkFetch
        embedded={embedded}
        roomSidebar={roomSidebar}
        tocSidebar={tocSidebar}
        roomMusicalState={roomMusicalState}
        canControlRoomMusicalState={canControlRoomMusicalState}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorageState.clear()
  vi.stubGlobal('localStorage', localStorageMock)
})

afterEach(() => vi.unstubAllGlobals())

describe('PlayerBook likes', () => {
  it('renders a supplied TOC sidebar in the player chrome', () => {
    renderPlayer(
      player(),
      <div data-testid="room-sidebar-slot">room</div>,
      <div data-testid="toc-sidebar-slot">queue</div>,
    )

    expect(screen.getByTestId('toc-sidebar-slot')).toBeInTheDocument()
    expect(screen.getByTestId('room-sidebar-slot')).toBeInTheDocument()
    expect(screen.queryByTestId('liked-toc')).not.toBeInTheDocument()
  })

  it('keeps keyboard and click-zone navigation with supplied room sidebars', () => {
    const queueClick = vi.fn()
    renderPlayer(
      player(),
      <div data-testid="room-sidebar-slot">room</div>,
      <button type="button" onClick={queueClick}>queue</button>,
    )

    const main = screen.getByRole('main')
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('song-1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'queue' }))
    expect(queueClick).toHaveBeenCalledOnce()
    expect(screen.getByText('song-1')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'm' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('song-2')).toBeInTheDocument()

    fireEvent.click(main, { clientX: 1, clientY: 50, detail: 1 })
    expect(screen.getByText('song-1')).toBeInTheDocument()
  })

  it('pinches only the chord surface without navigating', () => {
    renderPlayer(player(), null)
    const main = screen.getByRole('main')
    const chordSurface = screen.getByText('song-1')
    const first = { clientX: 0, clientY: 0 }
    const second = { clientX: 100, clientY: 0 }
    const expandedSecond = { clientX: 200, clientY: 0 }

    fireEvent.touchStart(chordSurface, { touches: [first, second] })
    fireEvent.touchMove(chordSurface, { touches: [first, expandedSecond] })
    fireEvent.touchEnd(chordSurface, { touches: [], changedTouches: [first, expandedSecond] })

    expect(window.localStorage.getItem('wv_chord_song_font_scale')).toBe('2')
    expect(within(main).getByText('song-1')).toBeInTheDocument()
  })

  it('ignores two-finger gestures outside the chord surface', () => {
    renderPlayer(player(), null)
    const main = screen.getByRole('main')
    const first = { clientX: 0, clientY: 0 }
    const second = { clientX: 100, clientY: 0 }

    fireEvent.touchStart(main, { touches: [first, second] })
    fireEvent.touchMove(main, { touches: [first, { clientX: 200, clientY: 0 }] })
    fireEvent.touchEnd(main, { touches: [], changedTouches: [first, second] })

    expect(window.localStorage.getItem('wv_chord_song_font_scale')).toBeNull()
  })

  it('keeps one-finger swipe navigation working', () => {
    renderPlayer(player(), null)
    const main = screen.getByRole('main')
    const start = { clientX: 100, clientY: 50 }
    const end = { clientX: 0, clientY: 50 }

    fireEvent.touchStart(main, { touches: [start] })
    fireEvent.touchEnd(main, { changedTouches: [end] })
    fireEvent.touchStart(main, { touches: [start] })
    fireEvent.touchEnd(main, { changedTouches: [end] })

    expect(within(main).getByText('song-2')).toBeInTheDocument()
    expect(window.localStorage.getItem('wv_chord_song_font_scale')).toBeNull()
  })

  it('leaves one-finger swipe navigation to the room shell when embedded', () => {
    renderPlayer(player(), null, undefined, true)
    const main = screen.getByRole('main')
    const start = { clientX: 100, clientY: 50 }
    const end = { clientX: 0, clientY: 50 }

    fireEvent.touchStart(main, { touches: [start] })
    fireEvent.touchEnd(main, { changedTouches: [end] })
    fireEvent.touchStart(main, { touches: [start] })
    fireEvent.touchEnd(main, { changedTouches: [end] })

    expect(within(main).queryByText('song-2')).not.toBeInTheDocument()
  })

  it('unlikes exactly once for a native mouse double-click', async () => {
    mocks.setSongLikeStatus.mockImplementation(() => new Promise<void>(() => undefined))
    renderPlayer(player())
    const main = screen.getByRole('main')
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: -50, width: 100, height: 100 }),
    )

    await userEvent.dblClick(main)

    expect(mocks.setSongLikeStatus).toHaveBeenCalledTimes(1)
    expect(mocks.setSongLikeStatus).toHaveBeenCalledWith(expect.anything(), {
      id: 'song-1',
      liked: false,
    })
    expect(screen.getByTestId('like-feedback')).toHaveAttribute('data-liked', 'false')
  })

  it('ignores both delayed synthetic clicks after a touch double-tap unlike', () => {
    mocks.setSongLikeStatus.mockImplementation(() => new Promise<void>(() => undefined))
    renderPlayer(player())
    const main = screen.getByRole('main')
    const touch = { clientX: 50, clientY: 50 }

    fireEvent.touchStart(main, { touches: [touch] })
    fireEvent.touchEnd(main, { changedTouches: [touch] })
    fireEvent.touchStart(main, { touches: [touch] })
    fireEvent.touchEnd(main, { changedTouches: [touch] })
    fireEvent.click(main, { clientX: 50, clientY: 50 })
    fireEvent.click(main, { clientX: 50, clientY: 50 })

    expect(mocks.setSongLikeStatus).toHaveBeenCalledTimes(1)
    expect(mocks.setSongLikeStatus).toHaveBeenCalledWith(expect.anything(), {
      id: 'song-1',
      liked: false,
    })
  })

  it('keeps every duplicate row removed across a fresh player object while unlike is pending', async () => {
    mocks.setSongLikeStatus.mockImplementation(() => new Promise<void>(() => undefined))
    const original = player()
    const view = renderPlayer(original)

    fireEvent.keyDown(window, { key: 'l' })

    const likedToc = within(screen.getByTestId('liked-toc'))
    expect(likedToc.queryByText('Current')).not.toBeInTheDocument()
    expect(likedToc.queryByText('Current duplicate')).not.toBeInTheDocument()
    expect(likedToc.getByText('Other')).toBeInTheDocument()

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PlayerBook
          type="setlist"
          id="setlist-1"
          player={structuredClone(original)}
          allowNetworkFetch
          roomSidebar={<div>room</div>}
        />
      </QueryClientProvider>,
    )

    expect(likedToc.queryByText('Current')).not.toBeInTheDocument()
    expect(likedToc.queryByText('Current duplicate')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(mocks.setSongLikeStatus).toHaveBeenCalledWith(expect.anything(), {
        id: 'song-1',
        liked: false,
      }),
    )
  })

  it('restores every duplicate row when the unlike request fails', async () => {
    mocks.setSongLikeStatus.mockRejectedValue(new Error('failed'))
    renderPlayer(player())

    fireEvent.keyDown(window, { key: 'l' })

    const likedToc = within(screen.getByTestId('liked-toc'))
    await waitFor(() => expect(likedToc.getByText('Current')).toBeInTheDocument())
    expect(likedToc.getByText('Current duplicate')).toBeInTheDocument()
    expect(mocks.toastError).toHaveBeenCalledWith('player.loadFailed')
  })
})

describe('PlayerBook capo controls', () => {
  it('links from capo controls to the comfortable keys setting', () => {
    renderPlayer(capoPlayer())

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))

    const settingsLink = screen.getByRole('link', {
      name: 'player.capo.configureComfortableKeys',
    })
    expect(settingsLink).toHaveAttribute('data-hash', 'comfortable-keys')
  })

  it('keeps every musical key available while limiting guitar capo options', () => {
    renderPlayer(capoPlayer())

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))

    for (const key of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']) {
      expect(screen.getByTestId(`key-option-${key}`)).toBeVisible()
    }
    expect(screen.getByTestId('capo-shape-G')).toBeVisible()
    expect(screen.getByTestId('capo-shape-C')).toBeVisible()

    fireEvent.click(screen.getByTestId('key-option-D'))
    expect(screen.getByText('song-1')).toHaveAttribute('data-sounding-key', 'D')
  })

  it('shows every comfortable key as a capo shape option in guitar mode', () => {
    localStorageState.set('wv_comfortable_keys', JSON.stringify(['Bb', 'B']))
    renderPlayer(capoPlayer())

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))

    expect(screen.getByTestId('capo-shape-Bb')).toBeVisible()
    expect(screen.getByTestId('capo-shape-B')).toBeVisible()
    expect(screen.queryByTestId('capo-shape-G')).not.toBeInTheDocument()
  })

  it('loads the saved setlist capo and restores it after a local override is reset', () => {
    renderPlayer(savedCapoPlayer())

    expect(screen.getByText('song-1')).toHaveAttribute('data-display-key', 'G')
    expect(screen.getByText('song-1')).toHaveAttribute('data-sounding-key', 'A')
    expect(screen.getByText('song-1')).toHaveAttribute('data-capo-fret', '2')

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))
    fireEvent.click(screen.getByTestId('capo-shape-C'))
    expect(screen.getByText('song-1')).toHaveAttribute('data-display-key', 'C')

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))
    fireEvent.keyDown(window, { key: 'r' })
    expect(screen.getByText('song-1')).toHaveAttribute('data-display-key', 'G')
    expect(screen.getByText('song-1')).toHaveAttribute('data-capo-fret', '2')
  })

  it('renders capo-shaped chords and resets the guitar capo', () => {
    renderPlayer(capoPlayer())

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))
    fireEvent.click(screen.getByTestId('capo-shape-G'))

    const surface = screen.getByText('song-1')
    expect(surface).toHaveAttribute('data-display-key', 'G')
    expect(surface).toHaveAttribute('data-sounding-key', 'A')
    expect(surface).toHaveAttribute('data-capo-fret', '2')

    fireEvent.keyDown(window, { key: 'r' })
    expect(screen.getByText('song-1')).toHaveAttribute('data-display-key', 'A')
    expect(screen.getByText('song-1')).toHaveAttribute('data-capo-fret', '')
  })

  it('offers keyboard transposition offsets from -5 through +6', () => {
    localStorageState.set('wv_player_instrument', 'keyboard')
    renderPlayer(capoPlayer())

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))

    expect(screen.getByTestId('transpose-offset--5')).toHaveTextContent('E (+5)')
    expect(screen.getByTestId('transpose-offset--2')).toHaveTextContent('G (+2)')
    const defaultTranspose = screen.getByTestId('transpose-offset-0')
    expect(defaultTranspose).toHaveTextContent('player.transpose.default')
    expect(defaultTranspose).toHaveClass('bg-[var(--color-primary)]')
    expect(screen.getByTestId('transpose-offset-3')).toHaveTextContent('C (-3)')
    expect(screen.queryByTestId('transpose-offset-6')).not.toBeInTheDocument()
    expect(screen.queryByTestId('capo-shape-G')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('transpose-offset--2'))
    expect(screen.getByText('song-1')).toHaveAttribute('data-sounding-key', 'G')
    expect(screen.getByText('song-1')).toHaveAttribute('data-transpose-offset', '-2')
  })

  it('anchors keyboard transpose offsets to the selected key', () => {
    localStorageState.set('wv_player_instrument', 'keyboard')
    localStorageState.set(
      'playerView:setlist:setlist-1',
      JSON.stringify({ transposeByItem: { 0: 'Db' } }),
    )
    renderPlayer(capoPlayer())

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))

    expect(screen.getByTestId('key-option-Db')).toBeVisible()
    expect(screen.getByTestId('transpose-offset--1')).toHaveTextContent('C (+1)')
    expect(screen.getByTestId('transpose-offset-0')).toHaveTextContent('player.transpose.default')
    expect(screen.getByTestId('transpose-offset-6')).toHaveTextContent('G (-6)')
    expect(screen.getByText('song-1')).toHaveAttribute('data-sounding-key', 'Db')
  })

  it('keeps the sounding transpose target when changing the selected key', () => {
    localStorageState.set('wv_player_instrument', 'keyboard')
    renderPlayer(capoPlayer())

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))
    fireEvent.click(screen.getByTestId('transpose-offset--2'))
    expect(screen.getByText('song-1')).toHaveAttribute('data-sounding-key', 'G')

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))
    fireEvent.click(screen.getByTestId('key-option-C'))

    expect(screen.getByText('song-1')).toHaveAttribute('data-selected-key', 'C')
    expect(screen.getByText('song-1')).toHaveAttribute('data-sounding-key', 'G')
    expect(screen.getByText('song-1')).toHaveAttribute('data-transpose-offset', '-5')

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))
    expect(screen.getByTestId('transpose-offset--5')).toHaveTextContent('G (+5)')
    expect(screen.getByTestId('transpose-offset--5')).toHaveClass('bg-[var(--color-primary)]')
  })

  it('shows the selected key separately from the sounding key', () => {
    localStorageState.set('wv_player_instrument', 'keyboard')
    localStorageState.set(
      'playerView:setlist:setlist-1',
      JSON.stringify({ selectedKeyByItem: { 0: 'Db' }, transposeOffsetByItem: { 0: -4 } }),
    )
    renderPlayer(capoPlayer())

    expect(screen.getByRole('button', { name: 'player.key.current' })).toHaveTextContent('Db')
    expect(screen.getByText('song-1')).toHaveAttribute('data-selected-key', 'Db')
    expect(screen.getByText('song-1')).toHaveAttribute('data-sounding-key', 'A')
    expect(screen.getByText('song-1')).toHaveAttribute('data-transpose-offset', '-4')
  })

  it('clears capo controls in shared Room playback', () => {
    renderPlayer(
      savedCapoPlayer(),
      <div>room</div>,
      undefined,
      false,
      { item_index: 0, started: true, language: null, transposition: null },
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'player.key.current' }))
    expect(screen.queryByText('player.capo.title')).not.toBeInTheDocument()
    expect(screen.queryByTestId('capo-shape-G')).not.toBeInTheDocument()
  })
})
