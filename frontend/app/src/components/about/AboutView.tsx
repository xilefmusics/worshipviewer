import { useQuery } from '@tanstack/react-query'
import { getVersion } from '@tauri-apps/api/app'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { detectOperatingSystem } from '@/lib/platform'
import { usePwaUpdate } from '@/pwa/pwa-update-context'
import { isTauri } from '@tauri-apps/api/core'

function formatBuildDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function AboutView() {
  const { t, i18n } = useTranslation()
  const { status, needRefresh, checkForUpdate, applyUpdate } = usePwaUpdate()
  const nativeApp = isTauri()
  const operatingSystem = detectOperatingSystem()

  const clientVersionQuery = useQuery({
    queryKey: ['about', 'client-version'],
    queryFn: getVersion,
    enabled: nativeApp,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const serverVersionQuery = useQuery({
    queryKey: ['about', 'server-version'],
    queryFn: async ({ signal }) => {
      const { data, response, error } = await api.GET('/api/v1/about', { signal })
      if (!response.ok || !data) {
        throw new Error(error ? JSON.stringify(error) : response.statusText)
      }
      return data.version
    },
    networkMode: 'always',
    refetchOnMount: 'always',
    retry: false,
    staleTime: 60_000,
  })

  const frontendBuildDate = useMemo(
    () => formatBuildDate(__APP_BUILD_DATE__, i18n.language),
    [i18n.language],
  )
  const clientVersion = nativeApp
    ? (clientVersionQuery.data ??
      (clientVersionQuery.isError ? t('about.unavailable') : t('about.loading')))
    : __APP_VERSION__
  const serverVersion = serverVersionQuery.data ??
    (serverVersionQuery.isError ? t('about.unavailable') : t('about.loading'))

  const statusMessage =
    status === 'checking'
      ? t('about.checking')
      : status === 'updateAvailable' || needRefresh
        ? t('about.updateAvailable')
        : status === 'upToDate'
          ? t('about.upToDate')
          : status === 'unsupported'
            ? t('about.unsupported')
            : null

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <img
          src="/brand/icon-192.png"
          alt=""
          className="size-16 rounded-2xl shadow-[var(--shadow-elevated)]"
        />
        <h1 className="text-lg font-semibold text-[var(--color-foreground)]">{t('about.appName')}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('about.tagline')}</p>
      </div>

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">{t('about.versionLabel')}</CardTitle>
          <CardDescription>{t('about.tagline')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <dl className="flex flex-col gap-2">
            <MetadataRow
              label={t('about.clientVersionLabel')}
              value={clientVersion}
              mono
            />
            <MetadataRow label={t('about.serverVersionLabel')} value={serverVersion} mono />
            <MetadataRow
              label={t('about.platformLabel')}
              value={t(nativeApp ? 'about.nativePlatform' : 'about.webPlatform')}
            />
            <MetadataRow
              label={t('about.operatingSystemLabel')}
              value={t(`about.operatingSystems.${operatingSystem}`)}
            />
            <MetadataRow label={t('about.frontendBuildDateLabel')} value={frontendBuildDate} />
          </dl>
        </CardContent>
      </Card>

      {nativeApp ? (
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-base">{t('about.desktopUpdate')}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <a
              className="text-sm font-medium text-[var(--color-primary)] underline underline-offset-2"
              href="https://github.com/xilefmusics/worshipviewer/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              {t('about.desktopReleases')}
            </a>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">{t('about.checkForUpdate')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-2 p-4 pt-0">
          <Button
            type="button"
            variant="outline"
            disabled={status === 'checking'}
            onClick={() => {
              void checkForUpdate()
            }}
          >
            {status === 'checking' ? t('about.checking') : t('about.checkForUpdate')}
          </Button>
          {statusMessage ? (
            <p
              className={
                status === 'updateAvailable' || needRefresh
                  ? 'text-xs text-[var(--color-primary)]'
                  : 'text-xs text-[var(--color-muted-foreground)]'
              }
            >
              {statusMessage}
            </p>
          ) : null}
          {status === 'updateAvailable' || needRefresh ? (
            <Button type="button" onClick={applyUpdate}>
              {t('about.reloadToUpdate')}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function MetadataRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-xs">
      <dt className="shrink-0 text-[var(--color-muted-foreground)]">{label}</dt>
      <dd
        className={`min-w-0 text-right text-[var(--color-foreground)] ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}
