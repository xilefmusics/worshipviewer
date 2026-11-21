import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchMediaPage } from '@/api/media'
import { SongBackgroundOverridePicker } from '@/components/setlists/SongBackgroundOverridePicker'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'
import { avForegroundToSetlistForeground } from '@/lib/setlist-background'

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

function renderPicker(
  onSave: (background: unknown, foreground: unknown) => void,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SongBackgroundOverridePicker
        background={null}
        foreground={null}
        songTitle="Song title"
        canEdit
        disabled={false}
        onSave={onSave}
      />
    </QueryClientProvider>,
  )
}

describe('SongBackgroundOverridePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.mocked(fetchMediaPage).mockResolvedValue({ items: backgrounds as never[], total: 2 })
  })

  it('discards changes on cancel or dismissal and starts with the saved settings on reopening', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    renderPicker(onSave)
    const open = () => user.click(screen.getByRole('button', { name: 'setlists.editor.backgroundSelectAria' }))

    await open()
    await user.click(screen.getByRole('radio', { name: 'player.av.geometryOverlayCross' }))
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: 'common.cancel' })[0]!)
    await open()
    expect(screen.getByRole('radio', { name: 'player.av.usePlayerBackground' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'player.av.geometryOverlayCross' }))
    await user.keyboard('{Escape}')
    expect(onSave).not.toHaveBeenCalled()
    await open()
    expect(screen.getByRole('radio', { name: 'player.av.usePlayerBackground' })).toHaveAttribute('aria-checked', 'true')
  })

  it('saves background and foreground drafts together', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    renderPicker(onSave)

    await user.click(screen.getByRole('button', { name: 'setlists.editor.backgroundSelectAria' }))
    await user.click(screen.getByRole('radio', { name: 'player.av.geometryOverlayCross' }))
    await user.click(screen.getByRole('tab', { name: 'player.av.foregroundTitle' }))
    fireEvent.change(screen.getByRole('slider', { name: 'settings.playerRoles.content.fontSize' }), {
      target: { value: '72' },
    })
    await user.click(screen.getByRole('checkbox', { name: 'player.av.foregroundShowTranslation' }))
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'setlists.editor.avSave' }))
    expect(onSave).toHaveBeenCalledWith({
      preset: 2,
      geometry_overlay: 'cross',
      geometry_overlay_rotated_background: false,
      geometry_overlay_opacity: 77,
      geometry_overlay_color: 77,
      geometry_overlay_size: 77,
      geometry_overlay_thickness: 77,
    }, avForegroundToSetlistForeground(
      { ...DEFAULT_AV_PREFERENCES.contentLayer, fontSize: 72 },
      true,
    ))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
