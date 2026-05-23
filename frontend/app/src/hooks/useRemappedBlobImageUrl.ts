import { useEffect, useMemo, useState } from 'react'

import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSheetBackgroundPreference } from '@/hooks/useSheetBackgroundPreference'
import { useSheetImageInvertPreference } from '@/hooks/useSheetImageInvertPreference'
import { remapSheetImageFromUrl } from '@/lib/sheet-image-remap'

function useThemeAttribute(): string | undefined {
  const [theme, setTheme] = useState(() =>
    typeof globalThis.document === 'undefined'
      ? undefined
      : globalThis.document.documentElement.dataset.theme,
  )

  useEffect(() => {
    const root = globalThis.document.documentElement
    const observer = new MutationObserver(() => {
      setTheme(root.dataset.theme)
    })
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-sheet-background'],
    })
    return () => observer.disconnect()
  }, [])

  return theme
}

export function useRemappedBlobImageUrl(
  sourceUrl: string | null,
  enabled = true,
): string | null {
  const sheetBackground = useSheetBackgroundPreference()
  const invertImages = useSheetImageInvertPreference()
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const themeAttribute = useThemeAttribute()
  const shouldRemap = enabled && sheetBackground === 'app' && invertImages
  const remapKey =
    shouldRemap && sourceUrl
      ? `${sourceUrl}:${systemDark}:${themeAttribute}:${invertImages}`
      : null
  const [remapCache, setRemapCache] = useState<{ key: string; url: string } | null>(null)

  useEffect(() => {
    if (!remapKey || !sourceUrl) return

    let cancelled = false
    let remappedUrl: string | null = null

    void (async () => {
      try {
        remappedUrl = await remapSheetImageFromUrl(sourceUrl)
        if (cancelled) {
          URL.revokeObjectURL(remappedUrl)
          return
        }
        setRemapCache({ key: remapKey, url: remappedUrl })
      } catch {
        if (!cancelled) setRemapCache({ key: remapKey, url: sourceUrl })
      }
    })()

    return () => {
      cancelled = true
      if (remappedUrl) URL.revokeObjectURL(remappedUrl)
    }
  }, [remapKey, sourceUrl])

  return useMemo(() => {
    if (!sourceUrl) return null
    if (!shouldRemap) return sourceUrl
    if (remapCache?.key === remapKey) return remapCache.url
    return sourceUrl
  }, [remapCache, remapKey, shouldRemap, sourceUrl])
}
