import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { components } from '@/api/schema'
import { ChordsSlide } from '@/components/player/ChordsSlide'

const engineMocks = vi.hoisted(() => ({ getChordEngine: vi.fn() }))

vi.mock('@/lib/chord-engine', () => ({
  getChordEngine: () => engineMocks.getChordEngine(),
}))

function song(): components['schemas']['Song'] {
  return {
    id: 'room-song',
    blobs: [],
    not_a_song: false,
    owner: 'team-1',
    user_specific_addons: { liked: false },
    data: {
      titles: ['Room song'],
      sections: [
        { title: 'Intro', lines: [] },
        { title: 'Verse', lines: [] },
        { title: 'Chorus', lines: [] },
      ],
    },
  } as components['schemas']['Song']
}

function rect(top: number): DOMRect {
  return { x: 0, y: top, top, left: 0, right: 300, bottom: top + 20, width: 300, height: 20, toJSON: () => ({}) }
}

describe('ChordsSlide shared room selection', () => {
  beforeEach(() => {
    engineMocks.getChordEngine.mockReset().mockResolvedValue({
      renderA4Html: () => ({
        html: '<div class="page"><p><span class="keyword">Intro</span></p><p><span class="keyword">Verse</span></p><p><span class="keyword">Chorus</span></p></div>',
        css: '',
      }),
    })
  })

  it('scrolls to a shared section and publishes a later local section change', async () => {
    const onSectionChange = vi.fn()
    let resolveEngine!: (engine: { renderA4Html: () => { html: string; css: string } }) => void
    engineMocks.getChordEngine.mockReturnValue(new Promise((resolve) => { resolveEngine = resolve }))
    const { container } = render(
      <ChordsSlide
        song={song()}
        chordFormat="letters"
        orientation="portrait"
        focusSectionIndex={2}
        onSectionChange={onSectionChange}
      />,
    )

    const viewport = container.querySelector<HTMLElement>('.player-chords-viewport')
    expect(viewport).not.toBeNull()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('player-chords-viewport')) return rect(10)
      if (this.classList.contains('keyword')) {
        const headings = [...container.querySelectorAll<HTMLElement>('.keyword')]
        const index = headings.indexOf(this)
        return rect(30 + index * 70 - (viewport?.scrollTop ?? 0))
      }
      return rect(0)
    })

    await act(async () => {
      resolveEngine({
        renderA4Html: () => ({
          html: '<div class="page"><p><span class="keyword">Intro</span></p><p><span class="keyword">Verse</span></p><p><span class="keyword">Chorus</span></p></div>',
          css: '',
        }),
      })
    })

    await waitFor(() => expect(viewport?.scrollTop).toBe(160))
    expect(onSectionChange).not.toHaveBeenCalled()

    viewport!.scrollTop = 0
    fireEvent.scroll(viewport!)

    expect(onSectionChange).toHaveBeenCalledExactlyOnceWith(0)
  })
})
