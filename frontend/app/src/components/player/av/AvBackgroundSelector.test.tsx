import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchMediaPage } from '@/api/media'
import { AvBackgroundSelector } from '@/components/player/av/AvBackgroundSelector'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/api/media', () => ({
  fetchMediaPage: vi.fn(),
  mediaListKey: (...parts: unknown[]) => ['media', 'list', ...parts],
}))

vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: ({ backgroundLayer }: { backgroundLayer: { preset: number } }) => (
    <div data-testid={`background-preview-${backgroundLayer.preset}`} />
  ),
}))

const backgrounds = [
  {
    id: 'media:custom',
    owner: 'team:1',
    title: 'Sunset',
    is_background: true,
    content: { type: 'image', blob_id: 'asset:custom' },
  },
  {
    id: 'media:ordinary',
    owner: 'team:1',
    title: 'Ordinary image',
    is_background: false,
    content: { type: 'image', blob_id: 'asset:ordinary' },
  },
  {
    id: 'media:unsupported',
    owner: 'team:1',
    title: 'Flagged video',
    is_background: true,
    content: { type: 'video', blob_id: 'asset:video', duration_ms: 1, width: 1, height: 1 },
  },
]

function renderSelector(props: Partial<React.ComponentProps<typeof AvBackgroundSelector>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AvBackgroundSelector
        backgroundLayer={DEFAULT_AV_PREFERENCES.backgroundLayer}
        previewText="Lyrics"
        contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
        onSelectPreset={vi.fn()}
        onSelectBackgroundImage={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('AvBackgroundSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchMediaPage).mockResolvedValue({ items: backgrounds as never[], total: 3 })
  })

  it('shows the Default preset and only flagged image backgrounds', async () => {
    const user = userEvent.setup()
    const onSelectPreset = vi.fn()
    const onSelectBackgroundImage = vi.fn()
    renderSelector({ onSelectPreset, onSelectBackgroundImage })

    await user.click(screen.getByRole('button', { name: 'player.av.backgroundExpand' }))

    const defaultBackground = screen.getByRole('radio', {
      name: 'settings.playerRoles.background.default',
    })
    const customImage = await screen.findByRole('radio', { name: 'Sunset' })

    expect(defaultBackground).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /zeltlager/i })).not.toBeInTheDocument()
    expect(within(defaultBackground).getByTestId('background-preview-2')).toBeInTheDocument()
    expect(screen.queryByTestId('background-preview-3')).not.toBeInTheDocument()
    expect(screen.queryByTestId('background-preview-4')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Ordinary image' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Flagged video' })).not.toBeInTheDocument()
    expect(fetchMediaPage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      q: '',
      isBackground: true,
    }))

    await user.click(defaultBackground)
    expect(onSelectPreset).toHaveBeenCalledWith(2)
    await user.click(customImage)
    expect(onSelectBackgroundImage).toHaveBeenCalledWith({ mediaId: 'media:custom', assetId: 'asset:custom' })
  })
})
