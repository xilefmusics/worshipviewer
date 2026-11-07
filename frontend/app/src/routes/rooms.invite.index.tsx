import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/rooms/invite/')({ component: RoomInviteRoute })

function RoomInviteRoute() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{t('rooms.title')}</h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">{t('rooms.signInToJoin')}</p>
      <Button asChild><Link to="/login" search={{ return_to: '/rooms' }}>{t('login.cardTitle')}</Link></Button>
    </main>
  )
}
