import { useTranslation } from 'react-i18next'

import { AvBackgroundSelector } from '@/components/player/av/AvBackgroundSelector'
import { Button } from '@/components/ui/button'
import type {
  AvBackgroundAsset,
  AvBackgroundLayer,
  AvBackgroundPreset,
  AvContentLayer,
} from '@/lib/player/av-preferences'
import {
  formatAvClock,
  isWebPageAvKind,
  transportCapabilitiesFromAck,
  type AvTimedKind,
} from '@/lib/player/av-projection-playback'
import type { AvProjectionPlaybackAction } from '@/lib/player/av-projection-protocol'
import type { AvAggregatedPlayback } from '@/lib/player/av-projection-reducer'

import './player-av.css'

type AvMediaTransportPanelProps = {
  kind: AvTimedKind
  title: string
  projected: boolean
  issuedAction?: AvProjectionPlaybackAction | null
  playback: AvAggregatedPlayback
  volume: number
  muted: boolean
  loop: boolean
  videoPreviewCurrentTimeMs: number
  videoPreviewDurationMs: number
  backgroundLayer: AvBackgroundLayer
  backgroundPreviewText: string
  contentLayer: AvContentLayer
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onSeek: (positionMs: number) => void
  onRestart: () => void
  onVolume: (volume: number) => void
  onMute: (muted: boolean) => void
  onLoop: (loop: boolean) => void
  onRetry: () => void
  onSelectBackgroundPreset: (preset: AvBackgroundPreset) => void
  onSelectBackgroundAsset: (asset: AvBackgroundAsset) => void
}

function errorCopyKey(code: string | undefined): string {
  switch (code) {
    case 'embed_blocked':
      return 'player.av.mediaEmbedFailed'
    case 'provider_unavailable':
    case 'provider_error':
      return 'player.av.mediaProviderFailed'
    case 'unsupported_source':
      return 'player.av.mediaUnsupportedSource'
    case 'autoplay_blocked':
      return 'player.av.mediaAutoplayFailed'
    default:
      return 'player.av.mediaError'
  }
}

