import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesktopInstallerManifest } from '@/api/installers'
import { InstallView } from '@/components/install/InstallView'
import de from '@/i18n/de.json'
import en from '@/i18n/en.json'
import { PwaInstallContext } from '@/pwa/pwa-install-context'

const fetchDesktopInstallerManifest = vi.hoisted(() => vi.fn())
const fetchDesktopInstallerCatalog = vi.hoisted(() => vi.fn())
const openInstall = vi.fn()

vi.mock('@/api/installers', () => ({ fetchDesktopInstallerCatalog, fetchDesktopInstallerManifest }))

const manifest: DesktopInstallerManifest = {
  version: '0.17.0',
  status: 'ready',
  installers: [
    {
      id: 'macos-aarch64-dmg',
      platform: 'macos',
      architecture: 'aarch64',
      format: 'dmg',
      filename: 'Worship Viewer_0.17.0_aarch64.dmg',
      download_url: '/api/v1/installers/macos-aarch64-dmg/download',
    },
    {
      id: 'macos-x64-dmg',
      platform: 'macos',
      architecture: 'x64',
      format: 'dmg',
      filename: 'Worship Viewer_0.17.0_x64.dmg',
      download_url: '/api/v1/installers/macos-x64-dmg/download',
    },
    {
      id: 'linux-amd64-deb',
      platform: 'linux',
      architecture: 'amd64',
      format: 'deb',
      filename: 'worship-viewer_0.17.0_amd64.deb',
      download_url: '/api/v1/installers/linux-amd64-deb/download',
    },
    {
      id: 'linux-amd64-appimage',
      platform: 'linux',
      architecture: 'amd64',
      format: 'appimage',
      filename: 'Worship Viewer_0.17.0_amd64.AppImage',
      download_url: '/api/v1/installers/linux-amd64-appimage/download',
    },
  ],
}

const catalog = {
  current_version: '0.17.0',
  releases: [
    {
      version: '0.17.0',
      installers: [
        {
          id: 'windows-x64-nsis',
          platform: 'windows',
          architecture: 'x64',
          format: 'nsis',
          filename: 'Worship Viewer_0.17.0_x64-setup.exe',
          download_url:
            'https://github.com/xilefmusics/worshipviewer/releases/download/0.17.0/Worship%20Viewer_0.17.0_x64-setup.exe',
        },
      ],
    },
    {
      version: '0.16.0',
      installers: [
        {
          id: 'linux-amd64-appimage',
          platform: 'linux',
          architecture: 'amd64',
          format: 'appimage',
          filename: 'Worship Viewer_0.16.0_amd64.AppImage',
          download_url:
            'https://github.com/xilefmusics/worshipviewer/releases/download/0.16.0/Worship%20Viewer_0.16.0_amd64.AppImage',
        },
      ],
    },
  ],
}

beforeEach(() => {
  fetchDesktopInstallerManifest.mockReset()
  fetchDesktopInstallerManifest.mockResolvedValue(manifest)
  fetchDesktopInstallerCatalog.mockReset()
  fetchDesktopInstallerCatalog.mockResolvedValue(catalog)
  openInstall.mockReset()
})

afterEach(() => vi.unstubAllGlobals())

async function renderInstallView(userAgent: string, platform: string, maxTouchPoints = 0) {
  vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints })
  const i18n = i18next.createInstance()
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, de: { translation: de } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <PwaInstallContext.Provider value={{ openInstall }}>
          <InstallView />
        </PwaInstallContext.Provider>
      </QueryClientProvider>
    </I18nextProvider>,
  )
}

describe('InstallView', () => {
  it('offers both Mac architectures and invokes the PWA install flow', async () => {
    await renderInstallView(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'MacIntel',
    )
    expect(await screen.findByRole('link', { name: 'Download for Apple Silicon' })).toHaveAttribute(
      'href',
      '/api/v1/installers/macos-aarch64-dmg/download',
    )
    expect(screen.getByRole('link', { name: 'Download for Intel Mac' })).toHaveAttribute(
      'href',
      '/api/v1/installers/macos-x64-dmg/download',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Install as a PWA' }))
    expect(openInstall).toHaveBeenCalledOnce()
  })

  it('offers both Linux package formats', async () => {
    await renderInstallView('Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64')
    expect(await screen.findByRole('link', { name: 'Download Debian package (.deb)' })).toHaveAttribute(
      'href',
      '/api/v1/installers/linux-amd64-deb/download',
    )
    expect(screen.getByRole('link', { name: 'Download AppImage' })).toHaveAttribute(
      'href',
      '/api/v1/installers/linux-amd64-appimage/download',
    )
  })

  it('keeps the PWA choice and hides native downloads on unsupported devices', async () => {
    await renderInstallView(
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile',
      'Linux armv8l',
      5,
    )
    expect(await screen.findByText('A native desktop installer is not available for this device.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Install as a PWA' })).toBeInTheDocument()
    await waitFor(() => expect(fetchDesktopInstallerManifest).toHaveBeenCalledOnce())
  })

  it('expands to show other platforms and older GitHub releases', async () => {
    await renderInstallView(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'MacIntel',
    )
    fireEvent.click(screen.getByText('Other versions and platforms'))

    expect(await screen.findByRole('link', { name: 'Windows x64 · NSIS' })).toHaveAttribute(
      'href',
      'https://github.com/xilefmusics/worshipviewer/releases/download/0.17.0/Worship%20Viewer_0.17.0_x64-setup.exe',
    )
    expect(await screen.findByRole('link', { name: 'Linux x64 · AppImage' })).toHaveAttribute(
      'href',
      'https://github.com/xilefmusics/worshipviewer/releases/download/0.16.0/Worship%20Viewer_0.16.0_amd64.AppImage',
    )
  })
})
