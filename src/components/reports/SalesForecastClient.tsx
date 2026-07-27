'use client'

import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { TrendingUp, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// Dynamic recharts imports — keep heavy chart components out of initial bundle
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), {
  ssr: false,
})
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false })
const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false })
const ReferenceLine = dynamic(() => import('recharts').then(m => m.ReferenceLine), { ssr: false })
const ComposedChart = dynamic(() => import('recharts').then(m => m.ComposedChart), { ssr: false })

interface SalesForecastClientProps {
  storeId: string
  currency: string
}

interface DailyRevenue {
  date: string
  revenue: number
}

interface ForecastPoint {
  date: string
  actual: number | null
  forecast: number
  lower: number
  upper: number
  isForecast: boolean
}

// ── Pure forecast utilities (also exported for unit tests) ───────────────────

/** 7-day simple moving average over a series of values */
export function movingAverage(values: number[], window: number = 7): number[] {
  return values.map((_, i) => {
    if (i < window - 1) return 0
    const slice = values.slice(i - window + 1, i + 1)
    return slice.reduce((a, b) => a + b, 0) / window
  })
}

/** Simple linear regression — returns { slope, intercept } */
export function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length
  if (n === 0) return { slope: 0, intercept: 0 }
  const xs = Array.from({ length: n }, (_, i) => i)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanX
  return { slope, intercept }
}

/** Predict next `ahead` values using linear regression on `values` */
export function forecastLinear(values: number[], ahead: number): number[] {
  const { slope, intercept } = linearRegression(values)
  const n = values.length
  return Array.from({ length: ahead }, (_, i) => Math.max(0, slope * (n + i) + intercept))
}

/** Confidence interval bounds at ±`pct` fraction (0.15 = 15%) */
export function confidenceBounds(
  value: number,
  pct: number = 0.15,
): { lower: number; upper: number } {
  return { lower: Math.max(0, value * (1 - pct)), upper: value * (1 + pct) }
}

/** CLV = avgOrderValue × avgOrdersPerMonth × avgMonthsActive */
export function calcCLV(
  avgOrderValue: number,
  avgOrdersPerMonth: number,
  avgMonthsActive: number,
): number {
  return avgOrderValue * avgOrdersPerMonth * avgMonthsActive
}

// ── Forecast builder ─────────────────────────────────────────────────────────

