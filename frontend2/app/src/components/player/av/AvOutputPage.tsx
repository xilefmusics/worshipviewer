import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AvSlideView } from '@/components/player/av/AvSlideView'
import {
  DEFAULT_AV_PREFERENCES,
  type AvProjectionPayload,
} from '@/lib/player/av-preferences'
import { subscribeAvProjectionSync } from '@/lib/player/av-projection-sync'

import './player-av.css'

type AvOutputPageProps = {
  sessionId: string
  allowFullscreenOnDblClick?: boolean
}

export function AvOutputPage({
  sessionId,
  allowFullscreenOnDblClick = true,
}: AvOutputPageProps) {
  const { t } = useTranslation()
  const [payload, setPayload] = useState<AvProjectionPayload | null>(null)

  useEffect(() => {
    const listener = subscribeAvProjectionSync(sessionId, setPayload)
    return () => listener.close()
  }, [sessionId])

  const viewPayload = payload ?? {
    contentText: '',
    contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
    backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
    transition: DEFAULT_AV_PREFERENCES.transition,
    blackout: false,
    itemTitle: '',
    nextPreview: null,
  }

  function onDoubleClick() {
    if (!allowFullscreenOnDblClick) return
    void document.documentElement.requestFullscreen?.()
  }

  return (
    <div
      className="h-dvh w-dvw overflow-hidden bg-black"
      onDoubleClick={onDoubleClick}
      aria-label={t('player.av.outputAria')}
    >
      <AvSlideView
        contentText={viewPayload.contentText}
        contentLayer={viewPayload.contentLayer}
        backgroundLayer={viewPayload.backgroundLayer}
        transition={viewPayload.transition}
        blackout={viewPayload.blackout}
      />
    </div>
  )
}
