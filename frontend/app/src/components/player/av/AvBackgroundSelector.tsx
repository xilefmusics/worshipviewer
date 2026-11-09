import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchMediaPage, mediaListKey, type Media } from '@/api/media'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import {
  AV_BACKGROUND_PRESETS,
  type AvBackgroundAsset,
  type AvBackgroundLayer,
  type AvBackgroundPreset,
  type AvContentLayer,
} from '@/lib/player/av-preferences'
import { getNextPageIndex } from '@/lib/list-pagination'
import { cn } from '@/lib/utils'

import './player-av.css'

const NO_TRANSITION = { style: 'none' as const, durationMs: 0 }

type AvBackgroundSelectorProps = {
  backgroundLayer: AvBackgroundLayer
  previewText: string
  contentLayer: AvContentLayer
  initiallyExpanded?: boolean
  selectedInherited?: boolean
  onSelectInherited?: () => void
  onSelectPreset: (preset: AvBackgroundPreset) => void
  onSelectBackgroundAsset?: (asset: AvBackgroundAsset) => void
  /** Kept for callers that only support image backgrounds. */
  onSelectBackgroundImage?: (image: { mediaId: string; assetId: string }) => void
}

function backgroundAsset(media: Media): AvBackgroundAsset | null {
  if (media.content.type === 'image') {
    return { kind: 'image', mediaId: media.id, assetId: media.content.blob_id }
  }
  if (media.content.type === 'video') {
    return {
      kind: 'video',
      mediaId: media.id,
      assetId: media.content.blob_id,
      ...(media.content.thumbnail_blob_id ? { thumbnailAssetId: media.content.thumbnail_blob_id } : {}),
    }
  }
  return null
}

