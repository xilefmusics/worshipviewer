import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsView } from '@/components/settings/SettingsView'

const navigate = vi.fn()
const setViewMode = vi.fn()
const ensureQueryData = vi.fn().mockResolvedValue(undefined)
const setQueryData = vi.fn()
const localStorageState = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageState.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageState.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    localStorageState.delete(key)
  }),
  clear: vi.fn(() => {
    localStorageState.clear()
  }),
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ ensureQueryData, setQueryData }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { changeLanguage: vi.fn().mockResolvedValue(undefined) },
  }),
}))

vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ data: null }),
}))

vi.mock('@/hooks/useHubViewMode', () => ({
  useHubViewMode: () => ({ viewMode: 'list', setViewMode }),
}))

vi.mock('@/lib/clear-local', () => ({
  clearAllLocalData: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/api/session', () => ({
  fetchSessionUser: vi.fn().mockResolvedValue(null),
  SESSION_QUERY_KEY: ['session'],
  SESSION_STALE_TIME_MS: 0,
}))

vi.mock('@/lib/offline/player-mirror-cache', () => ({
  estimateKvTableBytes: vi.fn().mockResolvedValue(0),
  estimateOfflinePlayerCacheBytes: vi.fn().mockResolvedValue(0),
  listPlayerMirrors: vi.fn().mockResolvedValue([]),
  removePlayerMirror: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/logout-queue', () => ({
  performLogout: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  navigate.mockReset()
  setViewMode.mockReset()
  setQueryData.mockReset()
  ensureQueryData.mockReset().mockResolvedValue(undefined)
  localStorageState.clear()
  vi.stubGlobal('localStorage', localStorageMock)
  localStorageMock.getItem.mockClear()
  localStorageMock.setItem.mockClear()
  localStorageMock.removeItem.mockClear()
  localStorageMock.clear.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettingsView', () => {
  it('defaults, stores, and restores the chord-song font scale in the Player tab', () => {
    const first = render(<SettingsView activeTab="player" />)
    const slider = screen.getByRole('slider', {
      name: 'settings.chordSongFontScale.label',
    })

    expect(slider).toHaveValue('1')
    fireEvent.change(slider, { target: { value: '2' } })
    expect(window.localStorage.getItem('wv_chord_song_font_scale')).toBe('2')

    first.unmount()
    render(<SettingsView activeTab="player" />)
    expect(
      screen.getByRole('slider', { name: 'settings.chordSongFontScale.label' }),
    ).toHaveValue('2')
  })

  it('renders the TOC multilingual control in the Player tab and restores it from storage', async () => {
    const user = userEvent.setup()

    const { unmount } = render(<SettingsView activeTab="player" />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.tocMultilingual.label',
    })

    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    expect(toggle).toBeChecked()
    expect(window.localStorage.getItem('wv_toc_multilingual')).toBe('true')

    unmount()

    render(<SettingsView activeTab="player" />)
    expect(
      screen.getByRole('checkbox', { name: 'settings.tocMultilingual.label' }),
    ).toBeChecked()
  })

  it('stores the comfortable keys shown by the player key picker', async () => {
    const user = userEvent.setup()

    render(<SettingsView activeTab="player" />)

    const comfortableKeysAnchor = screen
      .getByText('settings.comfortableKeys.title')
      .closest('#comfortable-keys')
    expect(comfortableKeysAnchor).not.toBeNull()

    const c = screen.getByRole('checkbox', { name: 'C' })
    const e = screen.getByRole('checkbox', { name: 'E' })
    const g = screen.getByRole('checkbox', { name: 'G' })
    expect(c).toBeChecked()
    expect(e).toBeChecked()
    expect(g).toBeChecked()

    await user.click(c)
    await user.click(screen.getByRole('checkbox', { name: 'Db' }))

    expect(c).not.toBeChecked()
    expect(e).toBeChecked()
    expect(g).toBeChecked()
    expect(JSON.parse(window.localStorage.getItem('wv_comfortable_keys') ?? '[]')).toEqual([
      'Db',
      'E',
      'G',
    ])
  })

  it('stores the selected player instrument', async () => {
    const user = userEvent.setup()

    const { unmount } = render(<SettingsView activeTab="player" />)
    const keyboard = screen.getByRole('radio', { name: 'settings.instrument.keyboard' })
    const guitar = screen.getByRole('radio', { name: 'settings.instrument.guitar' })

    expect(guitar).toBeChecked()
    expect(guitar.querySelector('svg')).toBeInTheDocument()
    expect(keyboard.querySelector('svg')).toBeInTheDocument()
    await user.click(keyboard)

    expect(keyboard).toBeChecked()
    expect(window.localStorage.getItem('wv_player_instrument')).toBe('keyboard')

    unmount()
    render(<SettingsView activeTab="player" />)
    expect(screen.getByRole('radio', { name: 'settings.instrument.keyboard' })).toBeChecked()
  })

  it('renders the AV bilingual control in Player AV and restores it from storage', async () => {
    const user = userEvent.setup()

    const { unmount } = render(<SettingsView activeTab="playerRoles" />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.avBilingual.label',
    })

    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    expect(toggle).toBeChecked()
    expect(window.localStorage.getItem('wv_av_bilingual')).toBe('true')

    unmount()

    render(<SettingsView activeTab="playerRoles" />)
    expect(
      screen.getByRole('checkbox', { name: 'settings.avBilingual.label' }),
    ).toBeChecked()
  })

  it('offers only the Default AV background and stores the Ray preset', async () => {
    const user = userEvent.setup()

    render(<SettingsView activeTab="playerRoles" />)

    const defaultBackground = screen.getByRole('radio', {
      name: /settings\.playerRoles\.background\.default/,
    })
    expect(
      screen.getAllByRole('radio', { name: /settings\.playerRoles\.background\.default/ }),
    ).toHaveLength(1)
    expect(screen.queryByRole('radio', { name: /zeltlager/i })).not.toBeInTheDocument()

    await user.click(defaultBackground)

    expect(JSON.parse(window.localStorage.getItem('avPreferences') ?? '{}')).toMatchObject({
      backgroundLayer: { preset: 2 },
    })
  })

  it('renders and stores independent AV text grayscale controls', () => {
    render(<SettingsView activeTab="playerRoles" />)

    const primarySlider = screen.getByRole('slider', {
      name: 'settings.playerRoles.content.primaryTextColor',
    })
    const secondarySlider = screen.getByRole('slider', {
      name: 'settings.playerRoles.content.secondaryTextColor',
    })

    expect(primarySlider).toHaveValue('100')
    expect(secondarySlider).toHaveValue('65')

    fireEvent.change(primarySlider, { target: { value: '20' } })
    fireEvent.change(secondarySlider, { target: { value: '80' } })

    expect(JSON.parse(window.localStorage.getItem('avPreferences') ?? '{}')).toMatchObject({
      contentLayer: {
        primaryTextLightness: 20,
        secondaryTextLightness: 80,
      },
    })
  })
})
