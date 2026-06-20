import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { components } from '@/api/schema'
import { PlayerTocSidebar } from '@/components/player/PlayerTocSidebar'

const setMode = vi.fn()
const setLanguageIds = vi.fn()
const toggleLanguageId = vi.fn()
const toggleTagId = vi.fn()

let tocMultilingualEnabled = false
let tocMode: 'order' | 'alphabetical' | 'liked' = 'order'
let activeLanguageIds = new Set<string>()
let activeTagIds = new Set<string>()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/useTocMultilingualPreference', () => ({
  useTocMultilingualPreference: () => tocMultilingualEnabled,
}))

vi.mock('@/hooks/usePlayerIndexSearchSync', () => ({
  usePlayerTocSearchSync: () => ({
    mode: tocMode,
    setMode,
    setLanguageIds,
    activeLanguageIds,
    toggleLanguageId,
    activeTagIds,
    toggleTagId,
  }),
}))

type PlayerItem = components['schemas']['PlayerItem']

function chordPlayerItem(
  id: string,
  data: {
    languages?: string[]
    titles?: string[]
    language?: string | null
  },
): PlayerItem {
  return {
    type: 'chords',
    song: {
      id,
      blobs: [],
      not_a_song: false,
      owner: 'user:test',
      user_specific_addons: { liked: false },
      data: {
        sections: [],
        languages: data.languages,
        titles: data.titles,
      },
    },
    language: data.language ?? null,
  } as PlayerItem
}

const toc = [{ idx: 0, nr: '1', title: 'Anchor', id: 'song-a', liked: false }]
const items: PlayerItem[] = [
  chordPlayerItem('song-a', {
    languages: ['en', 'de'],
    titles: ['Anchor', 'Anker'],
    language: 'de',
  }),
]

beforeEach(() => {
  setMode.mockReset()
  setLanguageIds.mockReset()
  toggleLanguageId.mockReset()
  toggleTagId.mockReset()
  tocMultilingualEnabled = false
  tocMode = 'order'
  activeLanguageIds = new Set()
  activeTagIds = new Set()
})

describe('PlayerTocSidebar', () => {
  it('passes source index and language index when a translated alphabetical row is selected', async () => {
    tocMultilingualEnabled = true
    tocMode = 'alphabetical'
    const onSelect = vi.fn()

    render(
      <PlayerTocSidebar
        toc={toc}
        items={items}
        currentSourceIdx={0}
        currentLanguageIndex={1}
        onSelect={onSelect}
      />,
    )

    await userEvent.click(screen.getByRole('option', { name: 'Anker' }))

    expect(onSelect).toHaveBeenCalledWith(0, 1)
  })

  it('highlights only the exact source and language pair', () => {
    tocMultilingualEnabled = true
    tocMode = 'alphabetical'

    const { rerender } = render(
      <PlayerTocSidebar
        toc={toc}
        items={items}
        currentSourceIdx={0}
        currentLanguageIndex={0}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'Anchor' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('option', { name: 'Anker' })).not.toHaveAttribute('aria-current')

    rerender(
      <PlayerTocSidebar
        toc={toc}
        items={items}
        currentSourceIdx={0}
        currentLanguageIndex={1}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'Anchor' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('option', { name: 'Anker' })).toHaveAttribute('aria-current', 'true')
  })

  it('does not render numbers on translated alphabetical rows', () => {
    tocMultilingualEnabled = true
    tocMode = 'alphabetical'

    render(
      <PlayerTocSidebar
        toc={toc}
        items={items}
        currentSourceIdx={0}
        currentLanguageIndex={1}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'Anchor' })).toHaveTextContent('Anchor')
    expect(screen.getByRole('option', { name: 'Anker' })).toHaveTextContent('Anker')
    expect(screen.getByRole('option', { name: 'Anker' })).not.toHaveTextContent('1.')
  })
})
