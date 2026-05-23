import { createFileRoute, Link, useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/hooks/useSession'
import { requireSession } from '@/lib/auth-guard'
import { performLogout } from '@/lib/logout-queue'
import { Route as RootRoute } from '@/routes/__root'

export const Route = createFileRoute('/$')({
  beforeLoad: async ({ context }) => {
    await requireSession(context)
  },
  component: NotFoundPage,
})

function NotFoundPage() {
  const { t } = useTranslation()
  const { _splat } = useParams({ from: '/$' })
  const navigate = useNavigate()
  const { queryClient } = RootRoute.useRouteContext()
  const { isPending } = useSession()

  async function onLogout() {
    await performLogout(queryClient)
    void navigate({ to: '/login', search: { return_to: undefined } })
  }

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-[var(--color-muted-foreground)]">
        {t('common.load')}
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <span className="font-semibold text-[var(--color-primary)]">{t('app.name')}</span>
        <Button type="button" variant="outline" onClick={() => void onLogout()}>
          {t('notFound.signOut')}
        </Button>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t('notFound.title')}</CardTitle>
          <CardDescription>
            {t('notFound.body')} {_splat ? `(${_splat})` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild variant="default">
            <Link to="/collections">{t('notFound.home')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
