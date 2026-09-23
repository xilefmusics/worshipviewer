import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { components } from '@/api/schema'
import { ChordsThreeColumnSlide } from '@/components/player/ChordsThreeColumnSlide'
import type { ChordSongData } from '@/ports/chord-engine'

const engineMocks = vi.hoisted(() => ({
  getChordEngine: vi.fn(),
  applyFlow: vi.fn(),
  fillSectionReferences: vi.fn(),
  renderA4SectionHtmls: vi.fn(),
}))

vi.mock('@/lib/chord-engine', () => ({
  getChordEngine: engineMocks.getChordEngine,
}))

function song(): components['schemas']['Song'] {
  return {
    id: 'song-transition-cache',
    blobs: [],
    not_a_song: false,
    owner: 'team-1',
    user_specific_addons: { liked: false },
    data: { titles: ['Transition song'], sections: [] },
  } as components['schemas']['Song']
}

beforeEach(() => {
  vi.stubGlobal('Worker', undefined)
  engineMocks.applyFlow.mockReset()
  engineMocks.fillSectionReferences.mockReset()
  engineMocks.renderA4SectionHtmls.mockReset()
  engineMocks.getChordEngine.mockReset().mockResolvedValue({
    applyFlow: engineMocks.applyFlow,
    fillSectionReferences: engineMocks.fillSectionReferences,
    renderA4SectionHtmls: engineMocks.renderA4SectionHtmls,
  })
  engineMocks.applyFlow.mockImplementation((data: ChordSongData) => data)
  engineMocks.renderA4SectionHtmls.mockReturnValue({ sections: [], css: '' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ChordsThreeColumnSlide render reuse', () => {
  it('reuses a completed transition render after the panel unmounts and remounts', async () => {
    const item = song()
    const props = {
      song: item,
      flow: [{ title: 'Verse', occurrence_index: 0, repeats: 1 }],
      chordFormat: 'letters' as const,
    }

    const transitionPanel = render(<ChordsThreeColumnSlide {...props} />)
    await screen.findByRole('heading', { name: 'Transition song' })
    transitionPanel.unmount()

    render(<ChordsThreeColumnSlide {...props} />)

    expect(screen.getByRole('heading', { name: 'Transition song' })).toBeInTheDocument()
    expect(document.querySelector('.player-chords-three-column > .py-12')).toBeNull()
    await waitFor(() => expect(engineMocks.renderA4SectionHtmls).toHaveBeenCalledTimes(1))
    expect(engineMocks.applyFlow).toHaveBeenCalledTimes(1)
  })
})
