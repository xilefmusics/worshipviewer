import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import type { SessionBody } from '@/api/teams-sessions-fetch'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useHubScrollContainerRef } from '@/context/HubScrollContainerContext'
import { useCurrentSessionCredential } from '@/hooks/useCurrentSessionCredential'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import { useSessionsList } from '@/hooks/useSessionsList'
import { useSessionsMetrics } from '@/hooks/useSessionsMetrics'
import { readSsoSessionIdFromDocumentCookie } from '@/lib/sso-session-cookie'
import { sessionMetricsKey, sessionsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

export function SessionsListView() {
  const { t } = useTranslation()
  const online = useOnline()
  const { debouncedQ, setQInput } = useHubSearch()
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion()
  const scrollRef = useHubScrollContainerRef()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const {
    data,
    error,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useSessionsList()

  const { data: currentFromApi, isSuccess: currentFromApiSucceeded } =
    useCurrentSessionCredential()

  const items = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.items) as SessionBody[],
    [data?.pages],
  )

  const sessionIds = useMemo(() => items.map((s) => s.id), [items])
  const metricsBySessionId = useSessionsMetrics(sessionIds)

  const cookieSessionId = useMemo(() => readSsoSessionIdFromDocumentCookie(), [])
  const resolvedCurrentSessionId =
    cookieSessionId ?? currentFromApi?.id ?? null
  /** HttpOnly disclaimer only when neither cookie nor `/sessions/current` gives an id */
  const showCurrentUnknownHint =
    !cookieSessionId &&
    items.length > 0 &&
    currentFromApiSucceeded &&
    resolvedCurrentSessionId === null

  const [revokeTarget, setRevokeTarget] = useState<SessionBody | null>(null)

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/users/me/sessions/{id}', {
        params: { path: { id } },
      })
      if (!response.ok && response.status !== 204) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? t('sessions.revokeFailed'))
      }
    },
    onSuccess: (_data, revokedId) => {
      void queryClient.invalidateQueries({ queryKey: sessionsListRootKey })
      queryClient.removeQueries({ queryKey: sessionMetricsKey(revokedId) })
      setRevokeTarget(null)
    },
  })

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

  const showSkeleton = isPending && !data
  const errorText =
    error instanceof Error && error.message.trim() ? error.message : t('hub.error.body')

  return (
    <>
      <div className="flex w-full min-w-0 flex-col">
        <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">
          {t('sessions.listTitle')}
        </h1>
        <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">{t('sessions.listDescription')}</p>
        {!error && !showSkeleton && showCurrentUnknownHint ? (
          <p className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/35 px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
            {t('sessions.currentUnknownHint')}
          </p>
        ) : null}

        {error ? (
          <motion.div
            className="flex flex-col items-center gap-3 py-12 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <p className="text-sm text-[var(--color-muted-foreground)]">{errorText}</p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              {t('hub.error.retry')}
            </Button>
          </motion.div>
        ) : null}

        {showSkeleton ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--color-muted)]" />
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
            ) : !online ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">{t('hub.empty.offlineNone')}</p>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">{t('sessions.empty')}</p>
            )}
          </motion.div>
        ) : null}

        {!error && !showSkeleton && items.length > 0 ? (
          <ul className="flex flex-col gap-0 pb-4">
            {items.map((s) => {
              const isThisDevice =
                resolvedCurrentSessionId !== null && s.id === resolvedCurrentSessionId
              const metricSlot = metricsBySessionId[s.id]
              return (
              <li
                key={s.id}
                className={cn(
                  'flex flex-col gap-2 border-b border-[var(--color-border)] py-3 sm:flex-row sm:items-center sm:justify-between',
                  isThisDevice && 'rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/6 -mx-1 px-1',
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs text-[var(--color-muted-foreground)]">{s.id}</p>
                    {isThisDevice ? (
                      <span className="inline-flex items-center rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-primary-foreground)]">
                        {t('sessions.thisDevice')}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-[var(--color-foreground)]">
                    {t('sessions.rowMeta', {
                      start: new Date(s.created_at).toLocaleString(),
                      end: new Date(s.expires_at).toLocaleString(),
                    })}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {metricSlot?.isPending ? (
                      t('common.load')
                    ) : metricSlot?.isError ? (
                      t('sessions.lastUsedUnavailable')
                    ) : metricSlot?.metrics?.last_used_at ? (
                      t('sessions.lastUsed', {
                        when: new Date(metricSlot.metrics.last_used_at).toLocaleString(),
                      })
                    ) : (
                      t('sessions.lastUsedNever')
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start sm:self-center"
                  disabled={!online}
                  title={!online ? t('hub.createOfflineHint') : undefined}
                  onClick={() => setRevokeTarget(s)}
                >
                  {t('sessions.revoke')}
                </Button>
              </li>
            )})}
          </ul>
        ) : null}

        <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
        {hasNextPage && !isFetchingNextPage && items.length > 0 ? (
          <div className="flex justify-center pb-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!online}
              title={!online ? t('hub.createOfflineHint') : undefined}
              onClick={() => void fetchNextPage()}
            >
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

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sessions.revokeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('sessions.revokeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('hub.delete.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="default"
              className="bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:opacity-90"
              disabled={deleteSession.isPending || !online}
              title={!online ? t('hub.createOfflineHint') : undefined}
              onClick={() => {
                if (!revokeTarget) return
                void deleteSession.mutateAsync(revokeTarget.id)
              }}
            >
              {deleteSession.isPending ? t('common.load') : t('sessions.revokeConfirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
