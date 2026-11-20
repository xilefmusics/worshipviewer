import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchMediaPage, mediaListKey, type Media } from '@/api/media'
import { mediaAssetDataUrl } from '@/api/media-upload'
import { AvBackgroundSelector } from '@/components/player/av/AvBackgroundSelector'
import type { AvForegroundSelectorSettings } from '@/components/player/av/AvForegroundSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getNextPageIndex } from '@/lib/list-pagination'
import { formatAvTimerRemaining } from '@/lib/player/av-timer'
import type {
  AvBackgroundAsset,
  AvBackgroundLayer,
  AvBackgroundPreset,
  AvContentLayer,
  AvGeometryOverlay,
} from '@/lib/player/av-preferences'

import './player-av.css'

export type AvTimerAudio = {
  mediaId: string
  assetId: string
  title: string
}

type AvTimerPanelProps = {
  title: string
  audio: AvTimerAudio | null
  durationSeconds: number
  endsAtMs: number | null
  now: number
  backgroundLayer: AvBackgroundLayer
  contentLayer: AvContentLayer
  foregroundSettings: AvForegroundSelectorSettings
  geometryOverlay: AvGeometryOverlay
  geometryOverlayOpacity: number
  geometryOverlayColor: number
  geometryOverlaySize: number
  geometryOverlayThickness: number
  geometryOverlayRotatedBackground: boolean
  onAudioChange: (audio: AvTimerAudio | null) => void
  onDurationChange: (durationSeconds: number) => void
  onStart: () => void
  onStop: () => void
  onDelete: () => void
  onSelectBackgroundPreset: (preset: AvBackgroundPreset) => void
  onSelectBackgroundAsset: (asset: AvBackgroundAsset) => void
  onSelectGeometryOverlay: (overlay: AvGeometryOverlay) => void
  onSelectGeometryOverlayOpacity: (opacity: number) => void
  onSelectGeometryOverlayColor: (color: number) => void
  onSelectGeometryOverlaySize: (size: number) => void
  onSelectGeometryOverlayThickness: (thickness: number) => void
  onSelectGeometryOverlayRotatedBackground: (rotatedBackground: boolean) => void
}

function audioResource(media: Media): AvTimerAudio | null {
  if (media.content.type !== 'audio') return null
  return {
    mediaId: media.id,
    assetId: media.content.blob_id,
    title: media.title,
  }
}

