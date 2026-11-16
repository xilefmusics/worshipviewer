import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchMediaPage, mediaListKey, type Media } from '@/api/media'
import { AvGeometryOverlayShape } from '@/components/player/av/AvGeometryOverlayShape'
import { AvForegroundSelector, type AvForegroundSelectorSettings } from '@/components/player/av/AvForegroundSelector'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import {
  AV_BACKGROUND_PRESETS,
  type AvBackgroundAsset,
  type AvBackgroundLayer,
  type AvBackgroundPreset,
  type AvContentLayer,
  type AvGeometryOverlay,
} from '@/lib/player/av-preferences'
import { getNextPageIndex } from '@/lib/list-pagination'
import { cn } from '@/lib/utils'

import './player-av.css'

const NO_TRANSITION = { style: 'none' as const, durationMs: 0 }
const GEOMETRY_OVERLAYS = [
  'cross',
  'inverted_cross',
  'sliced_square',
  'sliced_rectangle',
  'sliced_rectangle_three',
  'circle',
  'square',
  'rectangle',
  'triangle',
  'inverted_triangle',
  'diamond',
  'heart',
  'gospel',
] as const
const GEOMETRY_OVERLAY_LABEL_OVERRIDES: Partial<Record<Exclude<AvGeometryOverlay, 'none'>, string>> = {
  inverted_cross: 'InvertedCross',
  sliced_square: 'SlicedSquare',
  sliced_rectangle: 'SlicedRectangle',
  sliced_rectangle_three: 'SlicedRectangleThree',
  inverted_triangle: 'InvertedTriangle',
  gospel: 'Gospel',
}

