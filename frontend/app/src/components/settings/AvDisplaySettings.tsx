import { invoke, isTauri } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SettingsInfoTooltip } from '@/components/settings/SettingsInfoTooltip'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { matchAvOutputDisplay, readAvOutputDisplay, writeAvOutputDisplay, type AvDisplay } from '@/lib/player/av-displays'

export function AvDisplaySettings() {
  const { t } = useTranslation()
  const [displays, setDisplays] = useState<AvDisplay[] | null>(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState(readAvOutputDisplay)
  const native = isTauri()

  useEffect(() => {
    if (!native) return
    let mounted = true
    async function refresh() {
      try {
        const available = await invoke<AvDisplay[]>('presentation_displays')
        if (mounted) { setDisplays(available.filter((display) => !display.primary)); setError(false) }
      } catch {
        if (mounted) setError(true)
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [native])

  const current = displays ? matchAvOutputDisplay(selected, displays) ?? displays[0] : null
  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{t('settings.playerRoles.output.displaySelectionTitle')}</CardTitle>
          {!native ? <SettingsInfoTooltip text={t('settings.playerRoles.output.browserOnly')} /> : null}
        </div>
        <CardDescription>{t('settings.playerRoles.output.displaySelectionDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 text-sm">
        {!native ? (
          <select aria-label={t('settings.playerRoles.output.displaySelectionTitle')} disabled
            className="w-full cursor-not-allowed rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-foreground)] opacity-55">
            <option>{t('settings.playerRoles.output.browserDisplaysUnavailable')}</option>
          </select>
        ) : error ? t('settings.playerRoles.output.displaysError') : !displays ? t('settings.playerRoles.output.displaysLoading') : (
          <select
            aria-label={t('settings.playerRoles.output.displaySelectionTitle')}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-foreground)]"
            value={current ? JSON.stringify(current) : ''}
            disabled={displays.length === 0}
            onChange={(event) => {
              const display = displays.find((item) => JSON.stringify(item) === event.target.value)
              if (display) { writeAvOutputDisplay(display); setSelected(display) }
            }}
          >
            {displays.length === 0 ? <option value="">{t('settings.playerRoles.output.noDisplays')}</option> : null}
            {displays.map((display) => (
              <option key={JSON.stringify(display)} value={JSON.stringify(display)}>
                {display.name} ({display.width} × {display.height}, {display.x}, {display.y})
              </option>
            ))}
          </select>
        )}
      </CardContent>
    </Card>
  )
}
