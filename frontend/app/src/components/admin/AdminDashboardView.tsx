import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchMonitoringMetrics } from '@/api/monitoring'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  buildAdminMetricsPoints,
  buildAdminLatencyPoints,
  buildAdminRequestMetricsPoints,
  buildAdminRequestIntensityPoints,
  buildAdminUserMixPoints,
  resolveAdminDateRangeFromStrings,
  type AdminLatencyPoint,
  type AdminMetricsPoint,
  type AdminRequestIntensityPoint,
  type AdminRequestMetricsPoint,
  type AdminUserMixPoint,
} from '@/lib/admin-dashboard'

type ChartMetricKey = 'dau' | 'wau' | 'mau'
type OutlierMode = 'all' | 'trim-p95' | 'trim-p90'

function formatPointValue(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value)
}

function formatWholePointValue(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercentPointValue(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: value >= 0.1 ? 0 : 1,
  }).format(value)
}

function formatDurationPointValue(value: number): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value)} ms`
}

function formatLatencyOutlierModeLabel(mode: OutlierMode, t: (key: string) => string): string {
  switch (mode) {
    case 'all':
      return t('adminDashboard.latencyOutlierAll')
    case 'trim-p95':
      return t('adminDashboard.latencyOutlierTrimP95')
    case 'trim-p90':
      return t('adminDashboard.latencyOutlierTrimP90')
  }
}

function filterOutlierPoints<T>(
  points: T[],
  selector: (point: T) => number,
  mode: OutlierMode,
): T[] {
  if (mode === 'all' || points.length === 0) return points
  const quantile = mode === 'trim-p95' ? 0.95 : 0.9
  const sorted = [...points].sort((a, b) => selector(a) - selector(b))
  const thresholdIndex = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * quantile)))
  const threshold = selector(sorted[thresholdIndex] ?? points[points.length - 1])
  const filtered = points.filter((point) => selector(point) <= threshold)
  return filtered.length > 0 ? filtered : points
}

function OutlierFilterControl({
  mode,
  hiddenCount,
  onChange,
}: {
  mode: OutlierMode
  hiddenCount: number
  onChange: (mode: OutlierMode) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#8FB8FF]" />
          {formatLatencyOutlierModeLabel(mode, t)}
        </span>
        {hiddenCount > 0 ? (
          <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[var(--color-foreground)]">
            {t('adminDashboard.latencyOutlierHidden', { count: hiddenCount })}
          </span>
        ) : null}
      </div>
      <Select value={mode} onValueChange={(value) => onChange(value as OutlierMode)}>
        <SelectTrigger
          aria-label={t('adminDashboard.latencyOutlierAria')}
          className="h-9 w-[min(16rem,100%)] rounded-full border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs shadow-sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('adminDashboard.latencyOutlierAll')}</SelectItem>
          <SelectItem value="trim-p95">{t('adminDashboard.latencyOutlierTrimP95')}</SelectItem>
          <SelectItem value="trim-p90">{t('adminDashboard.latencyOutlierTrimP90')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

type ChartSummaryItem = {
  label: string
  value: string
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function ChartSummaryRow({ items }: { items: ChartSummaryItem[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-3 py-2"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            {item.label}
          </p>
          <p className="mt-1 text-base font-semibold text-[var(--color-foreground)]">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function MetricsChart({ points }: { points: AdminMetricsPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const palette = [
    { key: 'dau', label: 'DAU', stroke: '#8FB8FF' },
    { key: 'wau', label: 'WAU', stroke: '#A8E6CF' },
    { key: 'mau', label: 'MAU', stroke: '#F7C7A3' },
  ] as const

  const width = 960
  const height = 360
  const padding = { top: 20, right: 18, bottom: 44, left: 56 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const values = points.flatMap((point) => [point.dau, point.wau, point.mau])
  const maxValue = Math.max(1, ...values)
  const tickStep = Math.max(1, Math.ceil(maxValue / 4))
  const tickMax = tickStep * 4
  const yScale = (value: number) =>
    padding.top + (1 - value / (tickMax || 1)) * innerHeight
  const xScale = (index: number) =>
    points.length <= 1
      ? padding.left + innerWidth / 2
      : padding.left + (index * innerWidth) / (points.length - 1)

  const linePath = (key: ChartMetricKey) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(index)} ${yScale(point[key])}`).join(' ')

  const areaPath = (key: ChartMetricKey) => {
    if (points.length === 0) return ''
    const baselineY = padding.top + innerHeight
    const startX = xScale(0)
    const endX = xScale(points.length - 1)
    return `${linePath(key)} L ${endX} ${baselineY} L ${startX} ${baselineY} Z`
  }

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null

  function updateHoverFromEvent(e: React.MouseEvent<SVGSVGElement>) {
    if (points.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const x = (offsetX / rect.width) * width
    const clampedX = Math.max(padding.left, Math.min(x, width - padding.right))
    if (points.length === 1) {
      setHoveredIndex(0)
      return
    }
    const step = innerWidth / (points.length - 1)
    const index = Math.round((clampedX - padding.left) / step)
    setHoveredIndex(Math.max(0, Math.min(points.length - 1, index)))
  }

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = tickStep * (4 - index)
    return { value, y: yScale(value) }
  })

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)] p-3 shadow-sm">
      <svg
        aria-label="Usage chart"
        className="h-auto w-full"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={updateHoverFromEvent}
      >
        <defs>
          <linearGradient id="admin-chart-grid" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-border)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--color-border)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <g key={line.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={line.y}
              y2={line.y}
              stroke="url(#admin-chart-grid)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left - 10}
              y={line.y + 4}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="end"
            >
              {formatWholePointValue(line.value)}
            </text>
          </g>
        ))}

        {palette.map((series) => (
          <g key={series.key}>
            <path d={areaPath(series.key)} fill={series.stroke} opacity="0.18" />
            <path
              d={linePath(series.key)}
              fill="none"
              stroke={series.stroke}
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ))}

        {hoveredPoint ? (
          <>
            <line
              x1={xScale(hoveredIndex ?? 0)}
              x2={xScale(hoveredIndex ?? 0)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
            />
            {palette.map((series) => {
              const value = hoveredPoint[series.key]
              return (
                <circle
                  key={`hover-${series.key}`}
                  cx={xScale(hoveredIndex ?? 0)}
                  cy={yScale(value)}
                  r="5"
                  fill={series.stroke}
                  stroke="var(--color-surface)"
                  strokeWidth="2"
                />
              )
            })}
          </>
        ) : null}

        {points.map((point, index) => {
          const stride = Math.max(1, Math.ceil(points.length / 6))
          const showLabel = index === 0 || index === points.length - 1 || index % stride === 0
          if (!showLabel) return null
          return (
            <text
              key={point.date}
              x={xScale(index)}
              y={height - 16}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="middle"
            >
              {point.label}
            </text>
          )
        })}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute right-4 top-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs shadow-[var(--shadow-elevated)] backdrop-blur"
          role="status"
        >
          <p className="font-medium text-[var(--color-foreground)]">{hoveredPoint.label}</p>
          <div className="mt-1 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[var(--color-muted-foreground)]">DAU</p>
              <p className="font-semibold text-[#8FB8FF]">{formatPointValue(hoveredPoint.dau)}</p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">WAU</p>
              <p className="font-semibold text-[#A8E6CF]">{formatPointValue(hoveredPoint.wau)}</p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">MAU</p>
              <p className="font-semibold text-[#F7C7A3]">{formatPointValue(hoveredPoint.mau)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function RequestsChart({ points }: { points: AdminRequestMetricsPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [outlierMode, setOutlierMode] = useState<OutlierMode>('all')
  const palette = {
    failed: { stroke: '#F08A8A', fill: '#F08A8A' },
    successful: { stroke: '#A8E6CF', fill: '#A8E6CF' },
    total: { stroke: '#8FB8FF', fill: '#8FB8FF' },
  } as const

  const chartPoints = useMemo(
    () => filterOutlierPoints(points, (point) => point.total, outlierMode),
    [outlierMode, points],
  )
  const hiddenCount = points.length - chartPoints.length

  const width = 960
  const height = 360
  const padding = { top: 20, right: 18, bottom: 44, left: 56 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const values = chartPoints.flatMap((point) => [point.failed + point.successful, point.total])
  const maxValue = Math.max(1, ...values)
  const tickStep = Math.max(1, Math.ceil(maxValue / 4))
  const tickMax = tickStep * 4
  const yScale = (value: number) => padding.top + (1 - value / (tickMax || 1)) * innerHeight
  const xScale = (index: number) =>
    chartPoints.length <= 1
      ? padding.left + innerWidth / 2
      : padding.left + (index * innerWidth) / (chartPoints.length - 1)

  const linePath = (selector: (point: AdminRequestMetricsPoint) => number) =>
    chartPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(index)} ${yScale(selector(point))}`)
      .join(' ')

  const areaPath = (lower: (point: AdminRequestMetricsPoint) => number, upper: (point: AdminRequestMetricsPoint) => number) => {
    if (chartPoints.length === 0) return ''
    const lowerPath = linePath(lower)
    const upperPath = [...chartPoints]
      .reverse()
      .map((point, reverseIndex) => {
        const index = chartPoints.length - 1 - reverseIndex
        return `L ${xScale(index)} ${yScale(upper(point))}`
      })
      .join(' ')
    return `${lowerPath} ${upperPath} Z`
  }

  const hoveredPoint = hoveredIndex !== null ? chartPoints[hoveredIndex] : null

  function updateHoverFromEvent(e: React.MouseEvent<SVGSVGElement>) {
    if (chartPoints.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const x = (offsetX / rect.width) * width
    const clampedX = Math.max(padding.left, Math.min(x, width - padding.right))
    if (chartPoints.length === 1) {
      setHoveredIndex(0)
      return
    }
    const step = innerWidth / (chartPoints.length - 1)
    const index = Math.round((clampedX - padding.left) / step)
    setHoveredIndex(Math.max(0, Math.min(chartPoints.length - 1, index)))
  }

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = tickStep * (4 - index)
    return { value, y: yScale(value) }
  })

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)] p-3 shadow-sm">
      <OutlierFilterControl mode={outlierMode} hiddenCount={hiddenCount} onChange={setOutlierMode} />
      <svg
        aria-label="Request chart"
        className="h-auto w-full"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={updateHoverFromEvent}
      >
        <defs>
          <linearGradient id="admin-requests-grid" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-border)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--color-border)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <g key={line.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={line.y}
              y2={line.y}
              stroke="url(#admin-requests-grid)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left - 10}
              y={line.y + 4}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="end"
            >
              {formatWholePointValue(line.value)}
            </text>
          </g>
        ))}

        <path
          d={areaPath(() => 0, (point) => point.failed)}
          fill={palette.failed.fill}
          opacity="0.18"
        />
        <path
          d={areaPath(
            (point) => point.failed,
            (point) => point.failed + point.successful,
          )}
          fill={palette.successful.fill}
          opacity="0.16"
        />
        <path
          d={linePath((point) => point.failed)}
          fill="none"
          stroke={palette.failed.stroke}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath((point) => point.failed + point.successful)}
          fill="none"
          stroke={palette.successful.stroke}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath((point) => point.total)}
          fill="none"
          stroke={palette.total.stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoveredPoint ? (
          <>
            <line
              x1={xScale(hoveredIndex ?? 0)}
              x2={xScale(hoveredIndex ?? 0)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.failed)}
              r="5"
              fill={palette.failed.stroke}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.failed + hoveredPoint.successful)}
              r="5"
              fill={palette.successful.stroke}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.total)}
              r="5"
              fill={palette.total.stroke}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          </>
        ) : null}

        {chartPoints.map((point, index) => {
          const stride = Math.max(1, Math.ceil(chartPoints.length / 6))
          const showLabel = index === 0 || index === chartPoints.length - 1 || index % stride === 0
          if (!showLabel) return null
          return (
            <text
              key={point.date}
              x={xScale(index)}
              y={height - 16}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="middle"
            >
              {point.label}
            </text>
          )
        })}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute right-4 top-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs shadow-[var(--shadow-elevated)] backdrop-blur"
          role="status"
        >
          <p className="font-medium text-[var(--color-foreground)]">{hoveredPoint.label}</p>
          <div className="mt-1 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[var(--color-muted-foreground)]">Failed</p>
              <p className="font-semibold text-[#F08A8A]">{formatPointValue(hoveredPoint.failed)}</p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">Succeeded</p>
              <p className="font-semibold text-[#A8E6CF]">
                {formatPointValue(hoveredPoint.successful)}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">Total</p>
              <p className="font-semibold text-[#8FB8FF]">{formatPointValue(hoveredPoint.total)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function RequestIntensityChart({ points }: { points: AdminRequestIntensityPoint[] }) {
  const { t } = useTranslation()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [outlierMode, setOutlierMode] = useState<OutlierMode>('all')
  const palette = {
    avgPerUser: '#8FB8FF',
    medianPerUser: '#A8E6CF',
    p95PerUser: '#F7C7A3',
  } as const

  const chartPoints = useMemo(
    () => filterOutlierPoints(points, (point) => point.maxPerUser, outlierMode),
    [outlierMode, points],
  )
  const hiddenCount = points.length - chartPoints.length

  const width = 960
  const height = 320
  const padding = { top: 20, right: 18, bottom: 44, left: 56 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const values = chartPoints.flatMap((point) => [point.avgPerUser, point.medianPerUser, point.p95PerUser, point.maxPerUser])
  const maxValue = Math.max(1, ...values)
  const tickStep = Math.max(1, Math.ceil(maxValue / 4))
  const tickMax = tickStep * 4
  const yScale = (value: number) => padding.top + (1 - value / (tickMax || 1)) * innerHeight
  const xScale = (index: number) =>
    chartPoints.length <= 1
      ? padding.left + innerWidth / 2
      : padding.left + (index * innerWidth) / (chartPoints.length - 1)

  const linePath = (selector: (point: AdminRequestIntensityPoint) => number) =>
    chartPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(index)} ${yScale(selector(point))}`)
      .join(' ')

  const hoveredPoint = hoveredIndex !== null ? chartPoints[hoveredIndex] : null

  function updateHoverFromEvent(e: React.MouseEvent<SVGSVGElement>) {
    if (chartPoints.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const x = (offsetX / rect.width) * width
    const clampedX = Math.max(padding.left, Math.min(x, width - padding.right))
    if (chartPoints.length === 1) {
      setHoveredIndex(0)
      return
    }
    const step = innerWidth / (chartPoints.length - 1)
    const index = Math.round((clampedX - padding.left) / step)
    setHoveredIndex(Math.max(0, Math.min(chartPoints.length - 1, index)))
  }

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = tickStep * (4 - index)
    return { value, y: yScale(value) }
  })

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)] p-3 shadow-sm">
      <OutlierFilterControl mode={outlierMode} hiddenCount={hiddenCount} onChange={setOutlierMode} />
      <svg
        aria-label="Request intensity chart"
        className="h-auto w-full"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={updateHoverFromEvent}
      >
        <defs>
          <linearGradient id="admin-request-intensity-grid" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-border)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--color-border)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <g key={line.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={line.y}
              y2={line.y}
              stroke="url(#admin-request-intensity-grid)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left - 10}
              y={line.y + 4}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="end"
            >
              {formatPointValue(line.value)}
            </text>
          </g>
        ))}

        <path
          d={linePath((point) => point.avgPerUser)}
          fill="none"
          stroke={palette.avgPerUser}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath((point) => point.medianPerUser)}
          fill="none"
          stroke={palette.medianPerUser}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath((point) => point.p95PerUser)}
          fill="none"
          stroke={palette.p95PerUser}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoveredPoint ? (
          <>
            <line
              x1={xScale(hoveredIndex ?? 0)}
              x2={xScale(hoveredIndex ?? 0)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.avgPerUser)}
              r="5"
              fill={palette.avgPerUser}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.medianPerUser)}
              r="5"
              fill={palette.medianPerUser}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.p95PerUser)}
              r="5"
              fill={palette.p95PerUser}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          </>
        ) : null}

        {chartPoints.map((point, index) => {
          const stride = Math.max(1, Math.ceil(chartPoints.length / 6))
          const showLabel = index === 0 || index === chartPoints.length - 1 || index % stride === 0
          if (!showLabel) return null
          return (
            <text
              key={point.date}
              x={xScale(index)}
              y={height - 16}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="middle"
            >
              {point.label}
            </text>
          )
        })}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute right-4 top-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs shadow-[var(--shadow-elevated)] backdrop-blur"
          role="status"
        >
          <p className="font-medium text-[var(--color-foreground)]">{hoveredPoint.label}</p>
          <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[var(--color-muted-foreground)]">{t('adminDashboard.requestIntensityAvgLabel')}</p>
              <p className="font-semibold text-[#8FB8FF]">{formatPointValue(hoveredPoint.avgPerUser)}</p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">{t('adminDashboard.requestIntensityMedianLabel')}</p>
              <p className="font-semibold text-[#A8E6CF]">
                {formatPointValue(hoveredPoint.medianPerUser)}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">{t('adminDashboard.requestIntensityP95Label')}</p>
              <p className="font-semibold text-[#F7C7A3]">
                {formatPointValue(hoveredPoint.p95PerUser)}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">{t('adminDashboard.requestIntensityPeakLabel')}</p>
              <p className="font-semibold text-[#D3B3FF]">{formatPointValue(hoveredPoint.maxPerUser)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function UserMixChart({ points }: { points: AdminUserMixPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const palette = {
    newUsers: { stroke: '#8FB8FF', fill: '#8FB8FF' },
    retainedUsers: { stroke: '#A8E6CF', fill: '#A8E6CF' },
    churnedUsers: { stroke: '#F08A8A', fill: '#F08A8A' },
  } as const

  const width = 960
  const height = 360
  const padding = { top: 20, right: 18, bottom: 44, left: 56 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const values = points.flatMap((point) => [point.newUsers + point.retainedUsers + point.churnedUsers])
  const maxValue = Math.max(1, ...values)
  const tickStep = Math.max(1, Math.ceil(maxValue / 4))
  const tickMax = tickStep * 4
  const yScale = (value: number) => padding.top + (1 - value / (tickMax || 1)) * innerHeight
  const xScale = (index: number) =>
    points.length <= 1
      ? padding.left + innerWidth / 2
      : padding.left + (index * innerWidth) / (points.length - 1)

  const linePath = (selector: (point: AdminUserMixPoint) => number) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(index)} ${yScale(selector(point))}`).join(' ')

  const areaPath = (lower: (point: AdminUserMixPoint) => number, upper: (point: AdminUserMixPoint) => number) => {
    if (points.length === 0) return ''
    const lowerPath = linePath(lower)
    const upperPath = [...points]
      .reverse()
      .map((point, reverseIndex) => {
        const index = points.length - 1 - reverseIndex
        return `L ${xScale(index)} ${yScale(upper(point))}`
      })
      .join(' ')
    return `${lowerPath} ${upperPath} Z`
  }

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null

  function updateHoverFromEvent(e: React.MouseEvent<SVGSVGElement>) {
    if (points.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const x = (offsetX / rect.width) * width
    const clampedX = Math.max(padding.left, Math.min(x, width - padding.right))
    if (points.length === 1) {
      setHoveredIndex(0)
      return
    }
    const step = innerWidth / (points.length - 1)
    const index = Math.round((clampedX - padding.left) / step)
    setHoveredIndex(Math.max(0, Math.min(points.length - 1, index)))
  }

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = tickStep * (4 - index)
    return { value, y: yScale(value) }
  })

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)] p-3 shadow-sm">
      <svg
        aria-label="User mix chart"
        className="h-auto w-full"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={updateHoverFromEvent}
      >
        <defs>
          <linearGradient id="admin-user-mix-grid" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-border)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--color-border)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <g key={line.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={line.y}
              y2={line.y}
              stroke="url(#admin-user-mix-grid)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left - 10}
              y={line.y + 4}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="end"
            >
              {formatWholePointValue(line.value)}
            </text>
          </g>
        ))}

        <path d={areaPath(() => 0, (point) => point.newUsers)} fill={palette.newUsers.fill} opacity="0.16" />
        <path
          d={areaPath(
            (point) => point.newUsers,
            (point) => point.newUsers + point.retainedUsers,
          )}
          fill={palette.retainedUsers.fill}
          opacity="0.16"
        />
        <path
          d={areaPath(
            (point) => point.newUsers + point.retainedUsers,
            (point) => point.newUsers + point.retainedUsers + point.churnedUsers,
          )}
          fill={palette.churnedUsers.fill}
          opacity="0.14"
        />
        <path d={linePath((point) => point.newUsers)} fill="none" stroke={palette.newUsers.stroke} strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d={linePath((point) => point.newUsers + point.retainedUsers)}
          fill="none"
          stroke={palette.retainedUsers.stroke}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath((point) => point.newUsers + point.retainedUsers + point.churnedUsers)}
          fill="none"
          stroke={palette.churnedUsers.stroke}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoveredPoint ? (
          <>
            <line
              x1={xScale(hoveredIndex ?? 0)}
              x2={xScale(hoveredIndex ?? 0)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.newUsers)}
              r="5"
              fill={palette.newUsers.stroke}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.newUsers + hoveredPoint.retainedUsers)}
              r="5"
              fill={palette.retainedUsers.stroke}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(
                hoveredPoint.newUsers + hoveredPoint.retainedUsers + hoveredPoint.churnedUsers,
              )}
              r="5"
              fill={palette.churnedUsers.stroke}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          </>
        ) : null}

        {points.map((point, index) => {
          const stride = Math.max(1, Math.ceil(points.length / 6))
          const showLabel = index === 0 || index === points.length - 1 || index % stride === 0
          if (!showLabel) return null
          return (
            <text
              key={point.date}
              x={xScale(index)}
              y={height - 16}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="middle"
            >
              {point.label}
            </text>
          )
        })}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute right-4 top-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs shadow-[var(--shadow-elevated)] backdrop-blur"
          role="status"
        >
          <p className="font-medium text-[var(--color-foreground)]">{hoveredPoint.label}</p>
          <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[var(--color-muted-foreground)]">New</p>
              <p className="font-semibold text-[#8FB8FF]">{formatWholePointValue(hoveredPoint.newUsers)}</p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">Retained</p>
              <p className="font-semibold text-[#A8E6CF]">
                {formatWholePointValue(hoveredPoint.retainedUsers)}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">Churned</p>
              <p className="font-semibold text-[#F08A8A]">
                {formatWholePointValue(hoveredPoint.churnedUsers)}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">Retention</p>
              <p className="font-semibold text-[#8FB8FF]">
                {formatPercentPointValue(hoveredPoint.retentionRate)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function RetentionRateChart({ points }: { points: AdminUserMixPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const width = 960
  const height = 320
  const padding = { top: 20, right: 18, bottom: 44, left: 56 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const values = points.map((point) => point.retentionRate)
  const maxValue = Math.max(1, ...values)
  const tickStep = Math.max(0.25, Math.ceil((maxValue * 100) / 4) / 100)
  const tickMax = Math.max(1, tickStep * 4)
  const yScale = (value: number) => padding.top + (1 - value / (tickMax || 1)) * innerHeight
  const xScale = (index: number) =>
    points.length <= 1
      ? padding.left + innerWidth / 2
      : padding.left + (index * innerWidth) / (points.length - 1)

  const linePath = (selector: (point: AdminUserMixPoint) => number) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(index)} ${yScale(selector(point))}`).join(' ')

  const areaPath = (selector: (point: AdminUserMixPoint) => number) => {
    if (points.length === 0) return ''
    const baselineY = padding.top + innerHeight
    const startX = xScale(0)
    const endX = xScale(points.length - 1)
    return `${linePath(selector)} L ${endX} ${baselineY} L ${startX} ${baselineY} Z`
  }

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null

  function updateHoverFromEvent(e: React.MouseEvent<SVGSVGElement>) {
    if (points.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const x = (offsetX / rect.width) * width
    const clampedX = Math.max(padding.left, Math.min(x, width - padding.right))
    if (points.length === 1) {
      setHoveredIndex(0)
      return
    }
    const step = innerWidth / (points.length - 1)
    const index = Math.round((clampedX - padding.left) / step)
    setHoveredIndex(Math.max(0, Math.min(points.length - 1, index)))
  }

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = (tickMax / 4) * (4 - index)
    return { value, y: yScale(value) }
  })

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)] p-3 shadow-sm">
      <svg
        aria-label="Retention rate chart"
        className="h-auto w-full"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={updateHoverFromEvent}
      >
        <defs>
          <linearGradient id="admin-retention-grid" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-border)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--color-border)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <g key={line.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={line.y}
              y2={line.y}
              stroke="url(#admin-retention-grid)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left - 10}
              y={line.y + 4}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="end"
            >
              {formatPercentPointValue(line.value)}
            </text>
          </g>
        ))}

        <path d={areaPath((point) => point.retentionRate)} fill="#8FB8FF" opacity="0.12" />
        <path
          d={linePath((point) => point.retentionRate)}
          fill="none"
          stroke="#8FB8FF"
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoveredPoint ? (
          <>
            <line
              x1={xScale(hoveredIndex ?? 0)}
              x2={xScale(hoveredIndex ?? 0)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
            />
            <circle
              cx={xScale(hoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.retentionRate)}
              r="5"
              fill="#8FB8FF"
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          </>
        ) : null}

        {points.map((point, index) => {
          const stride = Math.max(1, Math.ceil(points.length / 6))
          const showLabel = index === 0 || index === points.length - 1 || index % stride === 0
          if (!showLabel) return null
          return (
            <text
              key={point.date}
              x={xScale(index)}
              y={height - 16}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="middle"
            >
              {point.label}
            </text>
          )
        })}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute right-4 top-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs shadow-[var(--shadow-elevated)] backdrop-blur"
          role="status"
        >
          <p className="font-medium text-[var(--color-foreground)]">{hoveredPoint.label}</p>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[var(--color-muted-foreground)]">Retention</p>
              <p className="font-semibold text-[#8FB8FF]">
                {formatPercentPointValue(hoveredPoint.retentionRate)}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">Churn</p>
              <p className="font-semibold text-[#F08A8A]">
                {formatPercentPointValue(hoveredPoint.churnRate)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LatencyChart({ points }: { points: AdminLatencyPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [outlierMode, setOutlierMode] = useState<OutlierMode>('all')
  const palette = {
    avg: '#8FB8FF',
    avgSuccess: '#A8E6CF',
    avgFailure: '#F08A8A',
    p95: '#F7C7A3',
    p99: '#D3B3FF',
  } as const

  const chartPoints = useMemo(() => {
    return filterOutlierPoints(points, (point) => point.p99, outlierMode)
  }, [outlierMode, points])

  const hiddenCount = points.length - chartPoints.length

  const width = 960
  const height = 340
  const padding = { top: 20, right: 18, bottom: 44, left: 56 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const values = chartPoints.flatMap((point) => [point.avg, point.avgSuccess, point.avgFailure, point.p95, point.p99])
  const maxValue = Math.max(1, ...values)
  const tickStep = Math.max(1, Math.ceil(maxValue / 4))
  const tickMax = tickStep * 4
  const yScale = (value: number) => padding.top + (1 - value / (tickMax || 1)) * innerHeight
  const xScale = (index: number) =>
    chartPoints.length <= 1
      ? padding.left + innerWidth / 2
      : padding.left + (index * innerWidth) / (chartPoints.length - 1)

  const linePath = (selector: (point: AdminLatencyPoint) => number) =>
    chartPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(index)} ${yScale(selector(point))}`)
      .join(' ')

  const effectiveHoveredIndex =
    hoveredIndex !== null && hoveredIndex < chartPoints.length ? hoveredIndex : null
  const hoveredPoint = effectiveHoveredIndex !== null ? chartPoints[effectiveHoveredIndex] : null

  function updateHoverFromEvent(e: React.MouseEvent<SVGSVGElement>) {
    if (chartPoints.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const x = (offsetX / rect.width) * width
    const clampedX = Math.max(padding.left, Math.min(x, width - padding.right))
    if (chartPoints.length === 1) {
      setHoveredIndex(0)
      return
    }
    const step = innerWidth / (chartPoints.length - 1)
    const index = Math.round((clampedX - padding.left) / step)
    setHoveredIndex(Math.max(0, Math.min(chartPoints.length - 1, index)))
  }

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = tickStep * (4 - index)
    return { value, y: yScale(value) }
  })

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)] p-3 shadow-sm">
      <OutlierFilterControl mode={outlierMode} hiddenCount={hiddenCount} onChange={setOutlierMode} />
      <svg
        aria-label="Latency chart"
        className="h-auto w-full"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={updateHoverFromEvent}
      >
        <defs>
          <linearGradient id="admin-latency-grid" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-border)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--color-border)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <g key={line.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={line.y}
              y2={line.y}
              stroke="url(#admin-latency-grid)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left - 10}
              y={line.y + 4}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="end"
            >
              {formatDurationPointValue(line.value)}
            </text>
          </g>
        ))}

        <path d={linePath((point) => point.avg)} fill="none" stroke={palette.avg} strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d={linePath((point) => point.p95)}
          fill="none"
          stroke={palette.p95}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath((point) => point.p99)}
          fill="none"
          stroke={palette.p99}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoveredPoint ? (
          <>
            <line
              x1={xScale(effectiveHoveredIndex ?? 0)}
              x2={xScale(effectiveHoveredIndex ?? 0)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
            />
            <circle
              cx={xScale(effectiveHoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.avg)}
              r="5"
              fill={palette.avg}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
            <circle
              cx={xScale(effectiveHoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.p95)}
              r="5"
              fill={palette.p95}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
            <circle
              cx={xScale(effectiveHoveredIndex ?? 0)}
              cy={yScale(hoveredPoint.p99)}
              r="5"
              fill={palette.p99}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          </>
        ) : null}

        {chartPoints.map((point, index) => {
          const stride = Math.max(1, Math.ceil(chartPoints.length / 6))
          const showLabel = index === 0 || index === chartPoints.length - 1 || index % stride === 0
          if (!showLabel) return null
          return (
            <text
              key={point.date}
              x={xScale(index)}
              y={height - 16}
              fill="var(--color-muted-foreground)"
              fontSize="12"
              textAnchor="middle"
            >
              {point.label}
            </text>
          )
        })}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute right-4 top-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs shadow-[var(--shadow-elevated)] backdrop-blur"
          role="status"
        >
          <p className="font-medium text-[var(--color-foreground)]">{hoveredPoint.label}</p>
          <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[var(--color-muted-foreground)]">Avg</p>
              <p className="font-semibold text-[#8FB8FF]">{formatDurationPointValue(hoveredPoint.avg)}</p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">P95</p>
              <p className="font-semibold text-[#F7C7A3]">{formatDurationPointValue(hoveredPoint.p95)}</p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">P99</p>
              <p className="font-semibold text-[#D3B3FF]">{formatDurationPointValue(hoveredPoint.p99)}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[var(--color-muted-foreground)]">Success avg</p>
              <p className="font-semibold text-[#A8E6CF]">
                {formatDurationPointValue(hoveredPoint.avgSuccess)}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-muted-foreground)]">Failure avg</p>
              <p className="font-semibold text-[#F08A8A]">
                {formatDurationPointValue(hoveredPoint.avgFailure)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center">
      <p className="text-base font-medium text-[var(--color-foreground)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{description}</p>
    </div>
  )
}

export function AdminDashboardView({
  startDate,
  endDate,
}: {
  startDate: string
  endDate: string
}) {
  const { t } = useTranslation()
  const rangeWindow = resolveAdminDateRangeFromStrings(startDate, endDate)
  const query = useQuery({
    queryKey: ['admin-monitoring-metrics', startDate, endDate] as const,
    queryFn: async ({ signal }) =>
      fetchMonitoringMetrics({
        start: rangeWindow?.start.toISOString() ?? `${startDate}T00:00:00.000Z`,
        end: rangeWindow?.end.toISOString() ?? `${endDate}T23:59:59.999Z`,
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled: rangeWindow !== null,
  })

  const points = useMemo(() => buildAdminMetricsPoints(query.data ?? []), [query.data])
  const requestPoints = useMemo(() => buildAdminRequestMetricsPoints(query.data ?? []), [query.data])
  const requestIntensityPoints = useMemo(
    () => buildAdminRequestIntensityPoints(query.data ?? []),
    [query.data],
  )
  const userMixPoints = useMemo(() => buildAdminUserMixPoints(query.data ?? []), [query.data])
  const latencyPoints = useMemo(() => buildAdminLatencyPoints(query.data ?? []), [query.data])
  const requestTotal = requestPoints.reduce((sum, point) => sum + point.total, 0)
  const requestFailed = requestPoints.reduce((sum, point) => sum + point.failed, 0)
  const userMixNewTotal = userMixPoints.reduce((sum, point) => sum + point.newUsers, 0)
  const userMixRetainedTotal = userMixPoints.reduce((sum, point) => sum + point.retainedUsers, 0)
  const userMixChurnedTotal = userMixPoints.reduce((sum, point) => sum + point.churnedUsers, 0)

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 pb-2">
      {query.isError ? (
        <Card className="overflow-hidden">
          <CardHeader className="gap-3 p-5 pb-3">
            <CardTitle className="text-base">{t('adminDashboard.chartTitle')}</CardTitle>
            <CardDescription>{t('adminDashboard.chartSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <EmptyState
              title={t('adminDashboard.errorTitle')}
              description={(query.error as Error | undefined)?.message ?? t('adminDashboard.errorBody')}
            />
          </CardContent>
        </Card>
      ) : query.isPending && points.length === 0 ? (
        <Card className="overflow-hidden">
          <CardHeader className="gap-3 p-5 pb-3">
            <CardTitle className="text-base">{t('adminDashboard.chartTitle')}</CardTitle>
            <CardDescription>{t('adminDashboard.chartSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center text-sm text-[var(--color-muted-foreground)]">
              {t('adminDashboard.loading')}
            </div>
          </CardContent>
        </Card>
      ) : points.length === 0 ? (
        <Card className="overflow-hidden">
          <CardHeader className="gap-3 p-5 pb-3">
            <CardTitle className="text-base">{t('adminDashboard.chartTitle')}</CardTitle>
            <CardDescription>{t('adminDashboard.chartSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <EmptyState title={t('adminDashboard.emptyTitle')} description={t('adminDashboard.emptyBody')} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden lg:col-span-1">
            <CardHeader className="gap-3 p-5 pb-3">
              <CardTitle className="text-base">{t('adminDashboard.chartTitle')}</CardTitle>
              <CardDescription>{t('adminDashboard.chartSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-0">
              <ChartSummaryRow
                items={[
                  {
                    label: t('adminDashboard.usageSummaryDauLabel'),
                    value: formatWholePointValue(average(points.map((point) => point.dau))),
                  },
                  {
                    label: t('adminDashboard.usageSummaryWauLabel'),
                    value: formatWholePointValue(average(points.map((point) => point.wau))),
                  },
                  {
                    label: t('adminDashboard.usageSummaryMauLabel'),
                    value: formatWholePointValue(average(points.map((point) => point.mau))),
                  },
                  {
                    label: t('adminDashboard.usageSummaryMedianDauLabel'),
                    value: formatWholePointValue(median(points.map((point) => point.dau))),
                  },
                  {
                    label: t('adminDashboard.usageSummaryMedianWauLabel'),
                    value: formatWholePointValue(median(points.map((point) => point.wau))),
                  },
                  {
                    label: t('adminDashboard.usageSummaryMedianMauLabel'),
                    value: formatWholePointValue(median(points.map((point) => point.mau))),
                  },
                ]}
              />
              <div className="flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#8FB8FF]" />
                  DAU
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#A8E6CF]" />
                  WAU
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#F7C7A3]" />
                  MAU
                </span>
              </div>
              <MetricsChart points={points} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden lg:col-span-1">
            <CardHeader className="gap-3 p-5 pb-3">
              <CardTitle className="text-base">{t('adminDashboard.userMixChartTitle')}</CardTitle>
              <CardDescription>{t('adminDashboard.userMixChartSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-0">
              <ChartSummaryRow
                items={[
                  {
                    label: t('adminDashboard.userMixSummaryNewLabel'),
                    value: formatWholePointValue(userMixNewTotal),
                  },
                  {
                    label: t('adminDashboard.userMixSummaryRetainedLabel'),
                    value: formatWholePointValue(userMixRetainedTotal),
                  },
                  {
                    label: t('adminDashboard.userMixSummaryChurnedLabel'),
                    value: formatWholePointValue(userMixChurnedTotal),
                  },
                  {
                    label: t('adminDashboard.userMixSummaryMedianNewLabel'),
                    value: formatWholePointValue(median(userMixPoints.map((point) => point.newUsers))),
                  },
                  {
                    label: t('adminDashboard.userMixSummaryMedianRetainedLabel'),
                    value: formatWholePointValue(median(userMixPoints.map((point) => point.retainedUsers))),
                  },
                  {
                    label: t('adminDashboard.userMixSummaryMedianChurnedLabel'),
                    value: formatWholePointValue(median(userMixPoints.map((point) => point.churnedUsers))),
                  },
                ]}
              />
              <div className="flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#8FB8FF]" />
                  {t('adminDashboard.userMixNewLabel')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#A8E6CF]" />
                  {t('adminDashboard.userMixRetainedLabel')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#F08A8A]" />
                  {t('adminDashboard.userMixChurnedLabel')}
                </span>
              </div>
              <UserMixChart points={userMixPoints} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden lg:col-span-1">
            <CardHeader className="gap-3 p-5 pb-3">
              <CardTitle className="text-base">{t('adminDashboard.requestsChartTitle')}</CardTitle>
              <CardDescription>{t('adminDashboard.requestsChartSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-0">
              <ChartSummaryRow
                items={[
                  {
                    label: t('adminDashboard.requestsSummaryTotalLabel'),
                    value: formatWholePointValue(requestTotal),
                  },
                  {
                    label: t('adminDashboard.requestsSummaryFailedLabel'),
                    value: formatWholePointValue(requestFailed),
                  },
                  {
                    label: t('adminDashboard.requestsSummaryFailureRateLabel'),
                    value: formatPercentPointValue(requestFailed / Math.max(1, requestTotal)),
                  },
                  {
                    label: t('adminDashboard.requestsSummaryMedianTotalLabel'),
                    value: formatWholePointValue(median(requestPoints.map((point) => point.total))),
                  },
                  {
                    label: t('adminDashboard.requestsSummaryMedianFailedLabel'),
                    value: formatWholePointValue(median(requestPoints.map((point) => point.failed))),
                  },
                  {
                    label: t('adminDashboard.requestsSummaryMedianSuccessfulLabel'),
                    value: formatWholePointValue(median(requestPoints.map((point) => point.successful))),
                  },
                ]}
              />
              <div className="flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#F08A8A]" />
                  {t('adminDashboard.requestsChartFailedLabel')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#A8E6CF]" />
                  {t('adminDashboard.requestsChartSuccessfulLabel')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#8FB8FF]" />
                  {t('adminDashboard.requestsChartTotalLabel')}
                </span>
              </div>
              <RequestsChart points={requestPoints} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden lg:col-span-1">
            <CardHeader className="gap-3 p-5 pb-3">
              <CardTitle className="text-base">{t('adminDashboard.requestIntensityChartTitle')}</CardTitle>
              <CardDescription>{t('adminDashboard.requestIntensityChartSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-0">
              <ChartSummaryRow
                items={[
                  {
                    label: t('adminDashboard.requestIntensitySummaryAvgLabel'),
                    value: formatPointValue(
                      average(requestIntensityPoints.map((point) => point.avgPerUser)),
                    ),
                  },
                  {
                    label: t('adminDashboard.requestIntensitySummaryP95Label'),
                    value: formatPointValue(
                      average(requestIntensityPoints.map((point) => point.p95PerUser)),
                    ),
                  },
                  {
                    label: t('adminDashboard.requestIntensitySummaryPeakLabel'),
                    value: formatPointValue(
                      Math.max(...requestIntensityPoints.map((point) => point.maxPerUser)),
                    ),
                  },
                  {
                    label: t('adminDashboard.requestIntensitySummaryMedianAvgLabel'),
                    value: formatPointValue(
                      median(requestIntensityPoints.map((point) => point.avgPerUser)),
                    ),
                  },
                  {
                    label: t('adminDashboard.requestIntensitySummaryMedianP95Label'),
                    value: formatPointValue(
                      median(requestIntensityPoints.map((point) => point.p95PerUser)),
                    ),
                  },
                  {
                    label: t('adminDashboard.requestIntensitySummaryMedianPeakLabel'),
                    value: formatPointValue(
                      median(requestIntensityPoints.map((point) => point.maxPerUser)),
                    ),
                  },
                ]}
              />
              <div className="flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#8FB8FF]" />
                  {t('adminDashboard.requestIntensityAvgLabel')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#A8E6CF]" />
                  {t('adminDashboard.requestIntensityMedianLabel')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#F7C7A3]" />
                  {t('adminDashboard.requestIntensityP95Label')}
                </span>
              </div>
              <RequestIntensityChart points={requestIntensityPoints} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="gap-3 p-5 pb-3">
              <CardTitle className="text-base">{t('adminDashboard.retentionChartTitle')}</CardTitle>
              <CardDescription>{t('adminDashboard.retentionChartSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-0">
              <ChartSummaryRow
                items={[
                  {
                    label: t('adminDashboard.retentionSummaryAvgLabel'),
                    value: formatPercentPointValue(
                      average(userMixPoints.map((point) => point.retentionRate)),
                    ),
                  },
                  {
                    label: t('adminDashboard.retentionSummaryMinLabel'),
                    value: formatPercentPointValue(
                      Math.min(...userMixPoints.map((point) => point.retentionRate)),
                    ),
                  },
                  {
                    label: t('adminDashboard.retentionSummaryMaxLabel'),
                    value: formatPercentPointValue(
                      Math.max(...userMixPoints.map((point) => point.retentionRate)),
                    ),
                  },
                  {
                    label: t('adminDashboard.retentionSummaryMedianLabel'),
                    value: formatPercentPointValue(
                      median(userMixPoints.map((point) => point.retentionRate)),
                    ),
                  },
                  {
                    label: t('adminDashboard.retentionSummaryAvgChurnLabel'),
                    value: formatPercentPointValue(
                      average(userMixPoints.map((point) => point.churnRate)),
                    ),
                  },
                  {
                    label: t('adminDashboard.retentionSummaryMedianChurnLabel'),
                    value: formatPercentPointValue(
                      median(userMixPoints.map((point) => point.churnRate)),
                    ),
                  },
                ]}
              />
              <div className="flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#8FB8FF]" />
                  {t('adminDashboard.retentionChartRateLabel')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#F08A8A]" />
                  {t('adminDashboard.retentionChartChurnLabel')}
                </span>
              </div>
              <RetentionRateChart points={userMixPoints} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="gap-3 p-5 pb-3">
              <CardTitle className="text-base">{t('adminDashboard.latencyChartTitle')}</CardTitle>
              <CardDescription>{t('adminDashboard.latencyChartSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-0">
              <ChartSummaryRow
                items={[
                  {
                    label: t('adminDashboard.latencySummaryAvgLabel'),
                    value: formatDurationPointValue(average(latencyPoints.map((point) => point.avg))),
                  },
                  {
                    label: t('adminDashboard.latencySummaryP95Label'),
                    value: formatDurationPointValue(average(latencyPoints.map((point) => point.p95))),
                  },
                  {
                    label: t('adminDashboard.latencySummaryP99Label'),
                    value: formatDurationPointValue(average(latencyPoints.map((point) => point.p99))),
                  },
                  {
                    label: t('adminDashboard.latencySummaryMedianAvgLabel'),
                    value: formatDurationPointValue(median(latencyPoints.map((point) => point.avg))),
                  },
                  {
                    label: t('adminDashboard.latencySummaryMedianP95Label'),
                    value: formatDurationPointValue(median(latencyPoints.map((point) => point.p95))),
                  },
                  {
                    label: t('adminDashboard.latencySummaryMedianP99Label'),
                    value: formatDurationPointValue(median(latencyPoints.map((point) => point.p99))),
                  },
                ]}
              />
              <div className="flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#8FB8FF]" />
                  {t('adminDashboard.latencyAvgLabel')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#F7C7A3]" />
                  {t('adminDashboard.latencyP95Label')}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#D3B3FF]" />
                  {t('adminDashboard.latencyP99Label')}
                </span>
              </div>
              <LatencyChart points={latencyPoints} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
