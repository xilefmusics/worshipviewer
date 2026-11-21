import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { components } from '@/api/schema'
import type { Song } from '@/api/setlists-detail'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AvBackgroundSelector } from '@/components/player/av/AvBackgroundSelector'
import { readAvBilingualPreference } from '@/lib/av-bilingual-preference'
import { readLyricCollapseWhitespacePreference } from '@/lib/lyric-whitespace-preference'
import { useResolvedPlayerItemChordData } from '@/lib/player/apply-song-flow'
import { avSlidesForPlayerItem } from '@/lib/player/av-nav'
import { buildAvSlideDeckEntries } from '@/lib/player/av-lyric-slides'
import {
  readAvPreferences,
  type AvBackgroundAsset,
  type AvBackgroundLayer,
  type AvBackgroundPreset,
  type AvContentLayer,
} from '@/lib/player/av-preferences'
import {
  avForegroundToSetlistForeground,
  avBackgroundToSetlistBackground,
  setlistBackgroundGeometryToAvSettings,
  setlistBackgroundToAvBackground,
  setlistForegroundToAvSettings,
  type SetlistSongBackground,
  type SetlistSongForeground,
} from '@/lib/setlist-background'
import { cn } from '@/lib/utils'
import type { SongFlowItem } from '@/ports/chord-engine'

type PlayerItem = components['schemas']['PlayerItem']

type SongBackgroundOverridePickerProps = {
  background: SetlistSongBackground | null
  foreground: SetlistSongForeground | null
  songTitle: string
  previewSong?: Song
  previewLanguage?: string | null
  previewFlow?: SongFlowItem[] | null
  canEdit: boolean
  disabled: boolean
  onSave: (background: SetlistSongBackground | null, foreground: SetlistSongForeground | null) => void
}

