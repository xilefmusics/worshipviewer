import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover'
import { AvBackgroundSelector } from '@/components/player/av/AvBackgroundSelector'
import { DEFAULT_AV_PREFERENCES, type AvBackgroundAsset, type AvBackgroundLayer, type AvBackgroundPreset } from '@/lib/player/av-preferences'
import {
  avBackgroundToSetlistBackground,
  setlistBackgroundToAvBackground,
  type SetlistSongBackground,
} from '@/lib/setlist-background'
import { cn } from '@/lib/utils'

type SongBackgroundOverridePickerProps = {
  background: SetlistSongBackground | null
  songTitle: string
  canEdit: boolean
  disabled: boolean
  onChange: (background: SetlistSongBackground | null) => void
}

export function SongBackgroundOverridePicker({
  background,
  songTitle,
  canEdit,
  disabled,
  onChange,
}: SongBackgroundOverridePickerProps) {
  const { t } = useTranslation()
  const backgroundLayer: AvBackgroundLayer = background
    ? setlistBackgroundToAvBackground(background)
    : DEFAULT_AV_PREFERENCES.backgroundLayer

  const selectPreset = (preset: AvBackgroundPreset) => {
    onChange({ preset })
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
    onChange(avBackgroundToSetlistBackground(layer))
  }

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-9 w-full min-w-0 justify-start px-2 text-xs sm:col-span-2',
            !background && 'border-dashed text-[var(--color-muted-foreground)]',
          )}
          disabled={!canEdit || disabled}
          aria-label={t('setlists.editor.backgroundSelectAria', { title: songTitle })}
        >
          <span className="truncate">
            {background
              ? t('setlists.editor.backgroundChipOverride')
              : t('setlists.editor.backgroundChipInherited')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,34rem)] overflow-y-auto p-0">
        <AvBackgroundSelector
          backgroundLayer={backgroundLayer}
          previewText={songTitle || t('player.untitled')}
          contentLayer={DEFAULT_AV_PREFERENCES.contentLayer}
          initiallyExpanded
          selectedInherited={!background}
          onSelectInherited={() => onChange(null)}
          onSelectPreset={selectPreset}
          onSelectBackgroundAsset={selectAsset}
        />
      </PopoverContent>
    </PopoverRoot>
  )
}
