import { useEffect, useState } from 'react'

import {
  readSheetImageInvertPreference,
  SHEET_IMAGE_INVERT_CHANGE_EVENT,
} from '@/lib/sheet-image-invert-preference'

export function useSheetImageInvertPreference(): boolean {
  const [enabled, setEnabled] = useState(readSheetImageInvertPreference)

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      setEnabled(detail ?? readSheetImageInvertPreference())
    }

    globalThis.window.addEventListener(SHEET_IMAGE_INVERT_CHANGE_EVENT, onChange)
    return () => globalThis.window.removeEventListener(SHEET_IMAGE_INVERT_CHANGE_EVENT, onChange)
  }, [])

  return enabled
}
