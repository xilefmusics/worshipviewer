import { createFileRoute, Outlet } from '@tanstack/react-router'

import { requireSession } from '@/lib/auth-guard'

export const Route = createFileRoute('/player')({
  beforeLoad: async ({ context }) => {
    await requireSession(context)
  },
  component: PlayerLayout,
})

function PlayerLayout() {
  return <Outlet />
}
