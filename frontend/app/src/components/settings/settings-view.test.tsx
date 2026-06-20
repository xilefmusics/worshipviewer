import { render, screen } from '@testing-library/react'
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
})
