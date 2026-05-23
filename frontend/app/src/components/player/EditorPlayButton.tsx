import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { runEditorPlay } from '@/lib/player/editor-play'
import { readPlayerDefaultMode } from '@/lib/player/player-mode-preference'
import { buildPlayerSearch, type PlayerEntityType } from '@/lib/player-route'
import { cn } from '@/lib/utils'

type EditorPlayButtonProps = {
  entityType: PlayerEntityType
  entityId: string
  canPlay: boolean
  needsFlush: boolean
  flushNow: () => Promise<boolean>
  disabled?: boolean
  disabledAriaLabel?: string
  className?: string
}

export function EditorPlayButton({
  entityType,
  entityId,
  canPlay,
  needsFlush,
  flushNow,
  disabled,
  disabledAriaLabel,
  className,
}: EditorPlayButtonProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('shrink-0', className)}
      disabled={disabled || !canPlay}
      aria-label={disabled && disabledAriaLabel ? disabledAriaLabel : t('hub.actions.play')}
      onClick={() =>
        void runEditorPlay({
          canPlay,
          needsFlush,
          flushNow,
          navigate: () => {
            void navigate({
              to: '/player',
              search: buildPlayerSearch(
                entityType,
                entityId,
                undefined,
                readPlayerDefaultMode(),
              ),
            })
          },
        })
      }
    >
      {t('hub.actions.play')}
    </Button>
  )
}