function buildForecastData(history: DailyRevenue[], forecastDays: number = 7): ForecastPoint[] {
  const revenues = history.map(d => d.revenue)
  const ma = movingAverage(revenues, 7)
  const lastMA = revenues.length >= 7 ? ma[ma.length - 1] : (revenues[revenues.length - 1] ?? 0)
  const futureLinear = forecastLinear(revenues, forecastDays)

  // Blend MA and linear regression (50/50) for smoother forecast
  const lastDate = history.length > 0 ? new Date(history[history.length - 1].date) : new Date()

  const actualPoints: ForecastPoint[] = history.map(d => {
    const { lower, upper } = confidenceBounds(d.revenue)
    return {
      date: d.date,
      actual: d.revenue,
      forecast: d.revenue,
      lower,
      upper,
      isForecast: false,
    }
  })

  const forecastPoints: ForecastPoint[] = Array.from({ length: forecastDays }, (_, i) => {
    const d = new Date(lastDate)
    d.setDate(d.getDate() + i + 1)
    const blended = (lastMA + futureLinear[i]) / 2
    const { lower, upper } = confidenceBounds(blended)
    return {
      date: d.toISOString().slice(0, 10),
      actual: null,
      forecast: Math.round(blended),
      lower: Math.round(lower),
      upper: Math.round(upper),
      isForecast: true,
    }
  })

  return [...actualPoints, ...forecastPoints]
}

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] ${className}`}
    />
  )
}

export function SalesForecastClient({ storeId, currency }: SalesForecastClientProps) {
  const {
    data: history,
    isLoading,
    isError,
  } = useQuery<DailyRevenue[]>({
    queryKey: ['reports-forecast', storeId],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/forecast?${new URLSearchParams({ storeId, days: '30' })}`,
      )
      if (!res.ok) throw new Error('Failed to fetch forecast data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const forecastData = history && history.length > 0 ? buildForecastData(history, 7) : []
  const forecastOnly = forecastData.filter(d => d.isForecast)
  const totalForecast7d = forecastOnly.reduce((s, d) => s + d.forecast, 0)
  const avgForecast = forecastOnly.length > 0 ? totalForecast7d / forecastOnly.length : 0

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Sales Forecast</h1>
        <p className="mt-0.5 text-sm text-[var(--text-3)]">
          7-day revenue forecast based on last 30 days · linear regression + moving average blend
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <p className="mb-1 text-xs font-medium text-[var(--text-3)]">Forecast 7-Day Total</p>
              <p className="text-2xl font-bold text-[var(--text-1)]">
                {formatCurrency(totalForecast7d, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <p className="mb-1 text-xs font-medium text-[var(--text-3)]">Avg Daily Forecast</p>
              <p className="text-2xl font-bold text-amber-500">
                {formatCurrency(avgForecast, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <p className="mb-1 text-xs font-medium text-[var(--text-3)]">Confidence Band</p>
              <p className="text-2xl font-bold text-[var(--text-1)]">±15%</p>
              <p className="text-xs text-[var(--text-3)]">around each forecast point</p>
            </div>
          </>
        )}
      </div>

      {/* Main chart */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Actual vs Forecast Revenue</h3>
        </div>

        {isLoading ? (
          <Skeleton className="h-64" />
        ) : isError ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            Failed to load forecast data
          </div>
        ) : forecastData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-[var(--text-3)]">
            No data available for forecasting
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={forecastData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#a8a29e' }}
                tickLine={false}
                axisLine={false}
                interval={4}
                tickFormatter={v => v.slice(5)} // MM-DD
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#a8a29e' }}
                tickLine={false}
                axisLine={false}
                width={50}
                tickFormatter={v =>
                  v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1000
                      ? `${(v / 1000).toFixed(0)}K`
                      : String(v)
                }
              />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value), currency),
                  name === 'actual'
                    ? 'Actual'
                    : name === 'forecast'
                      ? 'Forecast'
                      : name === 'upper'
                        ? 'Upper bound'
                        : 'Lower bound',
                ]}
                labelFormatter={label => `Date: ${label}`}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e7e5e4',
                  fontSize: 12,
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                }}
              />
              <Legend
                formatter={value => (
                  <span className="text-xs text-[var(--text-2)]">
                    {value === 'actual'
                      ? 'Actual Revenue'
                      : value === 'forecast'
                        ? 'Forecast'
                        : value === 'upper'
                          ? 'Upper Bound (+15%)'
                          : 'Lower Bound (-15%)'}
                  </span>
                )}
                iconSize={8}
              />
              {/* Confidence band — upper */}
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill="#fef3c7"
                fillOpacity={0.6}
                dot={false}
                activeDot={false}
                legendType="none"
              />
              {/* Confidence band — lower (covers back to baseline) */}
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill="#ffffff"
                fillOpacity={1}
                dot={false}
                activeDot={false}
                legendType="none"
              />
              {/* Forecast line */}
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 4 }}
              />
              {/* Actual line */}
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
              {/* Today divider */}
              <ReferenceLine
                x={todayStr}
                stroke="#d1d5db"
                strokeDasharray="4 2"
                label={{ value: 'Today', fontSize: 10, fill: '#9ca3af', position: 'top' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Forecast table */}
      {!isLoading && forecastOnly.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-1)]">7-Day Forecast Detail</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="pb-2 text-left text-xs font-semibold text-[var(--text-3)]">
                    Date
                  </th>
                  <th className="pb-2 text-right text-xs font-semibold text-[var(--text-3)]">
                    Forecast
                  </th>
                  <th className="pb-2 text-right text-xs font-semibold text-[var(--text-3)]">
                    Lower (−15%)
                  </th>
                  <th className="pb-2 text-right text-xs font-semibold text-[var(--text-3)]">
                    Upper (+15%)
                  </th>
                </tr>
              </thead>
              <tbody>
                {forecastOnly.map(row => (
                  <tr
                    key={row.date}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-subtle)]"
                  >
                    <td className="py-2 text-[var(--text-2)]">{row.date}</td>
                    <td className="py-2 text-right font-semibold text-amber-500">
                      {formatCurrency(row.forecast, currency)}
                    </td>
                    <td className="py-2 text-right text-[var(--text-3)]">
                      {formatCurrency(row.lower, currency)}
                    </td>
                    <td className="py-2 text-right text-[var(--text-3)]">
                      {formatCurrency(row.upper, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
