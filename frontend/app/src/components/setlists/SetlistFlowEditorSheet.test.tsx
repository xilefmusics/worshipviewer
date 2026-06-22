import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SongFlowItem } from '@/ports/chord-engine'
import { renderWithProviders } from '@/test/renderWithProviders'

import { SetlistFlowEditorSheet } from './SetlistFlowEditorSheet'

const getChordEngine = vi.fn()
const isSongFlowValid = vi.fn()

vi.mock('@/lib/chord-engine', () => ({
  getChordEngine: () => getChordEngine(),
}))

vi.mock('@/lib/player/resolve-song-flow', () => ({
  isSongFlowValid: (...args: unknown[]) => isSongFlowValid(...args),
}))

const pool: SongFlowItem[] = [
  { title: 'Verse', occurrence_index: 0, repeats: 1 },
  { title: 'Chorus', occurrence_index: 0, repeats: 1 },
]

const staleFlow: SongFlowItem[] = [{ title: 'Bridge', occurrence_index: 0, repeats: 1 }]

const song = {
  id: 'song-1',
  blobs: [],
  not_a_song: false,
  owner: 'user:test',
  user_specific_addons: { liked: false },
  data: {
    titles: ['Test'],
    sections: [
      { title: 'Verse', lines: [] },
      { title: 'Chorus', lines: [] },
    ],
  },
}

function renderSheet(
  props: Partial<{
    isStale: boolean
    flow: SongFlowItem[] | null
    onSave: (flow: SongFlowItem[]) => void
    onReset: () => void
  }> = {},
) {
  const onSave = props.onSave ?? vi.fn()
  const onReset = props.onReset ?? vi.fn()

  return {
    onSave,
    onReset,
    ...renderWithProviders(
      <SetlistFlowEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        song={song}
        flow={props.flow ?? pool}
        isStale={props.isStale ?? false}
        canEdit={true}
        blockingAll={false}
        onSave={onSave}
        onReset={onReset}
      />,
    ),
  }
}

describe('SetlistFlowEditorSheet', () => {
  const engine = {
    flowItems: vi.fn(() => pool),
    customFlow: vi.fn(() => pool),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getChordEngine.mockResolvedValue(engine)
    isSongFlowValid.mockReturnValue(true)
  })

  it('shows stale warning banner when isStale is true', async () => {
    renderSheet({ isStale: true, flow: staleFlow })

    await waitFor(() => {
      expect(
        screen.getByText('This saved flow no longer matches the song.'),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText(
        'Playback and export use the default flow until you fix or reset this slot.',
      ),
    ).toBeInTheDocument()
  })

  it('blocks save when draft flow is still invalid', async () => {
    const user = userEvent.setup()
    const { onSave } = renderSheet({ isStale: true, flow: staleFlow })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save flow' })).toBeEnabled()
    })

    isSongFlowValid.mockReturnValue(false)

    await user.click(screen.getByRole('button', { name: 'Save flow' }))

    await waitFor(() => {
      expect(
        screen.getByText('Fix invalid sections or reset before saving.'),
      ).toBeInTheDocument()
    })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('calls onReset when reset is clicked', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    renderSheet({ onReset })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset to default' })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: 'Reset to default' }))

    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('shows missing-section label for stale draft rows not in pool', async () => {
    renderSheet({ isStale: true, flow: staleFlow })

    await waitFor(() => {
      expect(screen.getByText('Bridge (section missing)')).toBeInTheDocument()
    })
  })
})
