import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { OutputIcon } from '@/components/icons/lucide-animated/output-icon'
import { PLAYER_HEADER_ICON_SIZE, playerHeaderIconButtonClass, playerHeaderIconClass } from '@/lib/player/player-chrome'

type Display = { name: string; x: number; y: number; width: number; height: number; primary: boolean }
type Output = { id: string; session: string }

export function AvDesktopOutputs({ sessionId, summary }: { sessionId: string; summary: string }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(false)
  const revision = useRef(0)

  useEffect(() => {
    // Reconcile disconnected and reconnected displays while the controller is open.
    let mounted = true
    const refresh = async () => {
      const currentRevision = revision.current
      try {
        const outputs = await invoke<Output[]>('presentation_outputs')
        if (mounted && currentRevision === revision.current) setActive(outputs.some((output) => output.session === sessionId))
      } catch { /* The button reports bridge errors when pressed. */ }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [sessionId])

  async function toggle() {
    revision.current += 1
    setBusy(true)
    try {
      const outputs = await invoke<Output[]>('presentation_outputs')
      const current = outputs.filter((output) => output.session === sessionId)
      if (current.length) {
        for (const output of current) await invoke('presentation_stop', { id: output.id })
        setActive(false)
        return
      }
      const displays = await invoke<Display[]>('presentation_displays')
      await invoke('presentation_start', {
        options: {
          kind: displays.some((display) => !display.primary) ? 'display' : 'share',
          display: null,
          session: sessionId,
          width: 1920,
          height: 1080,
        },
      })
      setActive(true)
    } catch (cause) {
      toast.error(`${t('player.av.desktopUnavailable')}: ${String(cause)}`)
    } finally {
      revision.current += 1
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="icon" className={playerHeaderIconButtonClass}
      aria-label={`${t(active ? 'player.av.stopOutput' : 'player.av.openOutput')}. ${summary}`} title={summary} aria-pressed={active} disabled={busy} onClick={() => void toggle()}>
      <OutputIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
    </Button>
  )
}
