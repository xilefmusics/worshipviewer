import { useTranslation } from 'react-i18next'

import type { AvOutlineRow } from '@/lib/player/av-lyric-slides'
import { cn } from '@/lib/utils'

import '../player-outline-list.css'
import './player-av.css'

type AvOutlinePanelProps = {
  rows: AvOutlineRow[]
  onSelectSlide: (slideIndex: number) => void
}

export function AvOutlinePanel({ rows, onSelectSlide }: AvOutlinePanelProps) {
  const { t } = useTranslation()

  if (rows.length === 0) {
    return null
  }

  return (
    <nav className="av-outline-panel" aria-label={t('player.av.outlineAria')}>
      <ul className="player-outline-list">
        {rows.map((row) => (
          <li key={`${row.slideIndex}-${row.label}`}>
            <button
              type="button"
              className={cn(
                'player-outline-list__item',
                row.selected && 'player-outline-list__item--selected',
                row.isSubSlide && 'player-outline-list__item--sub',
              )}
              aria-current={row.selected ? 'true' : undefined}
              onClick={() => onSelectSlide(row.slideIndex)}
            >
              {row.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
