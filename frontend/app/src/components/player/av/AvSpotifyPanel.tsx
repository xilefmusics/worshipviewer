import { useTranslation } from 'react-i18next'

import { AvBackgroundSelector } from '@/components/player/av/AvBackgroundSelector'
import { Button } from '@/components/ui/button'
import type {
  AvBackgroundLayer,
  AvBackgroundPreset,
  AvContentLayer,
} from '@/lib/player/av-preferences'

import './player-av.css'

type AvSpotifyPanelProps = {
  title: string
  resourceType: 'track' | 'playlist'
  canonicalUrl: string
  backgroundLayer: AvBackgroundLayer
  backgroundPreviewText: string
  contentLayer: AvContentLayer
  onSelectBackgroundPreset: (preset: AvBackgroundPreset) => void
  onSelectBackgroundImage: (image: { mediaId: string; assetId: string }) => void
}

export function AvSpotifyPanel({
  title,
  resourceType,
  canonicalUrl,
  backgroundLayer,
  backgroundPreviewText,
  contentLayer,
  onSelectBackgroundPreset,
  onSelectBackgroundImage,
}: AvSpotifyPanelProps) {
  const { t } = useTranslation()
  const previewText = backgroundPreviewText.split('\n')[0]?.trim() || backgroundPreviewText.trim()

  return (
    <div className="av-slides-panel-shell">
      <div className="av-media-transport" data-testid="av-spotify-panel" data-kind="spotify">
        <p className="av-media-transport__title">{title}</p>
        <p className="av-media-transport__kind">
          {t('media.kinds.spotify')} · {t(`media.spotify.${resourceType}`)}
        </p>
        <p className="av-media-transport__status">{t('media.actions.spotifyExternalHint')}</p>
        <div className="av-media-transport__controls">
          <Button asChild type="button">
            <a href={canonicalUrl} target="_blank" rel="noreferrer">
              {t('media.actions.openSpotify')}
            </a>
          </Button>
        </div>
      </div>
      <AvBackgroundSelector
        backgroundLayer={backgroundLayer}
        previewText={previewText}
        contentLayer={contentLayer}
        onSelectPreset={onSelectBackgroundPreset}
        onSelectBackgroundImage={onSelectBackgroundImage}
      />
    </div>
  )
}
