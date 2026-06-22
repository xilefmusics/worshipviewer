import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { components } from '@/api/schema'
import type { SongFlowItem } from '@/ports/chord-engine'
import { ResolvedBookChords } from '@/components/player/PlayerBook'

const applyFlow = vi.fn()
const getChordEngine = vi.fn(async () => ({
  applyFlow,
}))

vi.mock('@/lib/chord-engine', () => ({
  getChordEngine: () => getChordEngine(),
}))

vi.mock('@/components/player/ChordsSlide', () => ({
  ChordsSlide: ({ song }: { song: components['schemas']['Song'] }) => (
    <div data-testid="song-sections">
      {song.data.sections.map((section: { title?: string }) => section.title ?? '').join('|')}
    </div>
  ),
}))

vi.mock('@/components/player/ChordsThreeColumnSlide', () => ({
  ChordsThreeColumnSlide: ({ song }: { song: components['schemas']['Song'] }) => (
    <div data-testid="song-sections-three">
      {song.data.sections.map((section: { title?: string }) => section.title ?? '').join('|')}
    </div>
  ),
}))

function song(title = 'Verse'): components['schemas']['Song'] {
  return {
    id: 'song-1',
    blobs: [],
    not_a_song: false,
    owner: 'team-1',
    user_specific_addons: { liked: false },
    data: {
      titles: ['Test'],
      sections: [{ title, lines: [] }],
    },
  } as components['schemas']['Song']
}

function flow(title: string, repeats = 1): SongFlowItem {
  return { title, repeats, occurrence_index: 0 }
}

beforeEach(() => {
  applyFlow.mockReset()
  getChordEngine.mockClear()
})

describe('ResolvedBookChords', () => {
  it('renders the raw song when flow is null', () => {
    render(
      <ResolvedBookChords
        song={song('Verse')}
        flow={null}
        displayKey={null}
        languageIndex={null}
        chordFormat="letters"
        sheetOrientation="portrait"
        freeColumnCount={null}
      />,
    )

    expect(screen.getByTestId('song-sections')).toHaveTextContent('Verse')
    expect(getChordEngine).not.toHaveBeenCalled()
  })

  it('applies a valid custom flow before rendering', async () => {
    applyFlow.mockImplementation((_song, flowArg: SongFlowItem[]) => ({
      titles: ['Test'],
      sections: flowArg.map((item) => ({
        title: `${item.title}:${item.repeats}`,
      })),
    }))

    render(
      <ResolvedBookChords
        song={song('Verse')}
        flow={[flow('Chorus', 2)]}
        displayKey={null}
        languageIndex={null}
        chordFormat="letters"
        sheetOrientation="portrait"
        freeColumnCount={null}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('song-sections')).toHaveTextContent('Chorus:2'))
    expect(getChordEngine).toHaveBeenCalledTimes(1)
  })

  it('falls back to the raw song when applyFlow fails', async () => {
    applyFlow.mockImplementation(() => {
      throw new Error('boom')
    })

    render(
      <ResolvedBookChords
        song={song('Verse')}
        flow={[flow('Chorus', 2)]}
        displayKey={null}
        languageIndex={null}
        chordFormat="letters"
        sheetOrientation="portrait"
        freeColumnCount={null}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('song-sections')).toHaveTextContent('Verse'))
    expect(getChordEngine).toHaveBeenCalledTimes(1)
  })
})
