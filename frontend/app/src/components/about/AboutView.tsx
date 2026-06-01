import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePwaUpdate } from '@/pwa/pwa-update-context'

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

  const buildDateLabel = useMemo(
    () => formatBuildDate(__APP_BUILD_DATE__, i18n.language),
    [i18n.language],
  )

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
        <CardContent className="flex flex-col gap-2 p-4 pt-0">
          <p className="font-mono text-sm text-[var(--color-foreground)]">{__APP_VERSION__}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t('about.buildDateLabel')}: {buildDateLabel}
          </p>
        </CardContent>
      </Card>

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
