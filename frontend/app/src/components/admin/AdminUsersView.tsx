import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  fetchAdminUsersPage,
  getAdminUsersNextPageParam,
  type AdminUser,
} from '@/api/admin-users'
import {
  fetchImpersonationStatus,
  IMPERSONATION_QUERY_KEY,
  startImpersonation,
} from '@/api/impersonation'
import { Button } from '@/components/ui/button'
import {
  HUB_ACTION_ICON_CLASS,
  HubActionItem,
  HubActionsDrawer,
} from '@/components/hub/HubActionsDrawer'
import { openHubActionsFromContextMenu } from '@/components/hub/hub-action-context-menu'
import {
  HUB_LIST_ROW_BORDER_CLASS,
  HUB_LIST_ROW_SHELL_CLASS,
  HUB_LIST_SUBTITLE_CLASS,
  HUB_LIST_TITLE_CLASS,
} from '@/components/hub/hub-list-styles'
import { UsersIcon } from '@/components/icons/lucide-animated/users-icon'
import { useHubScrollContainerRef } from '@/context/HubScrollContainerContext'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import { observeElementIntersection } from '@/lib/browser-apis'
import { clearAllLocalData } from '@/lib/clear-local'
import { cn } from '@/lib/utils'

function formatCreatedAt(value: string, language: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date)
}

function UserActionsMenu({
  user,
  canImpersonate,
  onImpersonate,
}: {
  user: AdminUser
  canImpersonate: boolean
  onImpersonate: () => void
}) {
  const { t } = useTranslation()
  const [itemHot, setItemHot] = useState(false)

  return (
    <HubActionsDrawer
      title={user.email}
      triggerAriaLabel={t('adminUsers.actionsAria', { email: user.email })}
    >
      <div role="group" aria-label={t('hub.actions.general')}>
        <div className="px-2 pb-1 text-xs font-semibold text-[var(--color-muted-foreground)]">
          {t('hub.actions.general')}
        </div>
        <HubActionItem
          disabled={!canImpersonate}
          onSelect={onImpersonate}
          onHoverChange={setItemHot}
        >
          <UsersIcon isHovered={itemHot} size={16} className={HUB_ACTION_ICON_CLASS} />
          {t('adminUsers.impersonate')}
        </HubActionItem>
      </div>
    </HubActionsDrawer>
  )
}

function UserRow({
  user,
  canImpersonate,
  onImpersonate,
}: {
  user: AdminUser
  canImpersonate: boolean
  onImpersonate: () => void
}) {
  const { t, i18n } = useTranslation()
  const roleLabel = t(`adminUsers.roles.${user.role}`)
  const createdLabel = formatCreatedAt(user.created_at, i18n.language)
  const subtitle = `${roleLabel} · ${createdLabel}`

  return (
    <div className={cn('flex items-center', HUB_LIST_ROW_BORDER_CLASS)} data-hub-resource>
      <div className={cn(HUB_LIST_ROW_SHELL_CLASS, 'min-w-0 flex-1 cursor-default')}>
        <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
          <p className={HUB_LIST_TITLE_CLASS} title={user.email}>
            {user.email}
          </p>
          <p className={cn(HUB_LIST_SUBTITLE_CLASS, 'truncate')} title={`${subtitle} · ${user.id}`}>
            {subtitle}
          </p>
        </div>
      </div>
      <UserActionsMenu user={user} canImpersonate={canImpersonate} onImpersonate={onImpersonate} />
    </div>
  )
}

export function AdminUsersView() {
  const { t } = useTranslation()
  const { debouncedQ, setQInput } = useHubSearch()
  const queryClient = useQueryClient()
  const online = useOnline()
  const reduceMotion = useReducedMotion()
  const scrollRef = useHubScrollContainerRef()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const query = useInfiniteQuery({
    queryKey: ['admin-users', debouncedQ] as const,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchAdminUsersPage(queryClient, { page: pageParam as number, q: debouncedQ, signal }),
    getNextPageParam: (lastPage, allPages) => getAdminUsersNextPageParam(lastPage, allPages),
    staleTime: 30_000,
  })

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.items),
    [query.data?.pages],
  )

  const capability = useQuery({
    queryKey: IMPERSONATION_QUERY_KEY,
    queryFn: fetchImpersonationStatus,
    staleTime: 30_000,
    networkMode: 'always',
  })
  const canImpersonate = online && capability.data?.enabled === true
  const impersonate = useMutation({
    mutationFn: (user: AdminUser) => startImpersonation(user.id),
    onSuccess: async () => {
      await clearAllLocalData(queryClient)
      window.location.assign('/collections')
    },
    onError: (error) => {
      toast.error((error as Error).message || t('adminUsers.impersonateFailed'))
    },
  })

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    return observeElementIntersection(
      sentinel,
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { root, rootMargin: '120px' },
    )
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length, scrollRef])

  const showSkeleton = query.isPending && !query.data
  const q = debouncedQ
  const fade = reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as const }

  return (
    <>
      <div className="flex w-full min-w-0 flex-col">
        {query.isError ? (
          <motion.div
            className="flex flex-col items-center gap-3 py-12 text-center"
            role="alert"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={fade}
          >
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {(query.error as Error).message || t('hub.error.body')}
            </p>
            <Button type="button" variant="outline" onClick={() => void query.refetch()}>
              {t('hub.error.retry')}
            </Button>
          </motion.div>
        ) : null}

        {!query.isError && showSkeleton ? (
          <div className="flex flex-col gap-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={cn(HUB_LIST_ROW_SHELL_CLASS, HUB_LIST_ROW_BORDER_CLASS)}>
                <div className="flex flex-1 flex-col gap-1.5 py-0.5">
                  <div className="h-[1.0625rem] w-2/3 animate-pulse rounded bg-[var(--color-muted)]" />
                  <div className="h-[0.9375rem] w-1/2 animate-pulse rounded bg-[var(--color-muted)]" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!query.isError && !showSkeleton && items.length === 0 ? (
          <motion.div
            className="flex flex-col items-center gap-3 py-16 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {q.trim() ? (
              <>
                <p className="font-medium">{t('adminUsers.noResultsTitle')}</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">{t('adminUsers.noResultsBody')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setQInput('')}>
                  {t('hub.empty.clearSearch')}
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium">{t('adminUsers.emptyTitle')}</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">{t('adminUsers.emptyBody')}</p>
              </>
            )}
          </motion.div>
        ) : null}

        {!query.isError && !showSkeleton && items.length > 0 ? (
          <div className="flex flex-col pb-4" onContextMenu={openHubActionsFromContextMenu}>
            {items.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                canImpersonate={canImpersonate && !impersonate.isPending}
                onImpersonate={() => {
                  if (!canImpersonate || impersonate.isPending) return
                  void impersonate.mutateAsync(user)
                }}
              />
            ))}
          </div>
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
          <p className="pb-4 text-center text-xs text-[var(--color-muted-foreground)]">{t('common.load')}</p>
        ) : null}
      </div>
    </>
  )
}
