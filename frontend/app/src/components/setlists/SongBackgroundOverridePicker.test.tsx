import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchMediaPage } from '@/api/media'
import { SongBackgroundOverridePicker } from '@/components/setlists/SongBackgroundOverridePicker'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/api/media', () => ({
  fetchMediaPage: vi.fn(),
  mediaListKey: (...parts: unknown[]) => ['media', 'list', ...parts],
}))

vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: () => <div data-testid="background-preview" />,
}))

const backgrounds = [
  {
    id: 'media:image',
    owner: 'team:1',
    title: 'Sunset',
    is_background: true,
    content: { type: 'image', blob_id: 'asset:image' },
  },
  {
    id: 'media:video',
    owner: 'team:1',
    title: 'Moving clouds',
    is_background: true,
    content: {
      type: 'video',
      blob_id: 'asset:video',
      thumbnail_blob_id: 'asset:thumbnail',
      duration_ms: 1000,
      width: 1,
      height: 1,
    },
  },
]

function renderPicker(onChange: (value: unknown) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SongBackgroundOverridePicker
        background={null}
        songTitle="Song title"
        canEdit
        disabled={false}
        onChange={onChange}
      />
    </QueryClientProvider>,
  )
}

describe('SongBackgroundOverridePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchMediaPage).mockResolvedValue({ items: backgrounds as never[], total: 2 })
  })

  it('chooses a preset or custom video and can clear back to player inheritance', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderPicker(onChange)

    await user.click(screen.getByRole('button', { name: 'setlists.editor.backgroundSelectAria' }))
    const inherit = await screen.findByRole('radio', { name: 'player.av.usePlayerBackground' })
    const preset = screen.getByRole('radio', { name: 'settings.playerRoles.background.default' })
    const video = await screen.findByRole('radio', { name: 'Moving clouds' })

    expect(inherit).toHaveAttribute('aria-checked', 'true')
    await user.click(preset)
    expect(onChange).toHaveBeenLastCalledWith({ preset: 2 })

    await user.click(video)
    expect(onChange).toHaveBeenLastCalledWith({
      preset: 2,
      video: {
        media_id: 'media:video',
        asset_id: 'asset:video',
        thumbnail_asset_id: 'asset:thumbnail',
      },
    })

    await user.click(inherit)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
