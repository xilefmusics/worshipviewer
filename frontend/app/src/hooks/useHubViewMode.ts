import { useCallback, useEffect, useState } from 'react'

import type { HubEntity } from '@/lib/hub-entity'
import {
  HUB_VIEW_MODE_CHANGE_EVENT,
  readHubViewMode,
  writeHubViewMode,
  type HubViewMode,
} from '@/lib/hub-view-mode'

export function useHubViewMode(entity: HubEntity): {
  viewMode: HubViewMode
  setViewMode: (mode: HubViewMode) => void
} {
  const [viewMode, setViewModeState] = useState(() => readHubViewMode(entity))

  useEffect(() => {
    setViewModeState(readHubViewMode(entity))
  }, [entity])

  useEffect(() => {
    if (entity !== 'collections') return

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ entity: HubEntity; mode: HubViewMode }>).detail
      if (detail?.entity === 'collections') {
        setViewModeState(detail.mode)
      }
    }

    globalThis.window.addEventListener(HUB_VIEW_MODE_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(HUB_VIEW_MODE_CHANGE_EVENT, onChange)
  }, [entity])

  const setViewMode = useCallback(
    (mode: HubViewMode) => {
      if (entity !== 'collections') return
      writeHubViewMode(entity, mode)
      setViewModeState(mode)
    },
    [entity],
  )

  return { viewMode, setViewMode }
}
