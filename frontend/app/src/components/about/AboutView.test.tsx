import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AboutView } from '@/components/about/AboutView'
import { renderWithProviders } from '@/test/renderWithProviders'

const mocks = vi.hoisted(() => ({
  getAbout: vi.fn(),
  getVersion: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@/api/client', () => ({ api: { GET: mocks.getAbout } }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: mocks.getVersion }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri }))
vi.mock('@/pwa/pwa-update-context', () => ({
  usePwaUpdate: () => ({
    status: 'unsupported',
    needRefresh: false,
    checkForUpdate: vi.fn(),
    applyUpdate: vi.fn(),
  }),
}))

function serverAbout(version = '0.7.4') {
  return {
    data: {
      service: 'worshipviewer-backend',
      version,
      git_commit: null,
      production: true,
    },
    response: { ok: true, status: 200, statusText: 'OK' },
  }
}

function valueFor(label: string) {
  const labelElement = screen.getByText(label)
  return labelElement.parentElement
}

beforeEach(() => {
  mocks.getAbout.mockResolvedValue(serverAbout())
  mocks.getVersion.mockResolvedValue('0.18.0')
  mocks.isTauri.mockReturnValue(false)
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  })
  vi.stubGlobal('__APP_BUILD_DATE__', '2026-11-20T16:25:00.000Z')
  vi.stubGlobal('__APP_VERSION__', '0.18.0-web')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('AboutView version metadata', () => {
  it('shows frontend and server versions with web and OS details', async () => {
    renderWithProviders(<AboutView />)

    await waitFor(() => expect(valueFor('Server version')).toHaveTextContent('0.7.4'))
    expect(valueFor('Client version')).toHaveTextContent(__APP_VERSION__)
    expect(valueFor('Platform')).toHaveTextContent('Web')
    expect(valueFor('Operating system')).toHaveTextContent('macOS')
    expect(mocks.getVersion).not.toHaveBeenCalled()
    expect(mocks.getAbout).toHaveBeenCalledWith('/api/v1/about', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('uses the installed Tauri app version in native mode', async () => {
    mocks.isTauri.mockReturnValue(true)
    renderWithProviders(<AboutView />)

    await waitFor(() => expect(valueFor('Client version')).toHaveTextContent('0.18.0'))
    expect(valueFor('Platform')).toHaveTextContent('Native')
    expect(mocks.getVersion).toHaveBeenCalledOnce()
  })

  it('shows the server version as unavailable when the endpoint fails', async () => {
    mocks.getAbout.mockRejectedValue(new Error('offline'))
    renderWithProviders(<AboutView />)

    await waitFor(() => expect(valueFor('Server version')).toHaveTextContent('Unavailable'))
    expect(valueFor('Client version')).toHaveTextContent(__APP_VERSION__)
    expect(valueFor('Operating system')).toHaveTextContent('macOS')
  })
})
