import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { components } from '@/api/schema'
import { PlayerBook } from '@/components/player/PlayerBook'

const mocks = vi.hoisted(() => ({
  setSongLikeStatus: vi.fn(),
  toastError: vi.fn(),
  isPhoneViewport: false,
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
  PlayerTocSidebar: ({
    toc,
    className,
    onSelect,
  }: {
    toc: components['schemas']['TocItem'][]
    className?: string
    onSelect: (sourceIdx: number, languageIndex: number | null) => void
  }) => (
    <div data-testid="liked-toc" className={className}>
      {toc
        .filter((row) => row.liked)
        .map((row) => (
          <button key={`${row.idx}:${row.title}`} type="button" onClick={() => onSelect(row.idx, null)}>
            {row.title}
          </button>
        ))}
    </div>
  ),
}))

vi.mock('@/hooks/useChordFormatPreference', () => ({
  useChordFormatPreference: () => 'letters',
}))
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsPhoneWidth: () => mocks.isPhoneViewport,
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
  initialIndex?: number,
  enableEmbeddedSwipeNavigation = false,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PlayerBook
        type="setlist"
        id="setlist-1"
        player={value}
        initialIndex={initialIndex}
        allowNetworkFetch
        embedded={embedded}
        enableEmbeddedSwipeNavigation={enableEmbeddedSwipeNavigation}
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
  mocks.isPhoneViewport = false
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

  it('navigates songs after a short horizontal swipe', () => {
    renderPlayer(player(), null, undefined, false, undefined, false, 1)
    const main = screen.getByRole('main')

    fireEvent.touchStart(main, { touches: [{ clientX: 100, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 88, clientY: 50 }] })

    expect(within(main).getByText('song-2')).toBeInTheDocument()
  })

  it('swipes right to the previous item away from the left edge', () => {
    mocks.isPhoneViewport = true
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')

    fireEvent.touchStart(main, { touches: [{ clientX: 100, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 180, clientY: 50 }] })

    expect(within(main).getByText('song-1')).toBeInTheDocument()
  })

  it('supports touch pointer events at every standalone viewport width', () => {
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')

    expect(main).toHaveStyle({ touchAction: 'pan-y', overscrollBehaviorX: 'none' })
    fireEvent.pointerDown(main, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 50 })
    fireEvent.pointerUp(main, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 50 })

    expect(within(main).getByText('song-2')).toBeInTheDocument()
  })

  it('opens the TOC for a left-edge swipe at non-phone widths', () => {
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')

    fireEvent.touchStart(main, { touches: [{ clientX: 0, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 80, clientY: 50 }] })

    expect(screen.getByTestId('liked-toc')).toBeInTheDocument()
    expect(within(main).getByText('song-2')).toBeInTheDocument()
  })

  it('keeps adjacent songs beside the current song and snaps after a swipe', () => {
    mocks.isPhoneViewport = true
    renderPlayer(player(), null, undefined, false, undefined, false, 1)
    const main = screen.getByRole('main')
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.touchStart(main, { touches: [{ clientX: 80, clientY: 50 }] })
    fireEvent.touchMove(main, { touches: [{ clientX: 30, clientY: 50 }] })

    const track = screen.getByTestId('player-swipe-track')
    expect(track.style.transform).toContain('-50px')
    expect(within(main).getAllByText('song-1')).toHaveLength(2)
    expect(within(main).getByText('song-2')).toBeInTheDocument()

    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 0, clientY: 50 }] })
    expect(track.style.transition).toContain('transform')
    fireEvent.transitionEnd(track, { propertyName: 'transform' })

    expect(screen.queryByTestId('player-swipe-track')).not.toBeInTheDocument()
    expect(within(main).getByText('song-2')).toBeInTheDocument()
  })

  it('uses the swipe track animation for click-zone navigation', async () => {
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.click(main, { clientX: 10, clientY: 50, detail: 1 })

    const track = screen.getByTestId('player-swipe-track')
    await waitFor(() => expect(track.style.transform).toContain('100px'))
    expect(track.style.transition).toContain('transform')
    fireEvent.transitionEnd(track, { propertyName: 'transform' })

    expect(screen.queryByTestId('player-swipe-track')).not.toBeInTheDocument()
    expect(within(main).getByText('song-1')).toBeInTheDocument()
  })

  it('does not finish the previous-song animation on a nested transition', async () => {
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.click(main, { clientX: 10, clientY: 50, detail: 1 })

    const track = screen.getByTestId('player-swipe-track')
    await waitFor(() => expect(track.style.transform).toContain('100px'))
    fireEvent.transitionEnd(track.firstElementChild as HTMLElement, { propertyName: 'transform' })

    expect(screen.getByTestId('player-swipe-track')).toBeInTheDocument()
    expect(within(main).getAllByText('song-2')).toHaveLength(2)

    fireEvent.transitionEnd(track, { propertyName: 'transform' })
    expect(screen.queryByTestId('player-swipe-track')).not.toBeInTheDocument()
    expect(within(main).getByText('song-1')).toBeInTheDocument()
  })

  it('opens the full-width TOC for a right swipe from the left edge', () => {
    mocks.isPhoneViewport = true
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')

    expect(main).toHaveStyle({ touchAction: 'pan-y', overscrollBehaviorX: 'none' })

    fireEvent.touchStart(main, { touches: [{ clientX: 0, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 80, clientY: 50 }] })

    const toc = screen.getByTestId('liked-toc')
    expect(toc).toHaveClass('w-full', 'border-r-0')
    expect(toc.parentElement).toHaveClass('w-full')
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(within(main).getByText('song-2')).toBeInTheDocument()
  })

  it('dismisses the fullscreen TOC after selecting a row without waiting for a track transition', async () => {
    mocks.isPhoneViewport = true
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')

    fireEvent.touchStart(main, { touches: [{ clientX: 0, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 80, clientY: 50 }] })

    const toc = screen.getByTestId('liked-toc')
    const tocOverlay = toc.parentElement?.parentElement
    expect(tocOverlay).not.toBeNull()
    vi.spyOn(tocOverlay!, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.click(within(toc).getByRole('button', { name: 'Other' }))

    expect(within(main).getByText('song-2')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('liked-toc')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('banner')).not.toBeInTheDocument())
  })

  it('swipes left inside the fullscreen TOC to return to the song', async () => {
    mocks.isPhoneViewport = true
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')

    fireEvent.touchStart(main, { touches: [{ clientX: 0, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 80, clientY: 50 }] })

    const toc = screen.getByTestId('liked-toc')
    const tocOverlay = toc.parentElement?.parentElement
    expect(tocOverlay).not.toBeNull()
    vi.spyOn(tocOverlay!, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.touchStart(toc, { touches: [{ clientX: 180, clientY: 50 }] })
    fireEvent.touchMove(toc, { touches: [{ clientX: 130, clientY: 50 }] })

    const track = screen.getByTestId('player-toc-swipe-track')
    expect(track.style.transform).toContain('-50px')
    expect(within(main).getByText('song-2')).toBeInTheDocument()

    fireEvent.touchEnd(toc, { changedTouches: [{ clientX: 130, clientY: 50 }] })
    await waitFor(() => expect(screen.queryByTestId('liked-toc')).not.toBeInTheDocument())
    expect(within(main).getByText('song-2')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('banner')).not.toBeInTheDocument())
  })

  it('keeps the fullscreen TOC open for vertical and non-dismissal swipes', () => {
    mocks.isPhoneViewport = true
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')

    fireEvent.touchStart(main, { touches: [{ clientX: 0, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 80, clientY: 50 }] })

    const toc = screen.getByTestId('liked-toc')
    const tocOverlay = toc.parentElement?.parentElement
    expect(tocOverlay).not.toBeNull()
    vi.spyOn(tocOverlay!, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.touchStart(toc, { touches: [{ clientX: 180, clientY: 50 }] })
    fireEvent.touchMove(toc, { touches: [{ clientX: 170, clientY: 0 }] })
    fireEvent.touchEnd(toc, { changedTouches: [{ clientX: 170, clientY: 0 }] })
    expect(screen.getByTestId('liked-toc')).toBeInTheDocument()

    fireEvent.touchStart(toc, { touches: [{ clientX: 100, clientY: 50 }] })
    fireEvent.touchEnd(toc, { changedTouches: [{ clientX: 140, clientY: 50 }] })
    expect(screen.getByTestId('liked-toc')).toBeInTheDocument()

    fireEvent.touchStart(toc, { touches: [{ clientX: 100, clientY: 50 }] })
    fireEvent.touchMove(toc, { touches: [{ clientX: 70, clientY: 50 }] })
    const track = screen.getByTestId('player-toc-swipe-track')
    expect(track.style.transform).toContain('-30px')
    fireEvent.touchEnd(toc, { changedTouches: [{ clientX: 70, clientY: 50 }] })
    expect(track.style.transform).toContain('0px')
    expect(track.style.transition).toContain('transform')
    fireEvent.transitionEnd(track, { propertyName: 'transform' })
    expect(screen.getByTestId('liked-toc')).toBeInTheDocument()
  })

  it('reserves a left swipe from the left edge without navigating', () => {
    mocks.isPhoneViewport = true
    renderPlayer(player(), null, undefined, false, undefined, false, 2)
    const main = screen.getByRole('main')

    fireEvent.touchStart(main, { touches: [{ clientX: 0, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: -80, clientY: 50 }] })

    expect(within(main).getByText('song-2')).toBeInTheDocument()
    expect(screen.queryByTestId('liked-toc')).not.toBeInTheDocument()
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

  it('navigates songs for embedded room swipes away from both panel edges', () => {
    mocks.isPhoneViewport = true
    renderPlayer(player(), null, undefined, true, undefined, false, 1, true)
    const main = screen.getByRole('main')
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.touchStart(main, { touches: [{ clientX: 50, clientY: 50 }] })
    fireEvent.touchMove(main, { touches: [{ clientX: 0, clientY: 50 }] })

    const track = screen.getByTestId('player-swipe-track')
    expect(track.style.transform).toContain('-50px')

    fireEvent.touchEnd(main, { changedTouches: [{ clientX: -50, clientY: 50 }] })
    fireEvent.transitionEnd(track, { propertyName: 'transform' })

    expect(within(main).getByText('song-2')).toBeInTheDocument()
  })

  it('leaves both embedded room edge swipes to the room panel shell', () => {
    mocks.isPhoneViewport = true
    renderPlayer(player(), null, undefined, true, undefined, false, 1, true)
    const main = screen.getByRole('main')
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, width: 100, height: 100 }),
    )

    fireEvent.touchStart(main, { touches: [{ clientX: 0, clientY: 50 }] })
    fireEvent.touchMove(main, { touches: [{ clientX: 60, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 80, clientY: 50 }] })

    fireEvent.touchStart(main, { touches: [{ clientX: 100, clientY: 50 }] })
    fireEvent.touchMove(main, { touches: [{ clientX: 40, clientY: 50 }] })
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 20, clientY: 50 }] })

    expect(screen.queryByTestId('player-swipe-track')).not.toBeInTheDocument()
    expect(within(main).getByText('song-1')).toBeInTheDocument()
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
