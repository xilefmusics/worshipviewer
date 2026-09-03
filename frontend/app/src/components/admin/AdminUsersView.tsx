import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ADMIN_USERS_PAGE_SIZE,
  fetchAdminUsersPage,
  type AdminUser,
} from '@/api/admin-users'
import {
  fetchImpersonationStatus,
  IMPERSONATION_QUERY_KEY,
  startImpersonation,
} from '@/api/impersonation'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import { clearAllLocalData } from '@/lib/clear-local'

function formatCreatedAt(value: string, language: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date)
}

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2.5 py-1 text-xs font-medium text-[var(--color-foreground)]">
      {t(`adminUsers.roles.${role}`)}
    </span>
  )
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t('adminUsers.actionsAria', { email: user.email })}
        >
          <span aria-hidden="true">•••</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!canImpersonate} onSelect={onImpersonate}>
          {t('adminUsers.impersonate')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UsersTable({ users }: { users: AdminUser[] }) {
  const { t, i18n } = useTranslation()
  const online = useOnline()
  const queryClient = useQueryClient()
  const capability = useQuery({
    queryKey: IMPERSONATION_QUERY_KEY,
    queryFn: fetchImpersonationStatus,
    staleTime: 30_000,
    networkMode: 'always',
  })
  const canImpersonate = online && capability.data?.enabled === true
  const [target, setTarget] = useState<AdminUser | null>(null)
  const impersonate = useMutation({
    mutationFn: (user: AdminUser) => startImpersonation(user.id),
    onSuccess: async () => {
      await clearAllLocalData(queryClient)
      window.location.assign('/collections')
    },
  })

  function start(user: AdminUser) {
    setTarget(user)
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              <th className="px-5 py-3 font-medium">{t('adminUsers.columns.email')}</th>
              <th className="px-5 py-3 font-medium">{t('adminUsers.columns.id')}</th>
              <th className="px-5 py-3 font-medium">{t('adminUsers.columns.role')}</th>
              <th className="px-5 py-3 font-medium">{t('adminUsers.columns.created')}</th>
              <th className="px-5 py-3 font-medium">{t('adminUsers.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="max-w-72 truncate px-5 py-4 font-medium">{user.email}</td>
                <td className="max-w-72 truncate px-5 py-4 font-mono text-xs text-[var(--color-muted-foreground)]" title={user.id}>{user.id}</td>
                <td className="px-5 py-4"><RoleBadge role={user.role} /></td>
                <td className="whitespace-nowrap px-5 py-4 text-[var(--color-muted-foreground)]">
                  <time dateTime={user.created_at}>{formatCreatedAt(user.created_at, i18n.language)}</time>
                </td>
                <td className="px-5 py-4">
                  <UserActionsMenu user={user} canImpersonate={canImpersonate} onImpersonate={() => start(user)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-[var(--color-border)] md:hidden">
        {users.map((user) => (
          <li key={user.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-all font-medium">{user.email}</p>
              <RoleBadge role={user.role} />
            </div>
            <dl className="grid gap-2 text-xs">
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                <dt className="text-[var(--color-muted-foreground)]">{t('adminUsers.columns.id')}</dt>
                <dd className="break-all font-mono">{user.id}</dd>
              </div>
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                <dt className="text-[var(--color-muted-foreground)]">{t('adminUsers.columns.created')}</dt>
                <dd><time dateTime={user.created_at}>{formatCreatedAt(user.created_at, i18n.language)}</time></dd>
              </div>
            </dl>
            <UserActionsMenu user={user} canImpersonate={canImpersonate} onImpersonate={() => start(user)} />
          </li>
        ))}
      </ul>
      <AlertDialog open={target !== null} onOpenChange={(open) => { if (!open) setTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('adminUsers.impersonateTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('adminUsers.impersonateBody', { email: target?.email ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              disabled={!target || impersonate.isPending || !canImpersonate}
              onClick={() => { if (target) void impersonate.mutateAsync(target) }}
            >
              {impersonate.isPending ? t('common.load') : t('adminUsers.impersonateConfirm')}
            </Button>
          </AlertDialogFooter>
          {impersonate.isError ? (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {(impersonate.error as Error).message || t('adminUsers.impersonateFailed')}
            </p>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function AdminUsersPage({ q, onClearSearch }: { q: string; onClearSearch: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)

  const query = useQuery({
    queryKey: ['admin-users', page, q] as const,
    queryFn: ({ signal }) => fetchAdminUsersPage(queryClient, { page, q, signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const items = query.data?.items ?? []
  const total = query.data?.total
  const firstItem = items.length > 0 ? page * ADMIN_USERS_PAGE_SIZE + 1 : 0
  const lastItem = page * ADMIN_USERS_PAGE_SIZE + items.length
  const hasNext = total === undefined ? items.length === ADMIN_USERS_PAGE_SIZE : lastItem < total

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-2 p-5">
        <CardTitle>{t('adminUsers.title')}</CardTitle>
        <CardDescription>{t('adminUsers.description')}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {query.isError ? (
          <div className="flex flex-col items-center gap-3 border-t border-[var(--color-border)] px-6 py-12 text-center" role="alert">
            <p className="font-medium">{t('adminUsers.errorTitle')}</p>
            <p className="text-sm text-[var(--color-muted-foreground)]">{(query.error as Error).message || t('adminUsers.errorBody')}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>{t('adminUsers.retry')}</Button>
          </div>
        ) : query.isPending ? (
          <p className="border-t border-[var(--color-border)] px-6 py-12 text-center text-sm text-[var(--color-muted-foreground)]" role="status">{t('adminUsers.loading')}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 border-t border-[var(--color-border)] px-6 py-12 text-center">
            <p className="font-medium">{q.trim() ? t('adminUsers.noResultsTitle') : t('adminUsers.emptyTitle')}</p>
            <p className="text-sm text-[var(--color-muted-foreground)]">{q.trim() ? t('adminUsers.noResultsBody') : t('adminUsers.emptyBody')}</p>
            {q.trim() ? <Button variant="outline" onClick={onClearSearch}>{t('adminUsers.clearSearch')}</Button> : null}
          </div>
        ) : (
          <UsersTable users={items} />
        )}

        {!query.isError && !query.isPending && items.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--color-muted-foreground)]" aria-live="polite">
              {total === undefined
                ? t('adminUsers.pagination.rangeUnknown', { first: firstItem, last: lastItem })
                : t('adminUsers.pagination.range', { first: firstItem, last: lastItem, total })}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>{t('adminUsers.pagination.previous')}</Button>
              <Button variant="outline" disabled={!hasNext || query.isFetching} onClick={() => setPage((value) => value + 1)}>{t('adminUsers.pagination.next')}</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function AdminUsersView() {
  const { debouncedQ, setQInput } = useHubSearch()
  return (
    <AdminUsersPage
      key={debouncedQ}
      q={debouncedQ}
      onClearSearch={() => setQInput('')}
    />
  )
}
