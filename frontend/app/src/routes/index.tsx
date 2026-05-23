import { createFileRoute, redirect } from '@tanstack/react-router'

import { requireSession } from '@/lib/auth-guard'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    await requireSession(context)
    throw redirect({ to: '/collections' })
  },
  component: () => null,
})
