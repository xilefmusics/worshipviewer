import { createFileRoute, redirect } from '@tanstack/react-router'

import { AdminDashboardView } from '@/components/admin/AdminDashboardView'
import { requireAdminSession } from '@/lib/auth-guard'
import {
  formatAdminDateInputValue,
  resolveAdminDateRangeFromStrings,
  resolveAdminQuickRange,
} from '@/lib/admin-dashboard'

function defaultAdminRange(): { start: string; end: string } {
  const range = resolveAdminQuickRange('30d')
  return {
    start: formatAdminDateInputValue(range.start),
    end: formatAdminDateInputValue(range.end),
  }
}

function normalizeDateSearch(start: string, end: string): { start: string; end: string } | null {
  const parsed = resolveAdminDateRangeFromStrings(start, end)
  if (!parsed) return null
  const ordered =
    parsed.start.getTime() <= parsed.end.getTime()
      ? parsed
      : { start: parsed.end, end: parsed.start }
  return {
    start: formatAdminDateInputValue(ordered.start),
    end: formatAdminDateInputValue(ordered.end),
  }
}

export const Route = createFileRoute('/_hub/admin')({
  beforeLoad: async ({ context, search }) => {
    await requireAdminSession(context)

    if (typeof search.start !== 'string' || typeof search.end !== 'string') {
      throw redirect({
        to: '/admin',
        search: defaultAdminRange(),
        replace: true,
      })
    }

    const normalized = normalizeDateSearch(search.start, search.end)
    if (!normalized) {
      throw redirect({
        to: '/admin',
        search: defaultAdminRange(),
        replace: true,
      })
    }

    if (normalized.start !== search.start || normalized.end !== search.end) {
      throw redirect({
        to: '/admin',
        search: normalized,
        replace: true,
      })
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    start: typeof search.start === 'string' ? search.start : undefined,
    end: typeof search.end === 'string' ? search.end : undefined,
  }),
  component: AdminRoute,
})

function AdminRoute() {
  const { start, end } = Route.useSearch()

  if (!start || !end) return null

  return <AdminDashboardView startDate={start} endDate={end} />
}
