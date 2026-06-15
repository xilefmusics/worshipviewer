import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import type { Setlist } from '@/api/setlists-detail'
import type { Team } from '@/api/teams-sessions-fetch'
import { fetchTeamsPage } from '@/api/teams-sessions-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSession } from '@/hooks/useSession'
import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'
import { hubListRootKey } from '@/lib/hub-list-keys'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'
import { getNextPageIndex } from '@/lib/list-pagination'
import { getTeamDisplayName, isPersonalTeamName } from '@/lib/team-display-name'
import { canEditTeamLibrary } from '@/lib/team-permissions'
import { cn } from '@/lib/utils'

const LAST_OWNER_LS = 'wv.setlistCreate.lastOwnerTeamId'

function readLastOwnerFromLs(): string | null {
  const raw = safeGetItem(LAST_OWNER_LS, getLocalStorage())
  return raw && raw.trim() ? raw.trim() : null
}

function writeLastOwnerToLs(teamId: string) {
  safeSetItem(LAST_OWNER_LS, teamId, getLocalStorage())
}

type CreateSetlistDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (setlistId: string) => void
}

export function CreateSetlistDialog({ open, onOpenChange, onCreated }: CreateSetlistDialogProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const [title, setTitle] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)
  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'setlistCreate', ''] as const,
    initialPageParam: 0,
    enabled: open,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchTeamsPage(queryClient, { page, q: '', signal })
    },
    getNextPageParam: (_last, all) => getNextPageIndex(all),
  })

  const allTeams = useMemo(() => {
    const pages = teamsQ.data?.pages ?? []
    return pages.flatMap((p) => p.items) as Team[]
  }, [teamsQ.data?.pages])

  const writableTeams = useMemo(() => {
    if (!user?.id) return []
    return allTeams.filter((tm) => canEditTeamLibrary(tm, user.id))
  }, [allTeams, user])

  const showOwnerPicker = writableTeams.length > 1

  const [ownerPick, setOwnerPick] = useState<string | null>(null)

  const defaultOwnerId = useMemo(() => {
    if (!open || !user?.id) return ''
    if (writableTeams.length === 0 && !teamsQ.isFetched) return ''
    const last = readLastOwnerFromLs()
    if (last && writableTeams.some((t) => t.id === last)) return last
    const personal = writableTeams.find(
      (tm) => isPersonalTeamName(tm.name) && canEditTeamLibrary(tm, user.id),
    )
    return personal?.id ?? writableTeams[0]?.id ?? ''
  }, [open, teamsQ.isFetched, user, writableTeams])

  const ownerId = ownerPick ?? defaultOwnerId
  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim()
      if (!trimmed) throw new Error(t('setlists.create.titleRequired'))
      const body: { title: string; songs: []; owner?: string } = {
        title: trimmed,
        songs: [],
      }
      if (showOwnerPicker && ownerId) body.owner = ownerId
      const { data, response } = await api.POST('/api/v1/setlists', { body })
      if (!response.ok) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? t('setlists.create.failed'))
      }
      return data as Setlist
    },
    onSuccess: (setlist) => {
      if (showOwnerPicker && ownerId) writeLastOwnerToLs(ownerId)
      void queryClient.invalidateQueries({
        queryKey: [...hubListRootKey, 'setlists'],
      })
      setTitle('')
      setLocalError(null)
      onCreated(setlist.id)
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
          setTitle('')
          setOwnerPick(null)
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
                      if (!isDragging || pointerStartY.current === null) return
                      const nextOffset = Math.max(0, event.clientY - pointerStartY.current)
                      setDragOffset(nextOffset)
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
                  <div className="flex flex-col gap-2 text-center sm:text-left">
                    <Dialog.Title className="text-lg font-semibold leading-none">
                      {t('setlists.create.dialogTitle')}
                    </Dialog.Title>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {t('setlists.create.dialogDescription')}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="setlist-create-title" className="text-sm font-medium">
                      {t('setlists.create.titleLabel')}
                    </label>
                    <Input
                      id="setlist-create-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('setlists.create.titlePlaceholder')}
                      autoComplete="off"
                    />
                    {showOwnerPicker ? (
                      <div className="grid gap-1.5 text-sm font-medium">
                        <label htmlFor="setlist-create-owner">{t('setlists.create.teamLabel')}</label>
                        <Select value={ownerId} onValueChange={(v) => setOwnerPick(v)}>
                          <SelectTrigger id="setlist-create-owner" className="font-normal">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {writableTeams.map((tm) => (
                              <SelectItem key={tm.id} value={tm.id}>
                                {getTeamDisplayName(tm, user?.id, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
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
                      {mutation.isPending ? t('common.load') : t('setlists.create.submit')}
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
