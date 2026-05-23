import { useTranslation } from 'react-i18next'

import './player-av.css'

type AvCurrentNextProps = {
  currentText: string
  nextText: string | null
}

export function AvCurrentNext({ currentText, nextText }: AvCurrentNextProps) {
  const { t } = useTranslation()

  return (
    <div className="av-current-next">
      <div className="av-current-next__panel">
        <div className="av-current-next__label">{t('player.av.current')}</div>
        <div className="av-current-next__text">{currentText || t('player.av.emptySlide')}</div>
      </div>
      <div className="av-current-next__panel">
        <div className="av-current-next__label">{t('player.av.next')}</div>
        <div className="av-current-next__text">
          {nextText?.trim() ? nextText : t('player.av.noNext')}
        </div>
      </div>
    </div>
  )
}
