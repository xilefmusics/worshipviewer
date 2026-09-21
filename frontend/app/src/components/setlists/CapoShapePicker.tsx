import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover'
import { CAPO_SHAPE_KEYS, capoFretForKeys, type CapoShapeKey } from '@/lib/player/capo'

type CapoShapePickerProps = {
  soundingKey: string
  selectedShape: CapoShapeKey | null
  canEditUi: boolean
  blockingAll: boolean
  onChange: (shapeKey: CapoShapeKey | null) => void
}

export function CapoShapePicker({
  soundingKey,
  selectedShape,
  canEditUi,
  blockingAll,
  onChange,
}: CapoShapePickerProps) {
  const { t } = useTranslation()
  const selectedFret = capoFretForKeys(soundingKey, selectedShape)

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-full min-w-0 justify-start px-2 text-xs"
          disabled={!canEditUi || blockingAll}
        >
          <span className="truncate">
            {t('setlists.editor.capoChip', {
              shape: selectedShape != null && selectedFret != null ? `${selectedShape} (${selectedFret})` : '—',
            })}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">
          {t('player.capo.title')}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mb-1 w-full"
          disabled={selectedShape == null}
          onClick={() => onChange(null)}
        >
          {t('player.capo.reset')}
        </Button>
        <div className="grid grid-cols-2 gap-1">
          {CAPO_SHAPE_KEYS.map((shapeKey) => {
            const fret = capoFretForKeys(soundingKey, shapeKey)
            return (
              <Button
                key={shapeKey}
                type="button"
                size="sm"
                variant={selectedShape === shapeKey ? 'default' : 'outline'}
                className="min-w-[7rem]"
                aria-label={t('player.capo.playIn', { key: shapeKey, fret })}
                onClick={() => onChange(shapeKey)}
              >
                {t('player.capo.shape', { key: shapeKey, fret })}
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}