type AvBackgroundSelectorProps = {
  backgroundLayer: AvBackgroundLayer
  previewText: string
  contentLayer: AvContentLayer
  foregroundSettings?: AvForegroundSelectorSettings
  initiallyExpanded?: boolean
  selectedInherited?: boolean
  onSelectInherited?: () => void
  onSelectPreset: (preset: AvBackgroundPreset) => void
  onSelectBackgroundAsset?: (asset: AvBackgroundAsset) => void
  geometryOverlay?: AvGeometryOverlay
  geometryOverlayOpacity?: number
  geometryOverlayColor?: number
  geometryOverlaySize?: number
  geometryOverlayThickness?: number
  geometryOverlayRotatedBackground?: boolean
  onSelectGeometryOverlay?: (overlay: AvGeometryOverlay) => void
  onSelectGeometryOverlayOpacity?: (opacity: number) => void
  onSelectGeometryOverlayColor?: (color: number) => void
  onSelectGeometryOverlaySize?: (size: number) => void
  onSelectGeometryOverlayThickness?: (thickness: number) => void
  onSelectGeometryOverlayRotatedBackground?: (rotatedBackground: boolean) => void
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

function geometryOverlayLabel(overlay: Exclude<AvGeometryOverlay, 'none'>): string {
  return GEOMETRY_OVERLAY_LABEL_OVERRIDES[overlay]
    ?? `${overlay[0].toUpperCase()}${overlay.slice(1)}`
}

export function AvBackgroundSelector({
  backgroundLayer,
  previewText,
  contentLayer,
  foregroundSettings,
  initiallyExpanded = false,
  selectedInherited = false,
  onSelectInherited,
  onSelectPreset,
  onSelectBackgroundAsset,
  onSelectBackgroundImage,
  geometryOverlay = 'none',
  geometryOverlayOpacity = 77,
  geometryOverlayColor = 77,
  geometryOverlaySize = 77,
  geometryOverlayThickness = 77,
  geometryOverlayRotatedBackground = false,
  onSelectGeometryOverlay,
  onSelectGeometryOverlayOpacity,
  onSelectGeometryOverlayColor,
  onSelectGeometryOverlaySize,
  onSelectGeometryOverlayThickness,
  onSelectGeometryOverlayRotatedBackground,
}: AvBackgroundSelectorProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [openPanel, setOpenPanel] = useState<'background' | 'foreground' | null>(
    initiallyExpanded ? 'background' : null,
  )
  const backgroundExpanded = openPanel === 'background'
  const foregroundExpanded = openPanel === 'foreground'
  const panelExpanded = openPanel !== null
  const query = useInfiniteQuery({
    queryKey: mediaListKey('', null, true),
    enabled: backgroundExpanded,
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
  const selectedOverlayLabel = onSelectGeometryOverlay && geometryOverlay !== 'none'
    ? t(`player.av.geometryOverlay${geometryOverlayLabel(geometryOverlay)}`)
    : null
  const rotatedBackgroundActive = geometryOverlay !== 'gospel' && geometryOverlayRotatedBackground && (
    Boolean(backgroundLayer.image || backgroundLayer.video) || backgroundLayer.preset === 2
  )
  return (
    <div className="av-background-selector-panel">
      <div
        className={cn(
          'av-background-selector-panel__tabs',
          !foregroundSettings && 'av-background-selector-panel__tabs--single',
        )}
        role="group"
        aria-label={t('player.av.layerSelectorAria')}
      >
        <button
          type="button"
          className={cn(
            'av-background-selector-panel__toggle',
            backgroundExpanded && 'av-background-selector-panel__toggle--selected',
          )}
          aria-expanded={backgroundExpanded}
          aria-controls="av-background-selector-options"
          aria-label={backgroundExpanded ? t('player.av.backgroundCollapse') : t('player.av.backgroundExpand')}
          onClick={() => setOpenPanel((open) => open === 'background' ? null : 'background')}
        >
          <span className="av-background-selector-panel__toggle-label">
            {t('player.av.backgroundTitle')}
          </span>
          <span className="av-background-selector-panel__toggle-value">
            {selectedLabel}
            {selectedOverlayLabel ? ` · ${selectedOverlayLabel}` : ''}
          </span>
          <span
            className={cn(
              'av-background-selector-panel__chevron',
              backgroundExpanded && 'av-background-selector-panel__chevron--expanded',
            )}
            aria-hidden
          />
        </button>
        {foregroundSettings ? (
          <button
            type="button"
            className={cn(
              'av-background-selector-panel__toggle',
              'av-background-selector-panel__toggle--foreground',
              foregroundExpanded && 'av-background-selector-panel__toggle--selected',
            )}
            aria-expanded={foregroundExpanded}
            aria-controls="av-background-selector-options"
            aria-label={foregroundExpanded ? t('player.av.foregroundCollapse') : t('player.av.foregroundExpand')}
            onClick={() => setOpenPanel((open) => open === 'foreground' ? null : 'foreground')}
          >
            <span className="av-background-selector-panel__toggle-label">
              {t('player.av.foregroundTitle')}
            </span>
            <span
              className={cn(
                'av-background-selector-panel__chevron',
                foregroundExpanded && 'av-background-selector-panel__chevron--expanded',
              )}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      <div
        id="av-background-selector-options"
        className={cn(
          'av-background-selector-panel__body',
          panelExpanded && 'av-background-selector-panel__body--expanded',
        )}
        role="region"
        aria-label={t(foregroundExpanded ? 'player.av.foregroundTitle' : 'player.av.backgroundTitle')}
      >
        <div className="av-background-selector-panel__body-inner">
          {foregroundExpanded && foregroundSettings ? (
            <AvForegroundSelector {...foregroundSettings} />
          ) : null}
          <div hidden={!backgroundExpanded}>
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
                      geometryOverlay="none"
                      geometryOverlayOpacity={100}
                      geometryOverlayColor={100}
                      geometryOverlaySize={geometryOverlaySize}
                      geometryOverlayThickness={geometryOverlayThickness}
                      geometryOverlayRotatedBackground={false}
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
                      geometryOverlay="none"
                      geometryOverlayOpacity={100}
                      geometryOverlayColor={100}
                      geometryOverlaySize={geometryOverlaySize}
                      geometryOverlayThickness={geometryOverlayThickness}
                      geometryOverlayRotatedBackground={false}
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
          {onSelectGeometryOverlay ? (
            <div className="av-geometry-selector-panel">
              <span className="av-geometry-selector-panel__title">
                {t('player.av.geometryOverlayTitle')}
              </span>
              <div
                className="av-background-selector av-background-selector--geometry"
                role="radiogroup"
                aria-label={t('player.av.geometryOverlayAria')}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={geometryOverlay === 'none'}
                  className={cn(
                    'av-background-selector__option',
                    'av-geometry-selector__option',
                    geometryOverlay === 'none' && 'av-background-selector__option--selected',
                  )}
                  onClick={() => onSelectGeometryOverlay('none')}
                >
                  <div
                    className="av-background-selector__preview av-geometry-selector__preview"
                    aria-hidden
                  />
                  <span className="av-background-selector__label">
                    {t('player.av.geometryOverlayNone')}
                  </span>
                </button>
                {GEOMETRY_OVERLAYS.map((overlay) => (
                  <button
                    key={overlay}
                    type="button"
                    role="radio"
                    aria-checked={geometryOverlay === overlay}
                    className={cn(
                      'av-background-selector__option',
                      'av-geometry-selector__option',
                      geometryOverlay === overlay && 'av-background-selector__option--selected',
                    )}
                    onClick={() => onSelectGeometryOverlay(overlay)}
                  >
                    <div className="av-background-selector__preview av-geometry-selector__preview">
                      <AvGeometryOverlayShape
                        overlay={overlay}
                        opacity={100}
                        color={100}
                        size={geometryOverlaySize}
                        thickness={geometryOverlayThickness}
                      />
                    </div>
                    <span className="av-background-selector__label">
                      {t(`player.av.geometryOverlay${geometryOverlayLabel(overlay)}`)}
                    </span>
                  </button>
                ))}
              </div>
              {onSelectGeometryOverlayOpacity && onSelectGeometryOverlayColor && onSelectGeometryOverlaySize && onSelectGeometryOverlayThickness ? (
                <div
                  className="av-geometry-selector__settings"
                  role="group"
                  aria-label={t('player.av.geometryOverlaySettings')}
                >
                  <span className="av-geometry-selector-panel__title">
                    {t('player.av.geometryOverlaySettings')}
                  </span>
                  <div className="av-geometry-selector__settings-sliders">
                    {onSelectGeometryOverlayRotatedBackground && geometryOverlay !== 'gospel' ? (
                      <div className="av-geometry-selector__setting av-geometry-selector__setting--fill">
                        <span className="av-geometry-selector__fill-title">
                          {t('player.av.geometryOverlayFill')}
                        </span>
                        <div
                          className="av-geometry-selector__fill-options"
                          role="radiogroup"
                          aria-label={t('player.av.geometryOverlayFill')}
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={!geometryOverlayRotatedBackground}
                            className={cn(
                              'av-geometry-selector__fill-option',
                              !geometryOverlayRotatedBackground && 'av-geometry-selector__fill-option--selected',
                            )}
                            onClick={() => onSelectGeometryOverlayRotatedBackground(false)}
                          >
                            <span className="av-geometry-selector__fill-label">
                              {t('player.av.geometryOverlayFillBlack')}
                            </span>
                            <span
                              className="av-geometry-selector__fill-indicator"
                              aria-hidden
                            >
                              {!geometryOverlayRotatedBackground ? '✓' : ''}
                            </span>
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={geometryOverlayRotatedBackground}
                            className={cn(
                              'av-geometry-selector__fill-option',
                              geometryOverlayRotatedBackground && 'av-geometry-selector__fill-option--selected',
                            )}
                            onClick={() => onSelectGeometryOverlayRotatedBackground(true)}
                          >
                            <span className="av-geometry-selector__fill-label">
                              {t('player.av.geometryOverlayFillRotatedBackground')}
                            </span>
                            <span
                              className="av-geometry-selector__fill-indicator"
                              aria-hidden
                            >
                              {geometryOverlayRotatedBackground ? '✓' : ''}
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <label className="av-geometry-selector__setting">
                      <span className="av-geometry-selector__setting-copy">
                        <span>{t('player.av.geometryOverlayOpacity')}</span>
                        <span className="av-geometry-selector__setting-value">
                          {rotatedBackgroundActive ? '100%' : `${geometryOverlayOpacity}%`}
                        </span>
                      </span>
                      <input
                        className="av-geometry-selector__slider"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={rotatedBackgroundActive ? 100 : geometryOverlayOpacity}
                        aria-label={t('player.av.geometryOverlayOpacity')}
                        disabled={rotatedBackgroundActive}
                        onChange={(event) => onSelectGeometryOverlayOpacity(Number(event.currentTarget.value))}
                      />
                    </label>
                    <label className="av-geometry-selector__setting">
                      <span className="av-geometry-selector__setting-copy">
                        <span>{t('player.av.geometryOverlayColor')}</span>
                        <span className="av-geometry-selector__setting-value">{geometryOverlayColor}%</span>
                      </span>
                      <input
                        className="av-geometry-selector__slider"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={geometryOverlayColor}
                        aria-label={t('player.av.geometryOverlayColor')}
                        disabled={rotatedBackgroundActive || geometryOverlay === 'gospel'}
                        onChange={(event) => onSelectGeometryOverlayColor(Number(event.currentTarget.value))}
                      />
                    </label>
                    <label className="av-geometry-selector__setting">
                      <span className="av-geometry-selector__setting-copy">
                        <span>{t('player.av.geometryOverlaySize')}</span>
                        <span className="av-geometry-selector__setting-value">{geometryOverlaySize}%</span>
                      </span>
                      <input
                        className="av-geometry-selector__slider"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={geometryOverlaySize}
                        aria-label={t('player.av.geometryOverlaySize')}
                        onChange={(event) => onSelectGeometryOverlaySize(Number(event.currentTarget.value))}
                      />
                    </label>
                    <label className="av-geometry-selector__setting">
                      <span className="av-geometry-selector__setting-copy">
                        <span>{t('player.av.geometryOverlayThickness')}</span>
                        <span className="av-geometry-selector__setting-value">{geometryOverlayThickness}%</span>
                      </span>
                      <input
                        className="av-geometry-selector__slider"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={geometryOverlayThickness}
                        aria-label={t('player.av.geometryOverlayThickness')}
                        disabled={
                          geometryOverlay !== 'cross' &&
                          geometryOverlay !== 'inverted_cross' &&
                          geometryOverlay !== 'sliced_square' &&
                          geometryOverlay !== 'sliced_rectangle' &&
                          geometryOverlay !== 'sliced_rectangle_three'
                        }
                        onChange={(event) => onSelectGeometryOverlayThickness(Number(event.currentTarget.value))}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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
    </div>
  )
}
