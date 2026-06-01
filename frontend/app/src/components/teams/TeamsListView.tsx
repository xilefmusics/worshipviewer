import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

import type { Team } from '@/api/teams-sessions-fetch'
import { Button } from '@/components/ui/button'
import { CreateTeamDialog } from '@/components/teams/CreateTeamDialog'
import { useHubScrollContainerRef } from '@/context/HubScrollContainerContext'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useCoverImageSrc } from '@/hooks/useCoverImageSrc'
import { useSession } from '@/hooks/useSession'
import { useTeamsList } from '@/hooks/useTeamsList'
import { getTeamDisplayName } from '@/lib/team-display-name'
import { cn } from '@/lib/utils'

function TeamListAvatar({ cover, label }: { cover: string; label: string }) {
  const { src, onImageError } = useCoverImageSrc(cover)
  const initial = label.slice(0, 1).toUpperCase()

  return (
    <div
      className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-muted)] text-sm font-medium text-[var(--color-foreground)]"
      data-testid="team-list-avatar"
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none size-full object-cover"
          onError={onImageError}
        />
      ) : (
        initial
      )}
    </div>
  )
}

type TeamsListViewProps = {
  createIntent: boolean
  onConsumeCreateIntent: () => void
}

export function TeamsListView({ createIntent, onConsumeCreateIntent }: TeamsListViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { debouncedQ, setQInput } = useHubSearch()
  const { data: me } = useSession()
  const reduceMotion = useReducedMotion()
  const scrollRef = useHubScrollContainerRef()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useTeamsList()

  const items = useMemo(() => (data?.pages ?? []).flatMap((p) => p.items) as Team[], [data?.pages])

  useEffect(() => {
    if (!createIntent) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bridge from parent intent to dialog
    setCreateOpen(true)
    onConsumeCreateIntent()
  }, [createIntent, onConsumeCreateIntent])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { root, rootMargin: '120px' },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length, scrollRef])

  const openTeam = useCallback(
    (teamId: string) => {
      void navigate({ to: '/teams/$teamId', params: { teamId } })
    },
    [navigate],
  )

  const showSkeleton = isPending && !data
  const total = data?.pages[0]?.total
  const loaded = useMemo(
    () => (data?.pages ?? []).reduce((a, p) => a + p.items.length, 0),
    [data?.pages],
  )

  return (
    <>
      <div className="flex w-full min-w-0 flex-col">
        <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">
          {t('teams.listTitle')}
        </h1>
        {total !== undefined && loaded > 0 ? (
          <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">
            {t('teams.listMeta', { count: loaded, total })}
          </p>
        ) : (
          <p className="mb-3 h-4" />
        )}

        {error ? (
          <motion.div
            className="flex flex-col items-center gap-3 py-12 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <p className="text-sm text-[var(--color-muted-foreground)]">{t('hub.error.body')}</p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              {t('hub.error.retry')}
            </Button>
          </motion.div>
        ) : null}

        {showSkeleton ? (
          <div className="flex flex-col gap-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 border-b border-[var(--color-border)] py-3">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-[var(--color-muted)]" />
                <div className="flex flex-1 flex-col gap-2 py-1">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--color-muted)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-muted)]" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!error && !showSkeleton && items.length === 0 ? (
          <motion.div
            className="flex flex-col items-center gap-3 py-16 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {debouncedQ.trim() ? (
              <>
                <p className="text-sm text-[var(--color-muted-foreground)]">{t('hub.empty.noResults')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setQInput('')}>
                  {t('hub.empty.clearSearch')}
                </Button>
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">{t('teams.empty')}</p>
            )}
          </motion.div>
        ) : null}

        {!error && !showSkeleton && items.length > 0 ? (
          <ul className="flex flex-col pb-4">
            {items.map((team) => {
              const label = getTeamDisplayName(team, me?.id, t)
              return (
                <li key={team.id} className="border-b border-[var(--color-border)] last:border-0">
                  <button
                    type="button"
                    onClick={() => openTeam(team.id)}
                    className={cn(
                      'flex w-full min-w-0 items-start gap-3 py-3 text-left transition-transform',
                      'active:scale-[0.985] motion-reduce:transform-none',
                    )}
                  >
                    <TeamListAvatar cover={team.cover ?? ''} label={label} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--color-foreground)]">{label}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {t('teams.memberCount', { count: team.members.length })}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        <div ref={sentinelRef} className="h-1 w-full shrink-0" aria-hidden />

        {hasNextPage && !isFetchingNextPage && items.length > 0 ? (
          <div className="flex justify-center pb-4">
            <Button type="button" variant="outline" size="sm" onClick={() => void fetchNextPage()}>
              {t('hub.loadMore')}
            </Button>
          </div>
        ) : null}
        {isFetchingNextPage ? (
          <p className="pb-4 text-center text-xs text-[var(--color-muted-foreground)]">
            {t('common.load')}
          </p>
        ) : null}
      </div>

      <CreateTeamDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false)
          openTeam(id)
        }}
      />
    </>
  )
}
