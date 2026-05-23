import { createFileRoute, redirect } from '@tanstack/react-router'

import { performLogout } from '@/lib/logout-queue'

export const Route = createFileRoute('/logout')({
  beforeLoad: async ({ context }) => {
    await performLogout(context.queryClient)
    throw redirect({ to: '/login', search: { return_to: undefined } })
  },
  component: () => null,
})
