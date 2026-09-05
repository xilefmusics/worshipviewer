import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchCollectionsPage, fetchSetlistsPage } from '@/api/list-fetch'
import type { Team } from '@/api/teams-sessions-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOnline } from '@/hooks/use-online'
import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'
import { getNextPageIndex } from '@/lib/list-pagination'
import { createRoom, type RoomSourceType } from '@/lib/room'
import { getTeamDisplayName, isPersonalTeamName } from '@/lib/team-display-name'
import { cn } from '@/lib/utils'

const LAST_OWNER_LS = 'wv.roomCreate.lastOwnerTeamId'

function readLastOwnerFromLs(): string | null {
  const raw = safeGetItem(LAST_OWNER_LS, getLocalStorage())
  return raw && raw.trim() ? raw.trim() : null
}

function writeLastOwnerToLs(teamId: string) {
  safeSetItem(LAST_OWNER_LS, teamId, getLocalStorage())
}

export type RoomSource = {
  type: RoomSourceType
  id: string
  title: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  teams: Team[]
  userId: string | undefined
  onCreated: (roomId: string) => void
  source?: RoomSource | null
}

function sourceRoomName(source: RoomSource | null | undefined): string {
  return source?.title.trim().slice(0, 80) ?? ''
}

type RoomPoolType = Extract<RoomSourceType, 'collection' | 'setlist'>

