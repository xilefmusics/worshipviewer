import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import {
  fetchImpersonationStatus,
  IMPERSONATION_QUERY_KEY,
  stopImpersonation,
} from '@/api/impersonation'
import { Button } from '@/components/ui/button'

export function ImpersonationBanner() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: IMPERSONATION_QUERY_KEY,
    queryFn: fetchImpersonationStatus,
    staleTime: 30_000,
    networkMode: 'always',
  })
  const stop = useMutation({
    mutationFn: () => stopImpersonation(queryClient),
    onSuccess: () => {
      window.location.assign('/collections')
    },
  })

  if (!status.data?.active || !status.data.subject) return null

  return (
    <div
      className="flex w-full items-center justify-between gap-2 border-b border-[var(--color-primary-foreground)]/20 bg-[var(--color-primary)] px-3 py-1.5 text-xs text-[var(--color-primary-foreground)]"
      role="alert"
    >
      <p className="min-w-0 truncate">
        {t('impersonation.banner', { email: status.data.subject.email })}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 border-[var(--color-primary-foreground)]/40 bg-transparent px-2 text-xs text-inherit hover:bg-[var(--color-primary-foreground)]/10"
        disabled={stop.isPending}
        onClick={() => void stop.mutateAsync()}
      >
        {stop.isPending ? t('common.load') : t('impersonation.stop')}
      </Button>
    </div>
  )
}
