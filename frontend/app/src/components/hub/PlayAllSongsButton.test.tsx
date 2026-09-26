import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { PlayAllSongsButton } from '@/components/hub/PlayAllSongsButton'
import { ALL_SONGS_LIBRARY_ID } from '@/lib/all-songs-player'

describe('PlayAllSongsButton', () => {
  it('opens the all-songs player in normal order mode', () => {
    render(<PlayAllSongsButton />)

    fireEvent.click(screen.getByRole('button', { name: 'hub.actions.playAllSongs' }))

    expect(navigate).toHaveBeenCalledWith({
      to: '/player',
      search: {
        type: 'library',
        id: ALL_SONGS_LIBRARY_ID,
        index: undefined,
        mode: undefined,
        toc: undefined,
        tocLang: undefined,
        tocTags: undefined,
      },
    })
  })
})
