import type { components } from '@/api/schema'

export type MonitoringMetricsDay = components['schemas']['MonitoringMetricsDay']

export type AdminMetricsRangeId = '7d' | '30d' | '90d' | 'mtd' | 'prev-month'

export type AdminDateRange = {
  start: Date
  end: Date
}

export type AdminMetricsPoint = {
  date: string
  label: string
  dau: number
  wau: number
  mau: number
}

export type AdminRequestMetricsPoint = {
  date: string
  label: string
  failed: number
  successful: number
  total: number
}

export type AdminRequestIntensityPoint = {
  date: string
  label: string
  avgPerUser: number
  medianPerUser: number
  p95PerUser: number
  maxPerUser: number
}

export type AdminUserMixPoint = {
  date: string
  label: string
  newUsers: number
  retainedUsers: number
  churnedUsers: number
  retentionRate: number
  churnRate: number
}

export type AdminLatencyPoint = {
  date: string
  label: string
  avg: number
  avgSuccess: number
  avgFailure: number
  p95: number
  p99: number
}

const ADMIN_METRICS_MAX_WINDOW_DAYS = 90

function toUtcDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function fromUtcDateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

function startOfUtcMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
}

function startOfUtcDay(value: Date): Date {
  return toUtcDate(value)
}

function endOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))
}

export function resolveAdminLatestSelectableDate(now = new Date()): Date {
  return startOfUtcDay(addUtcDays(toUtcDate(now), -1))
}

function formatUtcDateOnly(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10))
  if ([year, month, day].some((part) => Number.isNaN(part))) return null
  const parsed = fromUtcDateOnly(year, month - 1, day)
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }
  return parsed
}

function formatUtcDateLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function formatUtcMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function resolveAdminMetricsRange(range: AdminMetricsRangeId, now = new Date()) {
  const utcYesterday = resolveAdminLatestSelectableDate(now)
  switch (range) {
    case '7d':
      return { start: addUtcDays(utcYesterday, -6), end: endOfUtcDay(utcYesterday) }
    case '30d':
      return { start: addUtcDays(utcYesterday, -29), end: endOfUtcDay(utcYesterday) }
    case '90d':
      return { start: addUtcDays(utcYesterday, -89), end: endOfUtcDay(utcYesterday) }
    case 'mtd':
      return { start: startOfUtcMonth(now), end: endOfUtcDay(utcYesterday) }
    case 'prev-month': {
      const currentMonthStart = startOfUtcMonth(now)
      const start = new Date(
        Date.UTC(
          currentMonthStart.getUTCFullYear(),
          currentMonthStart.getUTCMonth() - 1,
          1,
        ),
      )
      const end = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth(), 0, 23, 59, 59, 999))
      return { start, end }
    }
    default:
      throw new Error(`Unsupported admin metrics range: ${range}`)
  }
}

export function resolveAdminDateRange(start: Date, end: Date, now = new Date()): AdminDateRange {
  const latestSelectableDate = resolveAdminLatestSelectableDate(now)
  const latestSelectableEnd = endOfUtcDay(latestSelectableDate)
  const orderedStart = start <= end ? startOfUtcDay(start) : startOfUtcDay(end)
  const orderedEnd = start <= end ? endOfUtcDay(end) : endOfUtcDay(start)
  const clampedEnd = orderedEnd > latestSelectableEnd ? latestSelectableEnd : orderedEnd
  const normalizedStart = orderedStart > clampedEnd ? startOfUtcDay(clampedEnd) : orderedStart
  const maxWindowStart = addUtcDays(startOfUtcDay(clampedEnd), -(ADMIN_METRICS_MAX_WINDOW_DAYS - 1))
  const clampedStart = normalizedStart < maxWindowStart ? maxWindowStart : normalizedStart
  return { start: clampedStart, end: clampedEnd }
}

export function resolveAdminDateRangeFromStrings(
  startDate: string,
  endDate: string,
  now = new Date(),
): AdminDateRange | null {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  if (!start || !end) return null
  return resolveAdminDateRange(start, end, now)
}

export function formatAdminDateInputValue(date: Date): string {
  return formatUtcDateOnly(date)
}

export function parseAdminDateInputValue(value: string): Date | null {
  return parseDateOnly(value)
}