function formatDurationInput(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function parseDurationInput(value: string): number | null {
  const match = /^(\d{0,3})(?::(\d{0,2}))?$/.exec(value)
  if (!match) return null
  const minutes = Number(match[1] || 0)
  const seconds = Number(match[2] || 0)
  return seconds <= 59 ? minutes * 60 + seconds : null
}

export function AvTimerPanel({
  title,
  audio,
  durationSeconds,
  endsAtMs,
  now,
  backgroundLayer,
  contentLayer,
  foregroundSettings,
  geometryOverlay,
  geometryOverlayOpacity,
  geometryOverlayColor,
  geometryOverlaySize,
  geometryOverlayThickness,
  geometryOverlayRotatedBackground,
  onAudioChange,
  onDurationChange,
  onStart,
  onStop,
  onDelete,
  onSelectBackgroundPreset,
  onSelectBackgroundAsset,
  onSelectGeometryOverlay,
  onSelectGeometryOverlayOpacity,
  onSelectGeometryOverlayColor,
  onSelectGeometryOverlaySize,
  onSelectGeometryOverlayThickness,
  onSelectGeometryOverlayRotatedBackground,
}: AvTimerPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playbackError, setPlaybackError] = useState(false)
  const mediaQuery = useInfiniteQuery({
    queryKey: mediaListKey('', null),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchMediaPage(queryClient, { page: pageParam as number, q: '', signal }),
    getNextPageParam: (_lastPage, allPages) => getNextPageIndex(allPages),
  })
  const audioResources = useMemo(
    () =>
      mediaQuery.data?.pages
        .flatMap((page) => page.items)
        .flatMap((media) => {
          const resource = audioResource(media)
          return resource ? [resource] : []
        }) ?? [],
    [mediaQuery.data],
  )
  const selectedAudio =
    audioResources.find((resource) => resource.mediaId === audio?.mediaId) ?? audio
  const remainingMs = endsAtMs == null ? durationSeconds * 1000 : Math.max(0, endsAtMs - now)
  const running = endsAtMs != null && remainingMs > 0
  const [durationInputDraft, setDurationInputDraft] = useState<string | null>(null)
  const [durationInputFocused, setDurationInputFocused] = useState(false)
  const durationInput = durationInputFocused
    ? durationInputDraft ?? formatDurationInput(durationSeconds)
    : formatDurationInput(durationSeconds)
  const durationInputSeconds = parseDurationInput(durationInput)

  useEffect(() => {
    const player = audioRef.current
    if (!player) return
    if (!running) {
      player.pause()
      if (endsAtMs == null) player.currentTime = 0
    }
  }, [audio?.assetId, audio?.mediaId, endsAtMs, running])

  useEffect(
    () => () => {
      audioRef.current?.pause()
    },
    [],
  )

  function startTimer() {
    const player = audioRef.current
    setPlaybackError(false)
    if (player && audio) {
      player.currentTime = 0
      void player.play().catch(() => setPlaybackError(true))
    }
    onStart()
  }

  function changeDurationInput(value: string) {
    setDurationInputDraft(value)
    const parsedDurationSeconds = parseDurationInput(value)
    if (parsedDurationSeconds != null) onDurationChange(parsedDurationSeconds)
  }

  return (
    <div className="av-slides-panel-shell">
      <div className="av-slides-panel av-slides-panel--empty av-slides-panel--timer">
        <section className="av-timer-panel" aria-label={title}>
          <div className="av-timer-panel__settings">
            <select
              className="av-timer-panel__select"
              aria-label={t('player.av.timerAudio')}
              value={audio?.mediaId ?? ''}
              onChange={(event) => {
                const selected = audioResources.find(
                  (resource) => resource.mediaId === event.target.value,
                )
                onAudioChange(selected ?? null)
                setPlaybackError(false)
              }}
            >
              <option value="">{t('player.av.timerChooseAudio')}</option>
              {selectedAudio &&
              !audioResources.some((resource) => resource.mediaId === selectedAudio.mediaId) ? (
                <option value={selectedAudio.mediaId}>{selectedAudio.title}</option>
              ) : null}
              {audioResources.map((resource) => (
                <option key={resource.mediaId} value={resource.mediaId}>
                  {resource.title}
                </option>
              ))}
            </select>

            {mediaQuery.isLoading ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {t('player.av.timerLoadingAudio')}
              </p>
            ) : mediaQuery.isError ? (
              <p className="text-sm text-[var(--color-destructive)]" role="alert">
                {t('player.av.timerAudioLoadFailed')}
              </p>
            ) : null}

            {mediaQuery.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={mediaQuery.isFetchingNextPage}
                onClick={() => void mediaQuery.fetchNextPage()}
              >
                {mediaQuery.isFetchingNextPage
                  ? t('player.av.timerLoadingMore')
                  : t('player.av.timerLoadMore')}
              </Button>
            ) : null}

            <Input
              className="av-timer-panel__duration-input"
              type="text"
              inputMode="text"
              autoComplete="off"
              aria-label={t('player.av.timerDuration')}
              placeholder="5:00"
              maxLength={6}
              value={durationInput}
              onFocus={() => {
                setDurationInputDraft(formatDurationInput(durationSeconds))
                setDurationInputFocused(true)
              }}
              onChange={(event) => changeDurationInput(event.target.value)}
              onBlur={() => {
                setDurationInputFocused(false)
                setDurationInputDraft(null)
              }}
            />

            <div className="av-timer-panel__actions">
              <Button
                type="button"
                onClick={startTimer}
                disabled={durationInputSeconds == null || durationInputSeconds <= 0}
              >
                {running ? t('player.av.timerRestart') : t('player.av.timerStart')}
              </Button>
              <Button type="button" variant="outline" onClick={onDelete}>
                {t('player.av.timerDelete')}
              </Button>
              {running ? (
                <Button type="button" variant="outline" onClick={onStop}>
                  {t('player.av.timerStop')}
                </Button>
              ) : null}
            </div>
            {playbackError ? (
              <p className="text-sm text-[var(--color-destructive)]" role="alert">
                {t('player.av.timerAudioPlaybackFailed')}
              </p>
            ) : null}
          </div>

          {audio ? (
            <audio
              ref={audioRef}
              className="sr-only"
              src={mediaAssetDataUrl(audio.mediaId, audio.assetId)}
              preload="auto"
              loop
              aria-hidden="true"
            />
          ) : null}
        </section>
      </div>
      <AvBackgroundSelector
        backgroundLayer={backgroundLayer}
        previewText={formatAvTimerRemaining(remainingMs)}
        contentLayer={contentLayer}
        foregroundSettings={foregroundSettings}
        geometryOverlay={geometryOverlay}
        geometryOverlayOpacity={geometryOverlayOpacity}
        geometryOverlayColor={geometryOverlayColor}
        geometryOverlaySize={geometryOverlaySize}
        geometryOverlayThickness={geometryOverlayThickness}
        geometryOverlayRotatedBackground={geometryOverlayRotatedBackground}
        onSelectPreset={onSelectBackgroundPreset}
        onSelectBackgroundAsset={onSelectBackgroundAsset}
        onSelectGeometryOverlay={onSelectGeometryOverlay}
        onSelectGeometryOverlayOpacity={onSelectGeometryOverlayOpacity}
        onSelectGeometryOverlayColor={onSelectGeometryOverlayColor}
        onSelectGeometryOverlaySize={onSelectGeometryOverlaySize}
        onSelectGeometryOverlayThickness={onSelectGeometryOverlayThickness}
        onSelectGeometryOverlayRotatedBackground={onSelectGeometryOverlayRotatedBackground}
      />
    </div>
  )
}
