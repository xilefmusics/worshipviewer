import { useTranslation } from 'react-i18next'

import {
  AV_FONT_FAMILY_CHOICES,
  type AvContentLayer,
  type AvTextAlign,
  type AvTextShadow,
  type AvVerticalAlign,
} from '@/lib/player/av-preferences'
import { cn } from '@/lib/utils'

export type AvForegroundSelectorSettings = {
  contentLayer: AvContentLayer
  bilingualEnabled: boolean
  onContentLayerChange: (partial: Partial<AvContentLayer>) => void
  onBilingualChange: (enabled: boolean) => void
}

type Choice<T extends string> = {
  value: T
  label: string
}

const TEXT_ALIGN_CHOICES: Choice<AvTextAlign>[] = [
  {
    value: 'left',
    label: 'settings.playerRoles.content.alignLeft',
  },
  {
    value: 'center',
    label: 'settings.playerRoles.content.alignCenter',
  },
  {
    value: 'right',
    label: 'settings.playerRoles.content.alignRight',
  },
]

const VERTICAL_ALIGN_CHOICES: Choice<AvVerticalAlign>[] = [
  {
    value: 'top',
    label: 'settings.playerRoles.content.verticalTop',
  },
  {
    value: 'geometry_center',
    label: 'settings.playerRoles.content.verticalGeometryCenter',
  },
  {
    value: 'center',
    label: 'settings.playerRoles.content.verticalCenter',
  },
  {
    value: 'bottom',
    label: 'settings.playerRoles.content.verticalBottom',
  },
]

const TEXT_SHADOW_CHOICES: Choice<AvTextShadow>[] = [
  {
    value: 'none',
    label: 'settings.playerRoles.content.shadowNone',
  },
  {
    value: 'subtle',
    label: 'settings.playerRoles.content.shadowSubtle',
  },
  {
    value: 'medium',
    label: 'settings.playerRoles.content.shadowMedium',
  },
  {
    value: 'strong',
    label: 'settings.playerRoles.content.shadowStrong',
  },
]

