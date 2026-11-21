import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  fetchDesktopInstallerCatalog,
  fetchDesktopInstallerManifest,
  type DesktopInstaller,
} from '@/api/installers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { detectDesktopInstallerPlatform } from '@/lib/installer-platform'
import { usePwaInstall } from '@/pwa/pwa-install-context'

const appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'
const manifestQueryKey = ['desktop-installers', appVersion] as const
const catalogQueryKey = ['desktop-installer-releases'] as const

function installerDownload(installer: DesktopInstaller, label: string) {
  return (
    <Button key={installer.id} asChild variant="outline" className="justify-start">
      <a href={installer.download_url} download>
        {label}
      </a>
    </Button>
  )
}

function catalogInstallerLabel(installer: DesktopInstaller, t: ReturnType<typeof useTranslation>['t']) {
  const platform = {
    macos: t('install.platformMacos'),
    windows: t('install.platformWindows'),
    linux: t('install.platformLinux'),
  }[installer.platform]
  const architecture =
    installer.architecture === 'aarch64'
      ? t('install.archArm64')
      : installer.architecture === 'x64' || installer.architecture === 'amd64'
        ? t('install.archX64')
        : installer.architecture
  const format = {
    dmg: 'DMG',
    nsis: 'NSIS',
    deb: '.deb',
    appimage: 'AppImage',
  }[installer.format]
  return t('install.catalogInstaller', { platform, architecture, format })
}

export function InstallView() {
  const { t } = useTranslation()
  const { openInstall } = usePwaInstall()
  const [showCatalog, setShowCatalog] = useState(false)
  const platform = detectDesktopInstallerPlatform()
  const { data: manifest } = useQuery({
    queryKey: manifestQueryKey,
    queryFn: fetchDesktopInstallerManifest,
    staleTime: 60_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'ready' || status === 'unavailable' ? false : 1_500
    },
  })
  const catalogQuery = useQuery({
    queryKey: catalogQueryKey,
    queryFn: fetchDesktopInstallerCatalog,
    enabled: showCatalog,
    staleTime: 10 * 60_000,
  })

  const availableInstallers = manifest?.installers ?? []
  const platformInstallers = platform
    ? availableInstallers.filter((installer) => installer.platform === platform)
    : []
  const macArm = platformInstallers.find((installer) => installer.id === 'macos-aarch64-dmg')
  const macIntel = platformInstallers.find((installer) => installer.id === 'macos-x64-dmg')
  const windows = platformInstallers.find((installer) => installer.id === 'windows-x64-nsis')
  const linuxDeb = platformInstallers.find((installer) => installer.id === 'linux-amd64-deb')
  const linuxAppImage = platformInstallers.find(
    (installer) => installer.id === 'linux-amd64-appimage',
  )
  const visibleInstallerIds = new Set(platformInstallers.map((installer) => installer.id))
  const catalogReleases = (catalogQuery.data?.releases ?? [])
    .map((release) => ({
      ...release,
      isCurrent: release.version === catalogQuery.data?.current_version,
      installers: release.installers.filter(
        (installer) =>
          release.version !== catalogQuery.data?.current_version ||
          !visibleInstallerIds.has(installer.id),
      ),
    }))
    .filter((release) => release.installers.length > 0)

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <img
          src="/brand/icon-192.png"
          alt=""
          className="size-16 rounded-2xl shadow-[var(--shadow-elevated)]"
        />
        <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
          {t('install.title')}
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t('install.description')}
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {t('install.pwaTitle')}
            </CardTitle>
            <CardDescription>{t('install.pwaDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3 p-4 pt-0">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {t('install.version', { version: appVersion })}
            </p>
            <Button type="button" onClick={openInstall}>
              {t('install.pwaAction')}
            </Button>
          </CardContent>
        </Card>

        {platformInstallers.length > 0 ? (
          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {t('install.nativeTitle')}
              </CardTitle>
              <CardDescription>{t('install.nativeDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-2 p-4 pt-0">
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t('install.version', { version: manifest?.version ?? appVersion })}
              </p>
              {macArm
                ? installerDownload(macArm, t('install.macAppleSilicon'))
                : null}
              {macIntel ? installerDownload(macIntel, t('install.macIntel')) : null}
              {windows ? installerDownload(windows, t('install.windowsDownload')) : null}
              {linuxDeb ? installerDownload(linuxDeb, t('install.linuxDeb')) : null}
              {linuxAppImage
                ? installerDownload(linuxAppImage, t('install.linuxAppImage'))
                : null}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">{t('install.nativeTitle')}</CardTitle>
              <CardDescription>{t('install.nativeDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-[var(--color-muted-foreground)]" aria-live="polite">
                {manifest?.status === 'checking'
                  ? t('install.checking')
                  : platform === null
                    ? t('install.unsupportedPlatform')
                    : t('install.nativeUnavailable')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <details
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
        onToggle={(event) => setShowCatalog(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium text-[var(--color-foreground)]">
          {t('install.moreVersions')}
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t('install.moreVersionsDescription')}
          </p>
          {catalogQuery.isFetching ? (
            <p className="text-sm text-[var(--color-muted-foreground)]" aria-live="polite">
              {t('install.catalogLoading')}
            </p>
          ) : null}
          {catalogQuery.isError ? (
            <p className="text-sm text-[var(--color-muted-foreground)]" role="status">
              {t('install.catalogUnavailable')}
            </p>
          ) : null}
          {catalogReleases.map((release) => (
              <section key={release.version} className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-[var(--color-foreground)]">
                  {t('install.releaseVersion', { version: release.version })}
                  {release.isCurrent ? ` · ${t('install.currentRelease')}` : ''}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {release.installers.map((installer) =>
                    installerDownload(installer, catalogInstallerLabel(installer, t)),
                  )}
                </div>
              </section>
          ))}
          {catalogQuery.data && catalogReleases.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('install.catalogEmpty')}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  )
}
