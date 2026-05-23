import { useEffect, useState } from 'react'

import {
  readSheetBackgroundPreference,
  SHEET_BACKGROUND_CHANGE_EVENT,
  type SheetBackgroundPreference,
} from '@/lib/sheet-background'

export function useSheetBackgroundPreference(): SheetBackgroundPreference {
  const [preference, setPreference] = useState(readSheetBackgroundPreference)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<SheetBackgroundPreference>).detail
      setPreference(detail ?? readSheetBackgroundPreference())
    }

    globalThis.window.addEventListener(SHEET_BACKGROUND_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(SHEET_BACKGROUND_CHANGE_EVENT, onChange)
  }, [])

  return preference
}