export function resolveAdminQuickRange(range: AdminMetricsRangeId, now = new Date()): AdminDateRange {
  const utcYesterday = resolveAdminLatestSelectableDate(now)
  switch (range) {
    case '7d':
      return resolveAdminDateRange(addUtcDays(utcYesterday, -6), utcYesterday, now)
    case '30d':
      return resolveAdminDateRange(addUtcDays(utcYesterday, -29), utcYesterday, now)
    case '90d':
      return resolveAdminDateRange(addUtcDays(utcYesterday, -89), utcYesterday, now)
    case 'mtd':
      return resolveAdminDateRange(startOfUtcMonth(now), utcYesterday, now)
    case 'prev-month': {
      const currentMonthStart = startOfUtcMonth(now)
      const start = new Date(
        Date.UTC(
          currentMonthStart.getUTCFullYear(),
          currentMonthStart.getUTCMonth() - 1,
          1,
        ),
      )
      const end = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth(), 0, 23, 59, 59, 999))
      return resolveAdminDateRange(start, end, now)
    }
    default:
      throw new Error(`Unsupported admin metrics range: ${range}`)
  }
}

export function resolveAdminCustomRange(days: number, now = new Date()): AdminDateRange {
  const safeDays = Number.isFinite(days) ? days : 1
  const wholeDays = Math.max(1, Math.floor(safeDays))
  const utcYesterday = resolveAdminLatestSelectableDate(now)
  return {
    start: addUtcDays(utcYesterday, -(wholeDays - 1)),
    end: endOfUtcDay(utcYesterday),
  }
}

export function formatAdminMetricsRangeLabel(range: AdminMetricsRangeId, now = new Date()): string {
  switch (range) {
    case '7d':
      return 'Last 7 days'
    case '30d':
      return 'Last 30 days'
    case '90d':
      return 'Last 90 days'
    case 'mtd':
      return `Month to date · ${formatUtcMonthLabel(now)}`
    case 'prev-month':
      return `Previous month · ${formatUtcMonthLabel(addUtcDays(startOfUtcMonth(now), -1))}`
    default:
      throw new Error(`Unsupported admin metrics range: ${range}`)
  }
}

export function buildAdminMetricsPoints(rows: MonitoringMetricsDay[]): AdminMetricsPoint[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      label: formatUtcDateLabel(new Date(`${row.date}T00:00:00Z`)),
      dau: row.daily.users.active,
      wau: row.weekly.users.active,
      mau: row.monthly.users.active,
    }))
}

export function buildAdminRequestMetricsPoints(rows: MonitoringMetricsDay[]): AdminRequestMetricsPoint[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      label: formatUtcDateLabel(new Date(`${row.date}T00:00:00Z`)),
      failed: row.daily.requests.failed,
      successful: row.daily.requests.successful,
      total: row.daily.requests.total,
    }))
}

export function buildAdminRequestIntensityPoints(
  rows: MonitoringMetricsDay[],
): AdminRequestIntensityPoint[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      label: formatUtcDateLabel(new Date(`${row.date}T00:00:00Z`)),
      avgPerUser: row.daily.requests.avg_per_user,
      medianPerUser: row.daily.requests.median_per_user,
      p95PerUser: row.daily.requests.p95_per_user,
      maxPerUser: row.daily.requests.max_per_user,
    }))
}

export function buildAdminUserMixPoints(rows: MonitoringMetricsDay[]): AdminUserMixPoint[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      label: formatUtcDateLabel(new Date(`${row.date}T00:00:00Z`)),
      newUsers: row.daily.users.new,
      retainedUsers: row.daily.users.retained,
      churnedUsers: row.daily.users.churned,
      retentionRate: row.daily.users.retention_rate,
      churnRate: row.daily.users.churn_rate,
    }))
}

export function buildAdminLatencyPoints(rows: MonitoringMetricsDay[]): AdminLatencyPoint[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      label: formatUtcDateLabel(new Date(`${row.date}T00:00:00Z`)),
      avg: row.daily.requests.duration.avg,
      avgSuccess: row.daily.requests.duration.avg_success,
      avgFailure: row.daily.requests.duration.avg_failure,
      p95: row.daily.requests.duration.p95,
      p99: row.daily.requests.duration.p99,
    }))
}