export function AvForegroundSelector({
  contentLayer,
  bilingualEnabled,
  onContentLayerChange,
  onBilingualChange,
}: AvForegroundSelectorSettings) {
  const { t } = useTranslation()

  return (
    <div
      className="av-foreground-selector"
      role="group"
      aria-label={t('player.av.foregroundTitle')}
    >
      <section
        className="av-foreground-selector__section"
        aria-label={t('player.av.foregroundGeneral')}
      >
        <h3 className="av-geometry-selector-panel__title">{t('player.av.foregroundGeneral')}</h3>
        <div className="av-foreground-selector__settings">
          <label className="av-geometry-selector__setting av-foreground-selector__setting">
            <span className="av-geometry-selector__setting-copy">
              <span>{t('settings.playerRoles.content.maxLines')}</span>
              <output className="av-geometry-selector__setting-value">
                {contentLayer.maxLinesPerSlide}
              </output>
            </span>
            <input
              className="av-geometry-selector__slider"
              type="range"
              min={1}
              max={10}
              step={1}
              value={contentLayer.maxLinesPerSlide}
              aria-label={t('settings.playerRoles.content.maxLines')}
              onChange={(event) =>
                onContentLayerChange({
                  maxLinesPerSlide: Number.parseInt(event.currentTarget.value, 10),
                })
              }
            />
          </label>
          <ToggleFieldCard
            label={t('player.av.foregroundShowTranslation')}
            checked={bilingualEnabled}
            onChange={onBilingualChange}
          />
        </div>
        <div className="av-foreground-selector__settings">
          <SteppedSlider
            title={t('settings.playerRoles.content.textAlignTitle')}
            choices={TEXT_ALIGN_CHOICES.map((choice) => ({ ...choice, label: t(choice.label) }))}
            value={contentLayer.textAlign}
            onChange={(textAlign) => onContentLayerChange({ textAlign })}
            orientation="horizontal"
          />
          <SteppedSlider
            title={t('settings.playerRoles.content.verticalAlignTitle')}
            choices={VERTICAL_ALIGN_CHOICES.map((choice) => ({
              ...choice,
              label: t(choice.label),
            }))}
            value={contentLayer.verticalAlign}
            onChange={(verticalAlign) => onContentLayerChange({ verticalAlign })}
          />
        </div>
      </section>

      <section
        className="av-foreground-selector__section"
        aria-label={t('player.av.foregroundFont')}
      >
        <h3 className="av-geometry-selector-panel__title">{t('player.av.foregroundFont')}</h3>
        <div className="av-foreground-selector__settings">
          <label className="av-geometry-selector__setting av-foreground-selector__setting">
            <span className="av-geometry-selector__setting-copy">
              <span>{t('settings.playerRoles.content.fontSize')}</span>
              <output className="av-geometry-selector__setting-value">
                {contentLayer.fontSize}
              </output>
            </span>
            <input
              className="av-geometry-selector__slider"
              type="range"
              min={20}
              max={120}
              step={1}
              value={contentLayer.fontSize}
              aria-label={t('settings.playerRoles.content.fontSize')}
              onChange={(event) =>
                onContentLayerChange({
                  fontSize: Number.parseInt(event.currentTarget.value, 10),
                })
              }
            />
          </label>
          <GrayscaleSlider
            label={t('settings.playerRoles.content.primaryTextColor')}
            value={contentLayer.primaryTextLightness}
            blackLabel={t('settings.playerRoles.content.textColorBlack')}
            whiteLabel={t('settings.playerRoles.content.textColorWhite')}
            onChange={(primaryTextLightness) => onContentLayerChange({ primaryTextLightness })}
          />
          <GrayscaleSlider
            label={t('settings.playerRoles.content.secondaryTextColor')}
            value={contentLayer.secondaryTextLightness}
            blackLabel={t('settings.playerRoles.content.textColorBlack')}
            whiteLabel={t('settings.playerRoles.content.textColorWhite')}
            onChange={(secondaryTextLightness) => onContentLayerChange({ secondaryTextLightness })}
          />
          <SteppedSlider
            title={t('settings.playerRoles.content.textShadowTitle')}
            choices={TEXT_SHADOW_CHOICES.map((choice) => ({ ...choice, label: t(choice.label) }))}
            value={contentLayer.textShadow}
            onChange={(textShadow) => onContentLayerChange({ textShadow })}
          />
        </div>
      </section>

      <section
        className="av-foreground-selector__section"
        aria-label={t('player.av.foregroundTypeface')}
      >
        <h3 className="av-geometry-selector-panel__title">
          {t('player.av.foregroundTypeface')}
        </h3>
        <div
          className="av-foreground-selector__font-options"
          role="radiogroup"
          aria-label={t('settings.playerRoles.content.fontFamily')}
        >
          {AV_FONT_FAMILY_CHOICES.map((choice) => (
            <label
              key={choice.value}
              className={cn(
                'av-foreground-selector__font-choice',
                (contentLayer.fontFamily ?? 'rubik') === choice.value &&
                  'av-foreground-selector__font-choice--selected',
              )}
            >
              <input
                type="radio"
                name="av-font-family"
                value={choice.value}
                checked={(contentLayer.fontFamily ?? 'rubik') === choice.value}
                aria-label={t('settings.playerRoles.content.fontFamilyOption', {
                  font: choice.label,
                })}
                onChange={() => onContentLayerChange({ fontFamily: choice.value })}
              />
              <span
                className="av-foreground-selector__font-sample"
                style={{ fontFamily: choice.css }}
              >
                {t('player.av.fontSample')}
              </span>
              <span className="av-foreground-selector__font-name">{choice.label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}

function ToggleFieldCard({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      className={cn(
        'av-geometry-selector__setting',
        'av-foreground-selector__setting',
        'av-foreground-selector__setting--toggle',
      )}
    >
      <span className="av-geometry-selector__setting-copy">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  )
}

function GrayscaleSlider({
  label,
  value,
  blackLabel,
  whiteLabel,
  onChange,
}: {
  label: string
  value: number
  blackLabel: string
  whiteLabel: string
  onChange: (value: number) => void
}) {
  return (
    <label className="av-geometry-selector__setting av-foreground-selector__setting">
      <span className="av-geometry-selector__setting-copy">
        <span>{label}</span>
        <output className="av-geometry-selector__setting-value">{value}%</output>
      </span>
      <input
        className="av-geometry-selector__slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number.parseInt(event.currentTarget.value, 10))}
      />
      <span className="sr-only">{blackLabel}–{whiteLabel}</span>
    </label>
  )
}

function SteppedSlider<T extends string>({
  title,
  choices,
  value,
  onChange,
  orientation = 'vertical',
}: {
  title: string
  choices: Choice<T>[]
  value: T
  onChange: (value: T) => void
  orientation?: 'horizontal' | 'vertical'
}) {
  const selectedIndex = choices.findIndex((choice) => choice.value === value)
  const selectedChoice = choices[selectedIndex]

  return (
    <label
      className={cn(
        'av-geometry-selector__setting',
        'av-foreground-selector__setting',
        orientation === 'horizontal' && 'av-foreground-selector__setting--horizontal-slider',
      )}
    >
      <span className="av-geometry-selector__setting-copy">
        <span>{title}</span>
        <output className="av-geometry-selector__setting-value">
          {selectedChoice?.label ?? ''}
        </output>
      </span>
      <input
        className={cn(
          'av-geometry-selector__slider',
          orientation === 'vertical' && 'av-foreground-selector__slider--vertical',
          orientation === 'horizontal' && 'av-foreground-selector__slider--horizontal-align',
        )}
        type="range"
        min={0}
        max={choices.length - 1}
        step={1}
        value={Math.max(0, selectedIndex)}
        aria-label={title}
        aria-orientation={orientation}
        aria-valuetext={selectedChoice?.label}
        onChange={(event) => {
          const choice = choices[Number.parseInt(event.currentTarget.value, 10)]
          if (choice) onChange(choice.value)
        }}
      />
    </label>
  )
}
