import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { OutputIcon } from '@/components/icons/lucide-animated/output-icon'
import { matchAvOutputDisplay, readAvOutputDisplay, type AvDisplay } from '@/lib/player/av-displays'
import { readAvExternalOutput } from '@/lib/player/av-output-preference'
import { PLAYER_HEADER_ICON_SIZE, playerHeaderIconButtonClass, playerHeaderIconClass } from '@/lib/player/player-chrome'

type Output = { id: string; session: string }

export function AvDesktopOutputs({ sessionId, summary, autoOpen = false }: { sessionId: string; summary: string; autoOpen?: boolean }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(false)
  const revision = useRef(0)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void invoke<Output[]>('presentation_outputs').then((outputs) => Promise.all(
        outputs.filter((output) => output.session === sessionId)
          .map((output) => invoke('presentation_stop', { id: output.id })),
      )).catch(() => { /* The desktop bridge may already be shutting down. */ })
    }
  }, [sessionId])

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

  useEffect(() => {
    if (!autoOpen) return
    let cancelled = false
    async function openOnStartup() {
      revision.current += 1
      try {
        const outputs = await invoke<Output[]>('presentation_outputs')
        if (cancelled || outputs.some((output) => output.session === sessionId)) return
        const displays = await invoke<AvDisplay[]>('presentation_displays')
        if (cancelled) return
        const output = await startOutput(displays, sessionId)
        if (cancelled && output) await invoke('presentation_stop', { id: output.id })
        if (!cancelled) setActive(true)
      } catch (cause) {
        if (!cancelled) toast.error(`${t('player.av.desktopUnavailable')}: ${String(cause)}`)
      } finally {
        revision.current += 1
      }
    }
    void openOnStartup()
    return () => { cancelled = true }
  }, [autoOpen, sessionId, t])

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
      const displays = await invoke<AvDisplay[]>('presentation_displays')
      if (!mounted.current) return
      const output = await startOutput(displays, sessionId)
      if (!mounted.current && output) await invoke('presentation_stop', { id: output.id })
      if (mounted.current) setActive(true)
    } catch (cause) {
      toast.error(`${t('player.av.desktopUnavailable')}: ${String(cause)}`)
    } finally {
      revision.current += 1
      setBusy(false)
    }
  }

  if (autoOpen) return null

  return (
    <Button type="button" variant="outline" size="icon" className={playerHeaderIconButtonClass}
      aria-label={`${t(active ? 'player.av.stopOutput' : 'player.av.openOutput')}. ${summary}`} title={summary} aria-pressed={active} disabled={busy} onClick={() => void toggle()}>
      <OutputIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
    </Button>
  )
}

async function startOutput(displays: AvDisplay[], sessionId: string) {
  return invoke<Output>('presentation_start', {
    options: {
      kind: displays.some((display) => !display.primary) && readAvExternalOutput() === 'display' ? 'display' : 'share',
      display: readAvExternalOutput() === 'display' ? matchAvOutputDisplay(readAvOutputDisplay(), displays) : null,
      session: sessionId,
      width: 1920,
      height: 1080,
    },
  })
}
