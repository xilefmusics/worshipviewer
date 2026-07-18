import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { writeHideChordsPreference } from '@/lib/hide-chords-preference'
import {
  type PlayerRoomJoinModeChoice,
  playerRoomJoinModeChoiceToWire,
} from '@/lib/player-room-join-mode'
import { cn } from '@/lib/utils'

const MODE_CHOICES: PlayerRoomJoinModeChoice[] = ['chords', 'text', 'av', 'slide']

type PlayerRoomJoinSheetProps = {
  sheetId: string
  title: string
  avOccupied: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoin: (choice: PlayerRoomJoinModeChoice) => void | Promise<void>
  displayName?: string
  onDisplayNameChange?: (name: string) => void
  pending?: boolean
}

export function PlayerRoomJoinSheet({
  sheetId,
  title,
  avOccupied,
  open,
  onOpenChange,
  onJoin,
  displayName,
  onDisplayNameChange,
  pending = false,
}: PlayerRoomJoinSheetProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const [selectedMode, setSelectedMode] = useState<PlayerRoomJoinModeChoice>('chords')
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)
  const descriptionId = `player-room-mode-description-${sheetId}`
  const requiresDisplayName = onDisplayNameChange != null
  const nameMissing = requiresDisplayName && !displayName?.trim()
  const joinDisabled = pending || nameMissing || (selectedMode === 'av' && avOccupied)

  const joinSelectedMode = () => {
    const { hideChords } = playerRoomJoinModeChoiceToWire(selectedMode)
    if (selectedMode === 'chords' || selectedMode === 'text') {
      writeHideChordsPreference(hideChords)
    }
    void onJoin(selectedMode)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setSelectedMode('chords')
        onOpenChange(next)
      }}
    >
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay forceMount asChild>
                <motion.div
                  className="fixed inset-0 z-50 bg-black/40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                />
              </Dialog.Overlay>
              <Dialog.Content forceMount asChild aria-describedby={descriptionId}>
                <motion.section
                  className={cn(
                    'fixed inset-x-0 bottom-0 z-50 grid w-full gap-4 rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
                  )}
                  initial={{ y: shouldReduceMotion ? 0 : '100%' }}
                  animate={isDragging ? { y: dragOffset } : { y: 0 }}
                  exit={{ y: shouldReduceMotion ? 0 : '100%' }}
                  transition={
                    isDragging
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }
                  }
                >
                  <div
                    className="mx-auto h-1.5 w-12 rounded-full bg-[var(--color-muted)]"
                    style={{ touchAction: 'none' }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId)
                      pointerStartY.current = event.clientY
                      setIsDragging(true)
                      setDragOffset(0)
                    }}
                    onPointerMove={(event) => {
                      if (!isDragging || pointerStartY.current === null) return
                      setDragOffset(Math.max(0, event.clientY - pointerStartY.current))
                    }}
                    onPointerUp={() => {
                      if (!isDragging) return
                      setIsDragging(false)
                      pointerStartY.current = null
                      if (dragOffset > 90) {
                        onOpenChange(false)
                        setDragOffset(0)
                        return
                      }
                      setDragOffset(0)
                    }}
                    onPointerCancel={() => {
                      setIsDragging(false)
                      pointerStartY.current = null
                      setDragOffset(0)
                    }}
                  />
                  <Dialog.Title className="text-lg font-semibold leading-none">{title}</Dialog.Title>
                  {requiresDisplayName ? (
                    <label className="grid gap-2">
                      <span className="text-sm">{t('playerRooms.displayName')}</span>
                      <Input
                        value={displayName ?? ''}
                        maxLength={80}
                        autoComplete="nickname"
                        onChange={(event) => onDisplayNameChange(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <div
                    role="tablist"
                    aria-label={t('playerRooms.modeChooserLabel')}
                    className="grid grid-cols-4 gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-[0.18rem]"
                  >
                    {MODE_CHOICES.map((mode) => {
                      const selected = selectedMode === mode
                      const disabled = mode === 'av' && avOccupied
                      return (
                        <button
                          key={mode}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          disabled={disabled}
                          title={disabled ? t('playerRooms.avOccupied') : undefined}
                          onClick={() => setSelectedMode(mode)}
                          className={cn(
                            'min-w-0 rounded-full px-1 py-2 text-xs font-medium transition-colors sm:text-sm',
                            selected
                              ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                              : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]',
                            disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                          )}
                        >
                          {t(`playerRooms.mode.${mode}`)}
                        </button>
                      )
                    })}
                  </div>
                  <p
                    id={descriptionId}
                    className="min-h-[2.75rem] text-sm text-[var(--color-muted-foreground)]"
                  >
                    {t(`playerRooms.modeDescription.${selectedMode}`)}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type="button"
                      disabled={joinDisabled}
                      title={selectedMode === 'av' && avOccupied ? t('playerRooms.avOccupied') : undefined}
                      onClick={joinSelectedMode}
                    >
                      {t('playerRooms.join')}
                    </Button>
                  </div>
                </motion.section>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
