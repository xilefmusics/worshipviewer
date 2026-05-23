import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AvSlideView } from '@/components/player/av/AvSlideView'
import {
  AV_BACKGROUND_PRESETS,
  type AvBackgroundPreset,
  type AvContentLayer,
} from '@/lib/player/av-preferences'
import { cn } from '@/lib/utils'

import './player-av.css'

const PRESET_LABEL_KEYS: Record<AvBackgroundPreset, string> = {
  0: 'settings.playerRoles.background.black',
  1: 'settings.playerRoles.background.red',
  2: 'settings.playerRoles.background.ray',
}

const NO_TRANSITION = { style: 'none' as const, durationMs: 0 }

type AvBackgroundSelectorProps = {
  preset: AvBackgroundPreset
  previewText: string
  contentLayer: AvContentLayer
  onSelectPreset: (preset: AvBackgroundPreset) => void
}

export function AvBackgroundSelector({
  preset,
  previewText,
  contentLayer,
  onSelectPreset,
}: AvBackgroundSelectorProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

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
        <span className="av-background-selector-panel__toggle-value">
          {t(PRESET_LABEL_KEYS[preset])}
        </span>
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
            {AV_BACKGROUND_PRESETS.map((optionPreset) => {
              const selected = optionPreset === preset
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
                    {t(PRESET_LABEL_KEYS[optionPreset])}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
