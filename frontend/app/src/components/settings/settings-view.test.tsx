import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsView } from '@/components/settings/SettingsView'

const isTauri = vi.hoisted(() => vi.fn(() => true))
vi.mock('@tauri-apps/api/core', () => ({ isTauri, invoke: vi.fn().mockResolvedValue([]) }))

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
  isTauri.mockReturnValue(true)
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

  it('hides the removed AV controls while retaining the other settings', () => {
    render(<SettingsView activeTab="playerRoles" />)

    for (const key of [
      'settings.playerRoles.content.title',
      'settings.playerRoles.content.textAlignTitle',
      'settings.playerRoles.content.verticalAlignTitle',
      'settings.playerRoles.content.textShadowTitle',
      'settings.playerRoles.content.textTransformTitle',
      'settings.playerRoles.background.title',
      'settings.playerRoles.projection.fullscreenTitle',
      'settings.avBilingual.label',
    ]) {
      expect(screen.queryByText(key)).not.toBeInTheDocument()
    }
    expect(screen.getByText('settings.lyricWhitespace.title')).toBeInTheDocument()
    expect(screen.getByText('settings.playerRoles.transition.title')).toBeInTheDocument()
  })

  it('saves the automatic output setting', async () => {
    render(<SettingsView activeTab="playerRoles" />)
    const toggle = screen.getByRole('checkbox', { name: 'settings.playerRoles.output.autoOpenLabel' })
    expect(toggle).toBeChecked()
    await userEvent.setup().click(toggle)
    expect(window.localStorage.getItem('avOutputAutoOpen')).toBe('false')
    expect(toggle).not.toBeChecked()
  })

  it('disables display settings in a browser and explains the limitation', async () => {
    isTauri.mockReturnValue(false)
    const user = userEvent.setup()
    render(<SettingsView activeTab="playerRoles" />)
    const groups = screen.getAllByRole('radiogroup')
    const radios = [...groups[0].querySelectorAll('button'), ...groups[1].querySelectorAll('button')]
    expect(screen.getByRole('combobox', { name: 'settings.playerRoles.output.displaySelectionTitle' })).toBeDisabled()
    expect(radios).toHaveLength(3)
    for (const radio of radios) expect(radio).toBeDisabled()
    const explanations = screen.getAllByRole('button', { name: 'settings.playerRoles.output.browserOnly' })
    expect(explanations).toHaveLength(3)
    await user.click(explanations[0])
    expect(explanations[0]).toHaveFocus()
    expect(explanations[0]).toHaveAccessibleDescription('settings.playerRoles.output.browserOnly')
    expect(screen.getByRole('checkbox', { name: 'settings.playerRoles.output.autoOpenLabel' })).toBeEnabled()
    expect(window.localStorage.getItem('avExternalOutput')).toBeNull()
  })

  it('saves the external display output choice and shows the single-display fallback', async () => {
    render(<SettingsView activeTab="playerRoles" />)
    expect(screen.getByRole('radio', { name: /settings\.playerRoles\.output\.display/ })).toBeChecked()
    const groups = screen.getAllByRole('radiogroup')
    expect(groups[1]).toHaveAccessibleName('settings.playerRoles.output.noExternalTitle')
    expect(groups[1].querySelector('[role="radio"]')).toHaveAttribute('aria-checked', 'true')
    await userEvent.setup().click(screen.getAllByRole('radio', { name: /settings\.playerRoles\.output\.window/ })[0])
    expect(window.localStorage.getItem('avExternalOutput')).toBe('window')
  })

  it('preserves saved content and background preferences when changing a remaining AV setting', async () => {
    window.localStorage.setItem('avPreferences', JSON.stringify({
      contentLayer: { primaryTextLightness: 20, textAlign: 'left' },
      backgroundLayer: { preset: 2 },
    }))
    render(<SettingsView activeTab="playerRoles" />)
    await userEvent.setup().click(screen.getByRole('radio', { name: /settings\.playerRoles\.transition\.fade/ }))
    expect(JSON.parse(window.localStorage.getItem('avPreferences') ?? '{}')).toMatchObject({
      contentLayer: { primaryTextLightness: 20, textAlign: 'left' },
      backgroundLayer: { preset: 2 },
      transition: { style: 'fade' },
    })
  })
})