export function AvBackgroundSelector({
  backgroundLayer,
  previewText,
  contentLayer,
  initiallyExpanded = false,
  selectedInherited = false,
  onSelectInherited,
  onSelectPreset,
  onSelectBackgroundAsset,
  onSelectBackgroundImage,
}: AvBackgroundSelectorProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const query = useInfiniteQuery({
    queryKey: mediaListKey('', null, true),
    enabled: expanded,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchMediaPage(queryClient, {
        page: pageParam as number,
        q: '',
        isBackground: true,
        signal,
      }),
    getNextPageParam: (_last, all) => getNextPageIndex(all),
  })
  const backgrounds = query.data?.pages.flatMap((page) => page.items) ?? []
  const selectedBackground = backgrounds.find(
    (media) => {
      const asset = backgroundAsset(media)
      return Boolean(
        asset &&
        (asset.kind === 'image'
          ? backgroundLayer.image?.mediaId === asset.mediaId && backgroundLayer.image?.assetId === asset.assetId
          : backgroundLayer.video?.mediaId === asset.mediaId && backgroundLayer.video?.assetId === asset.assetId),
      )
    },
  )
  const selectedLabel = selectedInherited
    ? t('player.av.usePlayerBackground')
    : backgroundLayer.image || backgroundLayer.video
      ? selectedBackground?.title ?? t('player.av.customBackground')
      : t('settings.playerRoles.background.default')

  return (
    <div className="av-background-selector-panel">
      <button
        type="button"
        className="av-background-selector-panel__toggle"
        aria-expanded={expanded}
        aria-controls="av-background-selector-options"
        aria-label={
          expanded ? t('player.av.backgroundCollapse') : t('player.av.backgroundExpand')
        }
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="av-background-selector-panel__toggle-label">
          {t('player.av.backgroundTitle')}
        </span>
        <span className="av-background-selector-panel__toggle-value">{selectedLabel}</span>
        <span
          className={cn(
            'av-background-selector-panel__chevron',
            expanded && 'av-background-selector-panel__chevron--expanded',
          )}
          aria-hidden
        />
      </button>

      <div
        id="av-background-selector-options"
        className={cn(
          'av-background-selector-panel__body',
          expanded && 'av-background-selector-panel__body--expanded',
        )}
      >
        <div className="av-background-selector-panel__body-inner">
          <div
            className="av-background-selector"
            role="radiogroup"
            aria-label={t('player.av.backgroundAria')}
          >
            {onSelectInherited ? (
              <button
                type="button"
                role="radio"
                aria-checked={selectedInherited}
                aria-label={t('player.av.usePlayerBackground')}
                className={cn(
                  'av-background-selector__option',
                  selectedInherited && 'av-background-selector__option--selected',
                )}
                onClick={onSelectInherited}
              >
                <div className="av-background-selector__preview grid place-items-center px-2 text-xs text-[var(--color-muted-foreground)]">
                  {t('player.av.usePlayerBackground')}
                </div>
                <span className="av-background-selector__label">
                  {t('player.av.usePlayerBackground')}
                </span>
              </button>
            ) : null}
            {AV_BACKGROUND_PRESETS.map((optionPreset) => {
              const selected =
                !selectedInherited && !backgroundLayer.image && !backgroundLayer.video && optionPreset === backgroundLayer.preset
              return (
                <button
                  key={optionPreset}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={cn(
                    'av-background-selector__option',
                    selected && 'av-background-selector__option--selected',
                  )}
                  onClick={() => onSelectPreset(optionPreset)}
                >
                  <div className="av-background-selector__preview">
                    <AvSlideView
                      contentText={previewText}
                      contentLayer={contentLayer}
                      backgroundLayer={{ preset: optionPreset }}
                      transition={NO_TRANSITION}
                      screenState="live"
                      compact
                      className="av-slide-view--compact av-slide-view--background-thumb"
                    />
                  </div>
                  <span className="av-background-selector__label">
                    {t('settings.playerRoles.background.default')}
                  </span>
                </button>
              )
            })}

            {backgrounds.flatMap((media) => {
              const asset = backgroundAsset(media)
              if (!media.is_background || !asset) return []
              if (!onSelectBackgroundAsset && asset.kind === 'video') return []
              const selected = !selectedInherited && (asset.kind === 'image'
                ? backgroundLayer.image?.mediaId === asset.mediaId && backgroundLayer.image?.assetId === asset.assetId
                : backgroundLayer.video?.mediaId === asset.mediaId && backgroundLayer.video?.assetId === asset.assetId)
              const optionLayer: AvBackgroundLayer = asset.kind === 'image'
                ? { preset: backgroundLayer.preset, image: { mediaId: asset.mediaId, assetId: asset.assetId } }
                : {
                    preset: backgroundLayer.preset,
                    video: {
                      mediaId: asset.mediaId,
                      assetId: asset.assetId,
                      ...(asset.thumbnailAssetId ? { thumbnailAssetId: asset.thumbnailAssetId } : {}),
                    },
                  }
              return [
                <button
                  key={`${asset.kind}:${asset.mediaId}:${asset.assetId}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={cn(
                    'av-background-selector__option',
                    selected && 'av-background-selector__option--selected',
                  )}
                  onClick={() => {
                    if (onSelectBackgroundAsset) onSelectBackgroundAsset(asset)
                    else if (asset.kind === 'image') {
                      onSelectBackgroundImage?.({ mediaId: asset.mediaId, assetId: asset.assetId })
                    }
                  }}
                >
                  <div className="av-background-selector__preview">
                    <AvSlideView
                      contentText={previewText}
                      contentLayer={contentLayer}
                      backgroundLayer={optionLayer}
                      transition={NO_TRANSITION}
                      screenState="live"
                      compact
                      className="av-slide-view--compact av-slide-view--background-thumb"
                    />
                  </div>
                  <span className="av-background-selector__label">{media.title}</span>
                </button>,
              ]
            })}
          </div>
          {query.isError ? (
            <div className="flex flex-col items-center gap-2 py-3 text-center text-sm">
              <span>{t('player.av.backgroundsError')}</span>
              <button type="button" className="underline" onClick={() => void query.refetch()}>
                {t('hub.error.retry')}
              </button>
            </div>
          ) : null}
          {!query.isPending && !query.isError && backgrounds.length === 0 ? (
            <p className="py-3 text-center text-sm text-[var(--color-muted-foreground)]">
              {t('player.av.backgroundsEmpty')}
            </p>
          ) : null}
          {query.hasNextPage ? (
            <button
              type="button"
              className="mx-auto block px-3 py-2 text-sm underline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? t('common.load') : t('hub.loadMore')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
