import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'

import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { problemMessageFromBody } from '@/api/problem'
import type { Team } from '@/api/teams-sessions-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

type CreateTeamDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (teamId: string) => void
}

export function CreateTeamDialog({ open, onOpenChange, onCreated }: CreateTeamDialogProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim()
      if (!trimmed) {
        throw new Error(t('teams.createNameRequired'))
      }
      const { data, error, response } = await api.POST('/api/v1/teams', {
        body: { name: trimmed, members: [] },
      })
      if (!response.ok) {
        throw new Error(problemMessageFromBody(error, t('teams.createFailed')))
      }
      return data as Team
    },
    onSuccess: (team) => {
      void queryClient.invalidateQueries({ queryKey: teamsListRootKey })
      setName('')
      setLocalError(null)
      onCreated(team.id)
    },
    onError: (e: Error) => {
      setLocalError(e.message)
    },
  })

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setLocalError(null)
          setName('')
        }
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
              <Dialog.Content forceMount asChild>
                <motion.div
                  className={cn(
                    'fixed inset-x-0 bottom-0 z-50 grid w-full gap-4 rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
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
              if (!isDragging || pointerStartY.current === null) {
                return
              }
              const nextOffset = Math.max(0, event.clientY - pointerStartY.current)
              setDragOffset(nextOffset)
            }}
            onPointerUp={() => {
              if (!isDragging) {
                return
              }
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
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <Dialog.Title className="text-lg font-semibold leading-none">
              {t('teams.createTitle')}
            </Dialog.Title>
            <p className="text-sm text-[var(--color-muted-foreground)]">{t('teams.createDescription')}</p>
          </div>
          <div className="grid gap-2">
            <label htmlFor="team-name" className="text-sm font-medium">
              {t('teams.createNameLabel')}
            </label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('teams.createNamePlaceholder')}
              autoComplete="off"
            />
            {localError ? (
              <p className="text-sm text-[var(--color-destructive)]" role="alert">
                {localError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('teams.dialogCancel')}
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setLocalError(null)
                void mutation.mutateAsync()
              }}
            >
              {mutation.isPending ? t('common.load') : t('teams.createSubmit')}
            </Button>
          </div>
                </motion.div>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
