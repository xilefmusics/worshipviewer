import { describe, expect, it } from 'vitest'

import {
  buildAdminMetricsPoints,
  buildAdminLatencyPoints,
  buildAdminRequestMetricsPoints,
  buildAdminRequestIntensityPoints,
  buildAdminUserMixPoints,
  formatAdminDateInputValue,
  parseAdminDateInputValue,
  resolveAdminQuickRange,
  resolveAdminDateRangeFromStrings,
  type MonitoringMetricsDay,
} from './admin-dashboard'

describe('admin date helpers', () => {
  const now = new Date('2026-06-16T15:30:00Z')

  it('formats utc dates for date inputs', () => {
    expect(formatAdminDateInputValue(new Date('2026-06-05T12:00:00Z'))).toBe('2026-06-05')
  })

  it('parses utc date input values', () => {
    expect(parseAdminDateInputValue('2026-06-05')?.toISOString()).toBe('2026-06-05T00:00:00.000Z')
    expect(parseAdminDateInputValue('2026-02-30')).toBeNull()
  })

  it('returns the last thirty days preset in utc', () => {
    const range = resolveAdminQuickRange('30d', now)
    expect(range.start.toISOString()).toBe('2026-05-17T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-06-15T23:59:59.999Z')
  })

  it('returns the last ninety days preset in utc', () => {
    const range = resolveAdminQuickRange('90d', now)
    expect(range.start.toISOString()).toBe('2026-03-18T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-06-15T23:59:59.999Z')
  })

  it('returns month to date without today', () => {
    const range = resolveAdminQuickRange('mtd', now)
    expect(range.start.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-06-15T23:59:59.999Z')
  })

  it('returns the previous month preset in utc', () => {
    const range = resolveAdminQuickRange('prev-month', now)
    expect(range.start.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-05-31T23:59:59.999Z')
  })

  it('clamps custom ranges to yesterday and orders reversed inputs', () => {
    const range = resolveAdminDateRangeFromStrings('2026-06-20', '2026-06-18', now)
    expect(range?.start.toISOString()).toBe('2026-06-15T00:00:00.000Z')
    expect(range?.end.toISOString()).toBe('2026-06-15T23:59:59.999Z')
  })

  it('caps custom ranges at ninety days inclusive', () => {
    const range = resolveAdminDateRangeFromStrings('2026-01-01', '2026-06-15', now)
    expect(range?.start.toISOString()).toBe('2026-03-18T00:00:00.000Z')
    expect(range?.end.toISOString()).toBe('2026-06-15T23:59:59.999Z')
  })
})

describe('buildAdminMetricsPoints', () => {
  it('sorts rows by date and maps the active-user windows', () => {
    const rows: MonitoringMetricsDay[] = [
      {
        date: '2026-06-12',
        daily: { users: { active: 12 } } as MonitoringMetricsDay['daily'],
        weekly: { users: { active: 31 } } as MonitoringMetricsDay['weekly'],
        monthly: { users: { active: 58 } } as MonitoringMetricsDay['monthly'],
      },
      {
        date: '2026-06-10',
        daily: { users: { active: 9 } } as MonitoringMetricsDay['daily'],
        weekly: { users: { active: 29 } } as MonitoringMetricsDay['weekly'],
        monthly: { users: { active: 55 } } as MonitoringMetricsDay['monthly'],
      },
    ]

    expect(buildAdminMetricsPoints(rows)).toEqual([
      { date: '2026-06-10', label: expect.any(String), dau: 9, wau: 29, mau: 55 },
      { date: '2026-06-12', label: expect.any(String), dau: 12, wau: 31, mau: 58 },
    ])
  })
})

describe('buildAdminRequestMetricsPoints', () => {
  it('sorts rows by date and maps the request counts', () => {
    const rows: MonitoringMetricsDay[] = [
      {
        date: '2026-06-12',
        daily: {
          requests: { failed: 4, successful: 18, total: 22 } as MonitoringMetricsDay['daily']['requests'],
          users: { active: 12 },
        } as MonitoringMetricsDay['daily'],
        weekly: {
          requests: { failed: 8, successful: 55, total: 63 } as MonitoringMetricsDay['weekly']['requests'],
          users: { active: 31 },
        } as MonitoringMetricsDay['weekly'],
        monthly: {
          requests: { failed: 15, successful: 160, total: 175 } as MonitoringMetricsDay['monthly']['requests'],
          users: { active: 58 },
        } as MonitoringMetricsDay['monthly'],
      },
      {
        date: '2026-06-10',
        daily: {
          requests: { failed: 2, successful: 11, total: 13 } as MonitoringMetricsDay['daily']['requests'],
          users: { active: 9 },
        } as MonitoringMetricsDay['daily'],
        weekly: {
          requests: { failed: 5, successful: 40, total: 45 } as MonitoringMetricsDay['weekly']['requests'],
          users: { active: 29 },
        } as MonitoringMetricsDay['weekly'],
        monthly: {
          requests: { failed: 9, successful: 122, total: 131 } as MonitoringMetricsDay['monthly']['requests'],
          users: { active: 55 },
        } as MonitoringMetricsDay['monthly'],
      },
    ]

    expect(buildAdminRequestMetricsPoints(rows)).toEqual([
      { date: '2026-06-10', label: expect.any(String), failed: 2, successful: 11, total: 13 },
      { date: '2026-06-12', label: expect.any(String), failed: 4, successful: 18, total: 22 },
    ])
  })
})

describe('buildAdminRequestIntensityPoints', () => {
  it('sorts rows by date and maps the request intensity metrics', () => {
    const rows: MonitoringMetricsDay[] = [
      {
        date: '2026-06-12',
        daily: {
          requests: {
            avg_per_user: 2.1,
            client_error: 1,
            duration: { avg: 120, avg_failure: 220, avg_success: 110, max: 600, min: 20, p95: 420, p99: 580 },
            error_rate: 0.05,
            failed: 4,
            max_per_user: 7,
            median_per_user: 2.0,
            p95_per_user: 5.5,
            server_error: 3,
            successful: 18,
            total: 22,
          } as MonitoringMetricsDay['daily']['requests'],
          users: { active: 12 },
        } as MonitoringMetricsDay['daily'],
        weekly: { users: { active: 31 } } as MonitoringMetricsDay['weekly'],
        monthly: { users: { active: 58 } } as MonitoringMetricsDay['monthly'],
      },
      {
        date: '2026-06-10',
        daily: {
          requests: {
            avg_per_user: 1.5,
            client_error: 0,
            duration: { avg: 90, avg_failure: 180, avg_success: 88, max: 400, min: 18, p95: 300, p99: 380 },
            error_rate: 0.02,
            failed: 2,
            max_per_user: 5,
            median_per_user: 1.8,
            p95_per_user: 4.2,
            server_error: 2,
            successful: 11,
            total: 13,
          } as MonitoringMetricsDay['daily']['requests'],
          users: { active: 9 },
        } as MonitoringMetricsDay['daily'],
        weekly: { users: { active: 29 } } as MonitoringMetricsDay['weekly'],
        monthly: { users: { active: 55 } } as MonitoringMetricsDay['monthly'],
      },
    ]

    expect(buildAdminRequestIntensityPoints(rows)).toEqual([
      {
        date: '2026-06-10',
        label: expect.any(String),
        avgPerUser: 1.5,
        medianPerUser: 1.8,
        p95PerUser: 4.2,
        maxPerUser: 5,
      },
      {
        date: '2026-06-12',
        label: expect.any(String),
        avgPerUser: 2.1,
        medianPerUser: 2.0,
        p95PerUser: 5.5,
        maxPerUser: 7,
      },
    ])
  })
})

describe('buildAdminUserMixPoints', () => {
  it('sorts rows by date and maps the user mix metrics', () => {
    const rows: MonitoringMetricsDay[] = [
      {
        date: '2026-06-12',
        daily: {
          requests: {
            avg_per_user: 2.1,
            client_error: 1,
            duration: { avg: 120, avg_failure: 220, avg_success: 110, max: 600, min: 20, p95: 420, p99: 580 },
            error_rate: 0.05,
            failed: 4,
            max_per_user: 7,
            median_per_user: 2.0,
            p95_per_user: 5.5,
            server_error: 3,
            successful: 18,
            total: 22,
          } as MonitoringMetricsDay['daily']['requests'],
          users: {
            active: 12,
            churn_rate: 0.2,
            churned: 3,
            net_growth: 1,
            new: 4,
            retained: 8,
            retention_rate: 0.8,
            returning_users: 8,
          },
        } as MonitoringMetricsDay['daily'],
        weekly: { users: { active: 31 } } as MonitoringMetricsDay['weekly'],
        monthly: { users: { active: 58 } } as MonitoringMetricsDay['monthly'],
      },
      {
        date: '2026-06-10',
        daily: {
          requests: {
            avg_per_user: 1.5,
            client_error: 0,
            duration: { avg: 90, avg_failure: 180, avg_success: 88, max: 400, min: 18, p95: 300, p99: 380 },
            error_rate: 0.02,
            failed: 2,
            max_per_user: 5,
            median_per_user: 1.8,
            p95_per_user: 4.2,
            server_error: 2,
            successful: 11,
            total: 13,
          } as MonitoringMetricsDay['daily']['requests'],
          users: {
            active: 9,
            churn_rate: 0.1,
            churned: 1,
            net_growth: 2,
            new: 3,
            retained: 6,
            retention_rate: 0.9,
            returning_users: 6,
          },
        } as MonitoringMetricsDay['daily'],
        weekly: { users: { active: 29 } } as MonitoringMetricsDay['weekly'],
        monthly: { users: { active: 55 } } as MonitoringMetricsDay['monthly'],
      },
    ]

    expect(buildAdminUserMixPoints(rows)).toEqual([
      {
        date: '2026-06-10',
        label: expect.any(String),
        newUsers: 3,
        retainedUsers: 6,
        churnedUsers: 1,
        retentionRate: 0.9,
        churnRate: 0.1,
      },
      {
        date: '2026-06-12',
        label: expect.any(String),
        newUsers: 4,
        retainedUsers: 8,
        churnedUsers: 3,
        retentionRate: 0.8,
        churnRate: 0.2,
      },
    ])
  })
})

describe('buildAdminLatencyPoints', () => {
  it('sorts rows by date and maps the request latency metrics', () => {
    const rows: MonitoringMetricsDay[] = [
      {
        date: '2026-06-12',
        daily: {
          requests: {
            avg_per_user: 2.1,
            client_error: 1,
            duration: { avg: 120, avg_failure: 220, avg_success: 110, max: 600, min: 20, p95: 420, p99: 580 },
            error_rate: 0.05,
            failed: 4,
            max_per_user: 7,
            median_per_user: 2.0,
            p95_per_user: 5.5,
            server_error: 3,
            successful: 18,
            total: 22,
          } as MonitoringMetricsDay['daily']['requests'],
          users: { active: 12 } as MonitoringMetricsDay['daily']['users'],
        } as MonitoringMetricsDay['daily'],
        weekly: { users: { active: 31 } } as MonitoringMetricsDay['weekly'],
        monthly: { users: { active: 58 } } as MonitoringMetricsDay['monthly'],
      },
      {
        date: '2026-06-10',
        daily: {
          requests: {
            avg_per_user: 1.5,
            client_error: 0,
            duration: { avg: 90, avg_failure: 180, avg_success: 88, max: 400, min: 18, p95: 300, p99: 380 },
            error_rate: 0.02,
            failed: 2,
            max_per_user: 5,
            median_per_user: 1.8,
            p95_per_user: 4.2,
            server_error: 2,
            successful: 11,
            total: 13,
          } as MonitoringMetricsDay['daily']['requests'],
          users: { active: 9 } as MonitoringMetricsDay['daily']['users'],
        } as MonitoringMetricsDay['daily'],
        weekly: { users: { active: 29 } } as MonitoringMetricsDay['weekly'],
        monthly: { users: { active: 55 } } as MonitoringMetricsDay['monthly'],
      },
    ]

    expect(buildAdminLatencyPoints(rows)).toEqual([
      { date: '2026-06-10', label: expect.any(String), avg: 90, avgSuccess: 88, avgFailure: 180, p95: 300, p99: 380 },
      { date: '2026-06-12', label: expect.any(String), avg: 120, avgSuccess: 110, avgFailure: 220, p95: 420, p99: 580 },
    ])
  })
})
