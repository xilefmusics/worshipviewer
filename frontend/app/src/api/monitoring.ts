import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type MonitoringMetricsDay = components['schemas']['MonitoringMetricsDay']

function listErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const p = body as { title?: string; detail?: string }
    if (typeof p.detail === 'string' && p.detail.trim()) return p.detail.trim()
    if (typeof p.title === 'string' && p.title.trim()) return p.title.trim()
  }
  if (typeof body === 'string' && body.trim()) return body.slice(0, 300)
  return `Request failed (${status})`
}

export async function fetchMonitoringMetrics(args: {
  start: string
  end: string
  signal?: AbortSignal
}): Promise<MonitoringMetricsDay[]> {
  const { data, response, error } = await api.GET('/api/v1/monitoring/metrics', {
    params: {
      query: {
        start: args.start,
        end: args.end,
      },
    },
    signal: args.signal,
  })
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  return Array.isArray(data) ? (data as MonitoringMetricsDay[]) : []
}
