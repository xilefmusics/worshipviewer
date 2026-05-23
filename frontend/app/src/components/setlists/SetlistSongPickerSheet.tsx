import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useQueries, useQueryClient } from '@tanstack/react-query'

import { fetchTeamDetail } from '@/api/teams-sessions-fetch'

import type { Song } from '@/hooks/useSongPickerQuery'
import { useSongPickerQuery } from '@/hooks/useSongPickerQuery'
import { useSession } from '@/hooks/useSession'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resolveSongDataKey } from '@/lib/setlist-song-links'
import { formattedTimeSignature, normalizedTempoBpm } from '@/lib/song-display-meta'
import { getTeamDisplayName } from '@/lib/team-display-name'
import { teamDetailKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

const EMPTY_SONG_ITEMS: Song[] = []

type SetlistSongPickerSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  duplicateCountFor: (songId: string) => number
  blockedAdd?: boolean
  onPickSong: (song: Song) => void
  sheetTitleKey?: string
  searchPlaceholderKey?: string
  searchAriaKey?: string
  duplicateBadgeKey?: string
  pickerExcludedKey?: string
  waitForSaveKey?: string
}

export function SetlistSongPickerSheet({
  open,
  onOpenChange,
  duplicateCountFor,
  blockedAdd,
  onPickSong,
  sheetTitleKey = 'setlists.editor.addSongTitle',
  searchPlaceholderKey = 'setlists.editor.pickerSearchPlaceholder',
  searchAriaKey = 'setlists.editor.pickerSearchAria',
  duplicateBadgeKey = 'setlists.editor.duplicateBadge',
  pickerExcludedKey = 'setlists.editor.pickerExcluded',
  waitForSaveKey = 'setlists.editor.waitForSave',
}: SetlistSongPickerSheetProps) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const queryClient = useQueryClient()
  const shouldReduceMotion = useReducedMotion()
  const [q, setQ] = useState('')
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)
  const { data, isPending, error } = useSongPickerQuery(q)

  const items = data?.items ?? EMPTY_SONG_ITEMS

  const pickerOwnerIds = useMemo(() => {
    const ids = new Set<string>()
    for (const song of items) {
      if (song.owner) ids.add(song.owner)
    }
    return [...ids]
  }, [items])

  const pickerTeamQueries = useQueries({
    queries: pickerOwnerIds.map((ownerId) => ({
      queryKey: teamDetailKey(ownerId),
      enabled: open && Boolean(ownerId),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchTeamDetail(queryClient, { id: ownerId, signal }),
      staleTime: 5 * 60_000,
    })),
  })

  function tryInsert(song: Song) {
    if (blockedAdd) return
    if (song.not_a_song) {
      toast.error(t(pickerExcludedKey))
      return
    }
    onPickSong(song)
    setQ('')
    onOpenChange(false)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQ('')
      }}
    >
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay forceMount asChild>
                <motion.div
                  className="fixed inset-0 z-[60] bg-black/40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                />
              </Dialog.Overlay>
              <Dialog.Content forceMount asChild>
                <motion.div
                  className={cn(
                    'fixed inset-x-0 bottom-0 z-[61] flex max-h-[min(32rem,88dvh)] w-full flex-col gap-3 rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
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
                    className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-[var(--color-muted)]"
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
                  <Dialog.Title className="text-base font-semibold">{t(sheetTitleKey)}</Dialog.Title>
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t(searchPlaceholderKey)}
                    aria-label={t(searchAriaKey)}
                    autoComplete="off"
                  />
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {error ? (
                      <p className="text-sm text-[var(--color-destructive)]" role="alert">
                        {String((error as Error).message)}
                      </p>
                    ) : null}
                    {isPending && !items.length ? (
                      <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                        {t('common.load')}
                      </p>
                    ) : null}
                    <ul className="flex flex-col gap-1 pb-6">
                      {items.map((song) => {
                        const dup = duplicateCountFor(song.id)
                        let pickerTeamLine: string | null | undefined
                        if (song.owner) {
                          const oi = pickerOwnerIds.indexOf(song.owner)
                          if (oi >= 0) {
                            const tq = pickerTeamQueries[oi]
                            if (tq?.isPending) pickerTeamLine = null
                            else if (tq?.data)
                              pickerTeamLine = getTeamDisplayName(tq.data, user?.id, t)
                            else pickerTeamLine = t('setlists.editor.teamUnavailable')
                          }
                        }

                        const songKey = resolveSongDataKey(song.data as Record<string, unknown>)
                        const bpm = normalizedTempoBpm(song.data.tempo)
                        const meter = formattedTimeSignature(song.data.time)
                        let tempoMeterLine: string | null = null
                        if (bpm != null && meter)
                          tempoMeterLine = t('setlists.editor.songTempoAndMeter', { bpm, meter })
                        else if (bpm != null) tempoMeterLine = t('setlists.editor.songTempoOnly', { bpm })
                        else if (meter) tempoMeterLine = t('setlists.editor.songMeterOnly', { meter })

                        return (
                          <li key={`${song.id}-${song.owner}`}>
                            <button
                              type="button"
                              disabled={blockedAdd}
                              title={blockedAdd ? t(waitForSaveKey) : undefined}
                              className={cn(
                                'flex w-full gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--color-muted)]',
                                blockedAdd && 'cursor-not-allowed opacity-55',
                              )}
                              onClick={() => tryInsert(song)}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 text-sm font-medium leading-snug">
                                  {(song.data.titles?.[0] ?? '—').trim() || '—'}
                                </span>
                                <span className="line-clamp-1 text-xs text-[var(--color-muted-foreground)]">
                                  {(song.data.artists ?? []).filter(Boolean).join(', ') || '—'}
                                </span>
                                {tempoMeterLine ? (
                                  <span className="mt-0.5 block truncate text-xs text-[var(--color-muted-foreground)]">
                                    {tempoMeterLine}
                                  </span>
                                ) : null}
                                {pickerTeamLine !== undefined ? (
                                  pickerTeamLine === null ? (
                                    <span
                                      className="mt-0.5 block h-3 w-28 max-w-full animate-pulse rounded bg-[var(--color-muted)]"
                                      aria-hidden
                                    />
                                  ) : pickerTeamLine ? (
                                    <span className="mt-0.5 block truncate text-xs text-[var(--color-muted-foreground)]">
                                      {pickerTeamLine}
                                    </span>
                                  ) : null
                                ) : null}
                                {dup > 1 ? (
                                  <span className="mt-0.5 text-[0.65rem] uppercase text-[var(--color-muted-foreground)]">
                                    {t(duplicateBadgeKey, { count: dup })}
                                  </span>
                                ) : null}
                              </span>
                              <span className="inline-flex max-w-[11rem] shrink-0 flex-col items-stretch justify-center self-stretch text-left">
                                <span
                                  className="inline-flex h-9 w-full items-center justify-start rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs font-normal shadow-sm"
                                >
                                  {t('setlists.editor.keyChip', { symbol: songKey ?? '—' })}
                                </span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      {t('teams.dialogCancel')}
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