export function SongBackgroundOverridePicker({
  background,
  foreground,
  songTitle,
  previewSong,
  previewLanguage,
  previewFlow,
  canEdit,
  disabled,
  onSave,
}: SongBackgroundOverridePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draftBackground, setDraftBackground] = useState(background)
  const [draftForeground, setDraftForeground] = useState(foreground)
  const playerPreferences = readAvPreferences()
  const playerBilingualEnabled = readAvBilingualPreference()
  const backgroundLayer: AvBackgroundLayer = draftBackground
    ? setlistBackgroundToAvBackground(draftBackground)
    : playerPreferences.backgroundLayer
  const geometrySettings = setlistBackgroundGeometryToAvSettings(draftBackground, playerPreferences)
  const foregroundLayer = draftForeground
    ? setlistForegroundToAvSettings(draftForeground)
    : {
        contentLayer: playerPreferences.contentLayer,
        bilingualEnabled: playerBilingualEnabled,
      }

  const previewItem = useMemo<PlayerItem | undefined>(() => previewSong
    ? {
        type: 'chords',
        song: previewSong,
        language: previewLanguage ?? null,
        flow: previewFlow ?? null,
      }
    : undefined, [previewFlow, previewLanguage, previewSong])
  const resolvedPreviewSongData = useResolvedPlayerItemChordData(previewItem)
  const previewSlides = useMemo(() => {
    if (!previewItem) return undefined
    return avSlidesForPlayerItem(
      [previewItem],
      0,
      {
        maxLinesPerSlide: foregroundLayer.contentLayer.maxLinesPerSlide,
        balanceSlideLines: foregroundLayer.contentLayer.balanceSlideLines,
        collapseLyricWhitespace: readLyricCollapseWhitespacePreference(),
      },
      undefined,
      foregroundLayer.bilingualEnabled,
      resolvedPreviewSongData,
      songTitle,
    )
  }, [
    foregroundLayer.bilingualEnabled,
    foregroundLayer.contentLayer.balanceSlideLines,
    foregroundLayer.contentLayer.maxLinesPerSlide,
    previewItem,
    resolvedPreviewSongData,
    songTitle,
  ])
  const firstPreviewSlide = useMemo(() => {
    if (!previewSlides) return undefined
    return buildAvSlideDeckEntries(
      previewSlides.outline,
      previewSlides.sourceSlides,
      previewSlides.structuredSourceSlides,
    )[0]
  }, [previewSlides])
  const previewLines = firstPreviewSlide?.lines

  const saveBackground = (layer: AvBackgroundLayer, geometry = geometrySettings) => {
    setDraftBackground(avBackgroundToSetlistBackground(layer, geometry))
  }

  const selectPreset = (preset: AvBackgroundPreset) => {
    saveBackground({ preset })
  }

  const selectAsset = (asset: AvBackgroundAsset) => {
    const layer: AvBackgroundLayer = asset.kind === 'image'
      ? { preset: backgroundLayer.preset, image: { mediaId: asset.mediaId, assetId: asset.assetId } }
      : {
          preset: backgroundLayer.preset,
          video: {
            mediaId: asset.mediaId,
            assetId: asset.assetId,
            ...(asset.thumbnailAssetId ? { thumbnailAssetId: asset.thumbnailAssetId } : {}),
          },
        }
    saveBackground(layer)
  }

  const foregroundSelectorSettings = {
    ...foregroundLayer,
    onContentLayerChange: (partial: Partial<AvContentLayer>) =>
      setDraftForeground(
        avForegroundToSetlistForeground(
          { ...foregroundLayer.contentLayer, ...partial },
          foregroundLayer.bilingualEnabled,
        ),
      ),
    onBilingualChange: (enabled: boolean) =>
      setDraftForeground(
        avForegroundToSetlistForeground(foregroundLayer.contentLayer, enabled),
      ),
  }

  const saveGeometry = <K extends keyof typeof geometrySettings>(key: K, value: (typeof geometrySettings)[K]) => {
    saveBackground(backgroundLayer, { ...geometrySettings, [key]: value })
  }

  return (
    <Sheet open={open} onOpenChange={(next) => {
      if (next) {
        setDraftBackground(background)
        setDraftForeground(foreground)
      }
      setOpen(next)
    }}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-9 w-full min-w-0 justify-start px-2 text-xs sm:col-span-2',
            !background && !foreground && 'border-dashed text-[var(--color-muted-foreground)]',
          )}
          disabled={!canEdit || disabled}
          aria-label={t('setlists.editor.backgroundSelectAria', { title: songTitle })}
        >
          <span className="truncate">
            {background || foreground
              ? t('setlists.editor.backgroundChipOverride')
              : t('setlists.editor.backgroundChipInherited')}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="flex h-[min(88dvh,52rem)] max-h-[88dvh] flex-col overflow-hidden p-0 outline-none"
      >
        <div className="shrink-0 px-4 pb-3 pt-3 sm:px-6">
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-muted-foreground)]/40" />
          <div className="flex items-center gap-3">
            <SheetTitle className="min-w-0 flex-1 truncate text-base">
              {t('setlists.editor.backgroundDrawerTitle', { title: songTitle })}
            </SheetTitle>
            <SheetClose asChild>
              <Button type="button" variant="outline" size="sm">
                {t('common.cancel')}
              </Button>
            </SheetClose>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <AvBackgroundSelector
            backgroundLayer={backgroundLayer}
            previewText={firstPreviewSlide?.text || songTitle || t('player.untitled')}
            previewLines={previewLines?.length ? previewLines : undefined}
            contentLayer={foregroundLayer.contentLayer}
            foregroundSettings={foregroundSelectorSettings}
            layout="drawer"
            initiallyExpanded
            selectedInherited={!draftBackground}
            onSelectInherited={() => setDraftBackground(null)}
            selectedForegroundInherited={!draftForeground}
            onSelectForegroundInherited={() => setDraftForeground(null)}
            onSelectPreset={selectPreset}
            onSelectBackgroundAsset={selectAsset}
            geometryOverlay={geometrySettings.geometryOverlay}
            geometryOverlayRotatedBackground={geometrySettings.geometryOverlayRotatedBackground}
            geometryOverlayOpacity={geometrySettings.geometryOverlayOpacity}
            geometryOverlayColor={geometrySettings.geometryOverlayColor}
            geometryOverlaySize={geometrySettings.geometryOverlaySize}
            geometryOverlayThickness={geometrySettings.geometryOverlayThickness}
            onSelectGeometryOverlay={(value) => saveGeometry('geometryOverlay', value)}
            onSelectGeometryOverlayRotatedBackground={(value) =>
              saveGeometry('geometryOverlayRotatedBackground', value)
            }
            onSelectGeometryOverlayOpacity={(value) => saveGeometry('geometryOverlayOpacity', value)}
            onSelectGeometryOverlayColor={(value) => saveGeometry('geometryOverlayColor', value)}
            onSelectGeometryOverlaySize={(value) => saveGeometry('geometryOverlaySize', value)}
            onSelectGeometryOverlayThickness={(value) => saveGeometry('geometryOverlayThickness', value)}
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--color-border)] px-4 py-4 sm:px-6">
          <SheetClose asChild>
            <Button type="button" variant="outline">{t('common.cancel')}</Button>
          </SheetClose>
          <Button type="button" disabled={!canEdit || disabled} onClick={() => {
            onSave(draftBackground, draftForeground)
            setOpen(false)
          }}>
            {t('setlists.editor.avSave')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
