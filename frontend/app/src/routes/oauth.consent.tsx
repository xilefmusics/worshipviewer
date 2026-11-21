import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchSessionUser, SESSION_QUERY_KEY } from '@/api/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type ConsentRequest = {
  client_id: string
  client_name: string
  scope: string
}

export const Route = createFileRoute('/oauth/consent')({
  validateSearch: (search: Record<string, unknown>) => ({
    request_id: typeof search.request_id === 'string' ? search.request_id : '',
  }),
  beforeLoad: async ({ context, search }) => {
    if (!search.request_id) throw redirect({ to: '/' })
    const user = await context.queryClient.ensureQueryData({
      queryKey: SESSION_QUERY_KEY,
      queryFn: fetchSessionUser,
    })
    if (!user) {
      throw redirect({
        to: '/login',
        search: { return_to: `/oauth/consent?request_id=${encodeURIComponent(search.request_id)}` },
      })
    }
  },
  component: McpConsentPage,
})

function McpConsentPage() {
  const { t } = useTranslation()
  const { request_id: requestId } = Route.useSearch()
  const [consent, setConsent] = useState<ConsentRequest | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let active = true
    void fetch(`/api/v1/mcp/oauth/requests/${encodeURIComponent(requestId)}`, {
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the authorization request')
        return (await response.json()) as ConsentRequest
      })
      .then((value) => {
        if (active) setConsent(value)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [requestId])

  async function decide(allow: boolean) {
    setPending(true)
    setActionError(false)
    try {
      const response = await fetch(`/api/v1/mcp/oauth/requests/${encodeURIComponent(requestId)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allow }),
      })
      if (!response.ok) throw new Error('Could not complete consent')
      const result = (await response.json()) as { redirect_to: string }
      globalThis.location.assign(result.redirect_to)
    } catch {
      setActionError(true)
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t('oauthConsent.title')}</CardTitle>
          <CardDescription>{t('oauthConsent.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {loadError ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {t('oauthConsent.loadFailed')}
            </p>
          ) : consent ? (
            <div className="rounded-md border border-[var(--color-border)] p-4">
              <p className="font-medium">{consent.client_name}</p>
              <p className="mt-1 break-all text-xs text-[var(--color-muted-foreground)]">
                {consent.client_id}
              </p>
              <p className="mt-4 text-sm">{t('oauthConsent.access', { scope: consent.scope })}</p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">{t('common.load')}</p>
          )}
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('oauthConsent.readOnly')}
          </p>
          {actionError ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {t('oauthConsent.actionFailed')}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending || !consent} onClick={() => void decide(false)}>
              {t('oauthConsent.deny')}
            </Button>
            <Button type="button" disabled={pending || !consent} onClick={() => void decide(true)}>
              {t('oauthConsent.allow')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
