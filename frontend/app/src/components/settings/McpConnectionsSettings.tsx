import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type ConnectedGrant = {
  id: string
  client_id: string
  client_name: string
  scope: string
  created_at: string
}

const grantsKey = ['mcp-oauth-grants'] as const

async function fetchGrants(): Promise<ConnectedGrant[]> {
  const response = await fetch('/api/v1/mcp/oauth/grants', { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Could not load grants: ${response.status}`)
  return (await response.json()) as ConnectedGrant[]
}

export function McpConnectionsSettings() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const grants = useQuery({ queryKey: grantsKey, queryFn: fetchGrants })
  const revoke = useMutation({
    mutationFn: async (grantId: string) => {
      const response = await fetch(`/api/v1/mcp/oauth/grants/${encodeURIComponent(grantId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!response.ok && response.status !== 204) {
        throw new Error(`Could not revoke grant: ${response.status}`)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: grantsKey }),
  })

  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{t('settings.mcpConnections.title')}</CardTitle>
        <CardDescription>{t('settings.mcpConnections.description')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {grants.isPending ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('common.load')}</p>
        ) : grants.isError ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {t('settings.mcpConnections.loadFailed')}
          </p>
        ) : grants.data.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('settings.mcpConnections.empty')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {grants.data.map((grant) => (
              <li key={grant.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{grant.client_name}</p>
                  <p className="break-all text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.mcpConnections.scope', { scope: grant.scope })}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.mcpConnections.connected', {
                      date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                        new Date(grant.created_at),
                      ),
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(grant.id)}
                >
                  {t('settings.mcpConnections.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {revoke.isError ? (
          <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">
            {t('settings.mcpConnections.revokeFailed')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