export function AvMediaTransportPanel({
  kind,
  title,
  projected,
  issuedAction = null,
  playback,
  volume,
  muted,
  loop,
  videoPreviewCurrentTimeMs,
  videoPreviewDurationMs,
  backgroundLayer,
  backgroundPreviewText,
  contentLayer,
  onPlay,
  onPause,
  onResume,
  onSeek,
  onRestart,
  onVolume,
  onMute,
  onLoop,
  onRetry,
  onSelectBackgroundPreset,
  onSelectBackgroundAsset,
}: AvMediaTransportPanelProps) {
  const { t } = useTranslation()
  const web = isWebPageAvKind(kind)
  const capabilities = transportCapabilitiesFromAck(kind, playback, projected)
  const playing = playback.status === 'playing'
  const failed = playback.status === 'error' || playback.errorCount > 0
  const duration = playback.durationMs ?? playback.seekableEndMs
  const previewCanSeek = kind === 'video' && videoPreviewDurationMs > 0
  const showSeek = capabilities.seek || previewCanSeek
  const canSeek = capabilities.seek || previewCanSeek
  const seekStart = capabilities.seek ? playback.seekableStartMs : 0
  const seekDuration = capabilities.seek ? duration : videoPreviewDurationMs
  const seekPosition = capabilities.seek ? playback.currentTimeMs : videoPreviewCurrentTimeMs
  const optimisticPlaying =
    projected &&
    (issuedAction === 'play' || issuedAction === 'resume' || issuedAction === 'restart') &&
    playback.status === 'idle'
  const hiddenWeb = web && projected && (issuedAction === 'pause' || playback.status === 'paused')
  const primaryAction =
    !projected || playback.status === 'ended' || hiddenWeb
      ? 'play'
      : playing || optimisticPlaying
        ? 'pause'
        : capabilities.resume
          ? 'resume'
          : 'play'

  const statusLabel = !projected
    ? t(web ? 'player.av.mediaPreviewOnlyShow' : 'player.av.mediaPreviewOnly')
    : playback.status === 'playing'
      ? t(web ? 'player.av.mediaShowing' : 'player.av.mediaPlaying')
      : playback.status === 'paused'
        ? t(web ? 'player.av.mediaHidden' : 'player.av.mediaPaused')
        : playback.status === 'ended'
          ? t('player.av.mediaEnded')
          : playback.status === 'loading'
            ? t('player.av.mediaLoading')
            : playback.status === 'error'
              ? t('player.av.mediaError')
              : playback.status === 'mixed'
                ? t('player.av.mediaMixed')
                : t(web ? 'player.av.mediaPreviewOnlyShow' : 'player.av.mediaPreviewOnly')

  const failedOutputs = playback.outputs.filter(
    (output) => output.outputStatus === 'failed' || output.playback?.status === 'error',
  )
  const firstErrorCode = failedOutputs[0]?.error?.code

  return (
    <div className="av-slides-panel-shell">
      <div className="av-media-transport" data-testid="av-media-transport" data-kind={kind}>
        <p className="av-media-transport__title">{title}</p>
        <p className="av-media-transport__kind">{t(`media.kinds.${kind}`)}</p>
        <p className="av-media-transport__status" data-testid="av-media-status">
          {statusLabel}
        </p>

        <div className="av-media-transport__controls">
          {primaryAction === 'play' ? (
            <Button type="button" onClick={onPlay}>
              {t(web ? 'player.av.show' : 'player.av.play')}
            </Button>
          ) : primaryAction === 'pause' ? (
            <Button type="button" onClick={onPause}>
              {t(web ? 'player.av.hide' : 'player.av.pause')}
            </Button>
          ) : (
            <Button type="button" onClick={onResume}>
              {t('player.av.resume')}
            </Button>
          )}
          {capabilities.restart ? (
            <Button type="button" variant="outline" onClick={onRestart} disabled={!projected}>
              {t(web ? 'player.av.reload' : 'player.av.restart')}
            </Button>
          ) : null}
          {capabilities.loop ? (
            <Button
              type="button"
              variant={loop ? 'default' : 'outline'}
              aria-pressed={loop}
              onClick={() => onLoop(!loop)}
            >
              {t('player.av.loop')}
            </Button>
          ) : null}
        </div>

        {showSeek || capabilities.volume ? (
          <>
            {showSeek ? (
              <label className="av-media-transport__slider">
                <span className="av-media-transport__slider-label">{t('player.av.seek')}</span>
                <input
                  type="range"
                  min={seekStart}
                  max={Math.max(seekStart, seekDuration)}
                  step={100}
                  value={Math.min(seekPosition, seekDuration || seekPosition)}
                  disabled={!canSeek}
                  aria-label={t('player.av.seek')}
                  onChange={(event) => onSeek(Number(event.target.value))}
                />
                <span className="av-media-transport__clock">
                  {formatAvClock(seekPosition)}
                  {seekDuration > 0 ? ` / ${formatAvClock(seekDuration)}` : ''}
                </span>
              </label>
            ) : null}

            {capabilities.volume || capabilities.mute ? (
              <div className="av-media-transport__volume-row">
                {capabilities.volume ? (
                  <label className="av-media-transport__slider">
                    <span className="av-media-transport__slider-label">{t('player.av.volume')}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      aria-label={t('player.av.volume')}
                      onChange={(event) => onVolume(Number(event.target.value))}
                    />
                  </label>
                ) : null}
                {capabilities.mute ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={muted}
                    onClick={() => onMute(!muted)}
                  >
                    {muted ? t('player.av.unmute') : t('player.av.mute')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {failed ? (
          <div className="av-media-transport__error" role="alert">
            <p>{t(errorCopyKey(firstErrorCode))}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('player.av.retry')}
            </Button>
          </div>
        ) : null}

        {failedOutputs.length > 0 ? (
          <ul className="av-media-transport__outputs">
            {failedOutputs.map((output) => (
              <li key={output.outputId}>
                {t('player.av.outputFailed', {
                  id: output.outputId,
                  detail: output.error?.detail ?? output.playback?.status ?? '',
                })}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <AvBackgroundSelector
        backgroundLayer={backgroundLayer}
        previewText={backgroundPreviewText}
        contentLayer={contentLayer}
        onSelectPreset={onSelectBackgroundPreset}
        onSelectBackgroundAsset={onSelectBackgroundAsset}
      />
    </div>
  )
}