function SongPoolPicker({
  open,
  online,
  poolType,
  poolId,
  onPoolTypeChange,
  onPoolIdChange,
}: {
  open: boolean
  online: boolean
  poolType: RoomPoolType | ''
  poolId: string
  onPoolTypeChange: (value: RoomPoolType | '') => void
  onPoolIdChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const poolQuery = useInfiniteQuery({
    queryKey: ['room-create-song-pool', poolType],
    initialPageParam: 0,
    enabled: open && online && Boolean(poolType),
    queryFn: async ({ pageParam, signal }) => {
      const args = { page: pageParam as number, q: '', signal }
      const page = poolType === 'collection'
        ? fetchCollectionsPage(queryClient, args)
        : fetchSetlistsPage(queryClient, args)
      const result = await page
      return {
        items: result.items.map((pool) => ({ id: pool.id, title: pool.title })),
        total: result.total,
      }
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isPending,
  } = poolQuery

  useEffect(() => {
    if (!open || !online || !poolType || !hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, online, open, poolType])

  const pools = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data?.pages],
  )

  return (
    <div className="grid gap-1.5 text-sm font-medium">
      <label htmlFor="room-create-song-pool-type">{t('rooms.songPool.typeLabel')}</label>
      <Select
        value={poolType}
        onValueChange={(value) => {
          if (value !== 'collection' && value !== 'setlist') return
          onPoolTypeChange(value)
          onPoolIdChange('')
        }}
      >
        <SelectTrigger id="room-create-song-pool-type" className="font-normal">
          <SelectValue placeholder={t('rooms.songPool.typePlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="collection">{t('rooms.songPool.collectionType')}</SelectItem>
          <SelectItem value="setlist">{t('rooms.songPool.setlistType')}</SelectItem>
        </SelectContent>
      </Select>
      <label htmlFor="room-create-song-pool">{t('rooms.songPool.sourceLabel')}</label>
      <Select
        value={poolId || undefined}
        onValueChange={onPoolIdChange}
        disabled={!poolType || isPending || isError}
      >
        <SelectTrigger id="room-create-song-pool" className="font-normal">
          <SelectValue placeholder={t('rooms.songPool.sourcePlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {pools.map((pool) => (
            <SelectItem key={pool.id} value={pool.id}>
              {pool.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending || isFetchingNextPage ? (
        <p className="text-xs font-normal text-[var(--color-muted-foreground)]">{t('common.load')}</p>
      ) : null}
      {isError ? (
        <p className="text-xs font-normal text-[var(--color-danger)]">{t('rooms.songPool.loadFailed')}</p>
      ) : null}
    </div>
  )
}

export function CreateRoomDialog({ open, onOpenChange, teams, userId, onCreated, source = null }: Props) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const online = useOnline()
  const [roomName, setRoomName] = useState(() => sourceRoomName(source))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)
  const showOwnerPicker = teams.length > 1
  const [ownerPick, setOwnerPick] = useState<string | null>(null)
  const [poolType, setPoolType] = useState<RoomPoolType | ''>('')
  const [poolId, setPoolId] = useState('')

  const defaultOwnerId = useMemo(() => {
    if (!open || !userId) return ''
    const last = readLastOwnerFromLs()
    if (last && teams.some((team) => team.id === last)) return last
    const personal = teams.find((team) => isPersonalTeamName(team.name))
    return personal?.id ?? teams[0]?.id ?? ''
  }, [open, teams, userId])

  const ownerId = showOwnerPicker
    ? ownerPick && teams.some((team) => team.id === ownerPick)
      ? ownerPick
      : defaultOwnerId
    : teams[0]?.id ?? ''

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setOwnerPick(null)
      setRoomName(sourceRoomName(source))
      setPending(false)
      setError(null)
      setDragOffset(0)
      setIsDragging(false)
      pointerStartY.current = null
      setPoolType('')
      setPoolId('')
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
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
                        handleOpenChange(false)
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
                      {t('rooms.createTitle')}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-[var(--color-muted-foreground)]">
                      {source
                        ? t('rooms.createFromDescription', {
                            type: t(`rooms.sourceType.${source.type}`),
                            title: source.title,
                          })
                        : t('rooms.createDescription')}
                    </Dialog.Description>
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="room-create-name" className="text-sm font-medium">
                      {t('rooms.nameLabel')}
                    </label>
                    <Input
                      id="room-create-name"
                      value={roomName}
                      onChange={(event) => setRoomName(event.target.value)}
                      placeholder={t('rooms.namePlaceholder')}
                      maxLength={80}
                      autoComplete="off"
                    />
                    {!source ? (
                      <SongPoolPicker
                        open={open}
                        online={online}
                        poolType={poolType}
                        poolId={poolId}
                        onPoolTypeChange={setPoolType}
                        onPoolIdChange={setPoolId}
                      />
                    ) : null}
                    {showOwnerPicker ? (
                      <div className="grid gap-1.5 text-sm font-medium">
                        <label htmlFor="room-create-team">{t('rooms.teamLabel')}</label>
                        <Select value={ownerId} onValueChange={(value) => setOwnerPick(value)}>
                          <SelectTrigger id="room-create-team" className="font-normal">
                            <SelectValue placeholder={t('rooms.teamPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.map((team) => (
                              <SelectItem key={team.id} value={team.id}>
                                {getTeamDisplayName(team, userId, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {error ? (
                      <p role="alert" className="text-sm text-[var(--color-danger)]">
                        {error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                      {t('teams.dialogCancel')}
                    </Button>
                    <Button
                      type="button"
                      disabled={!online || pending || !ownerId}
                      aria-busy={pending}
                      onClick={() => {
                        const trimmedName = roomName.trim()
                        if (!trimmedName) {
                          setError(t('rooms.nameRequired'))
                          return
                        }
                        if (!ownerId) return
                        setError(null)
                        setPending(true)
                        const selectedSource =
                          source ?? (poolType && poolId ? { type: poolType, id: poolId } : null)
                        void createRoom({
                          team_id: ownerId,
                          name: trimmedName,
                          ...(selectedSource
                            ? { source_type: selectedSource.type, source_id: selectedSource.id }
                            : {}),
                        })
                          .then((created) => {
                            if (showOwnerPicker) writeLastOwnerToLs(ownerId)
                            setPending(false)
                            onCreated(created.room.id)
                          })
                          .catch(() => {
                            setPending(false)
                            setError(t('rooms.createFailedAction'))
                          })
                      }}
                    >
                      {pending ? t('common.load') : t('rooms.createSubmit')}
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
