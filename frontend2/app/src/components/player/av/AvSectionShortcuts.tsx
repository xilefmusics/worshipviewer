import { useTranslation } from 'react-i18next'

import {
  AV_BLANK_SHORTCUT_KEY,
  AV_BLACKOUT_SHORTCUT_KEY,
  avAvailableSectionJumpShortcuts,
  type AvSectionJumpShortcut,
} from '@/lib/player/av-keyboard'
import type { AvScreenState } from '@/lib/player/av-preferences'
import type { AvSectionOutline } from '@/lib/player/av-lyric-slides'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvSectionShortcutsProps = {
  outline: AvSectionOutline[]
  screenState: AvScreenState
  onJump: (sectionTitle: string) => void
  onToggleBlank: () => void
  onToggleBlackout: () => void
}

export function AvSectionShortcuts({
  outline,
  screenState,
  onJump,
  onToggleBlank,
  onToggleBlackout,
}: AvSectionShortcutsProps) {
  const { t } = useTranslation()
  const sectionShortcuts = avAvailableSectionJumpShortcuts(outline)

  return (
    <div className="player-av__section-shortcuts" role="toolbar" aria-label={t('player.av.sectionShortcutsAria')}>
      {sectionShortcuts.map((shortcut) => (
        <SectionShortcutButton key={shortcut.key} shortcut={shortcut} onJump={onJump} />
      ))}
      <button
        type="button"
        className={cn(
          'player-av__section-shortcut',
          screenState === 'blank' && 'player-av__section-shortcut--active',
        )}
        aria-keyshortcuts={AV_BLANK_SHORTCUT_KEY}
        aria-label={t('player.av.blankToggle')}
        aria-pressed={screenState === 'blank'}
        onClick={onToggleBlank}
      >
        <kbd className="player-av__section-shortcut-key">{AV_BLANK_SHORTCUT_KEY.toUpperCase()}</kbd>
        <span className="player-av__section-shortcut-label">{t('player.av.blank')}</span>
      </button>
      <button
        type="button"
        className={cn(
          'player-av__section-shortcut',
          screenState === 'blackout' && 'player-av__section-shortcut--active',
        )}
        aria-keyshortcuts={AV_BLACKOUT_SHORTCUT_KEY}
        aria-label={t('player.av.blackoutToggle')}
        aria-pressed={screenState === 'blackout'}
        onClick={onToggleBlackout}
      >
        <kbd className="player-av__section-shortcut-key">{AV_BLACKOUT_SHORTCUT_KEY}</kbd>
        <span className="player-av__section-shortcut-label">{t('player.av.blackout')}</span>
      </button>
    </div>
  )
}

function SectionShortcutButton({
  shortcut,
  onJump,
}: {
  shortcut: AvSectionJumpShortcut
  onJump: (sectionTitle: string) => void
}) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className="player-av__section-shortcut"
      aria-keyshortcuts={shortcut.key}
      aria-label={t('player.av.sectionJump', {
        section: shortcut.sectionTitle,
        key: shortcut.key.toUpperCase(),
      })}
      onClick={() => onJump(shortcut.sectionTitle)}
    >
      <kbd className="player-av__section-shortcut-key">{shortcut.key.toUpperCase()}</kbd>
      <span className="player-av__section-shortcut-label">{shortcut.sectionTitle}</span>
    </button>
  )
}
