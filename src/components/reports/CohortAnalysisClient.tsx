'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { Users, TrendingDown, DollarSign, RefreshCw, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { calcRetentionRate, calcChurnRates, normalizeHeatmap } from '@/lib/cohort-analysis'

const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

// Re-export pure functions for unit testing
export { calcRetentionRate, calcChurnRates, normalizeHeatmap }
export { toCohortMonth, periodOffset, calcLTVByCohort, buildCohortGrid } from '@/lib/cohort-analysis'

interface CohortDataRow {
  id: string
  storeId: string
  cohortMonth: string
  periodOffset: number
  customers: number
  retained: number
  retentionRate: number
  revenue: number
  computedAt: string
}

interface LTVRow {
  cohortMonth: string
  customers: number
  cumulativeRevenue: number
  periods: number
  ltv: number
  avgMonthlyRevenue: number
}

interface CohortAnalysisClientProps {
  storeId: string
  currency: string
}

// Heatmap color: green gradient based on retention rate 0–100
function heatColor(rate: number, normalized: number): string {
  if (rate === 0) return 'var(--bg-2)'
  // period-0 is always ~100%, use full green
  const alpha = 0.15 + normalized * 0.75
  return `rgba(34, 197, 94, ${alpha.toFixed(2)})`
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'var(--primary)',
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="flex items-center gap-3 mb-2">
        <div className="rounded-lg p-2" style={{ background: 'var(--bg-2)' }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-sm" style={{ color: 'var(--text-2)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{sub}</p>}
    </div>
  )
}

export default function CohortAnalysisClient({ storeId, currency }: CohortAnalysisClientProps) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'heatmap' | 'ltv' | 'churn'>('heatmap')

  // Fetch cohort grid
  const { data: gridData, isLoading: gridLoading } = useQuery({
    queryKey: ['cohort-grid', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/cohort-analysis?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch cohort data')
      return (await res.json()) as any
    },
  })

  // Fetch LTV data
  const { data: ltvData, isLoading: ltvLoading } = useQuery({
    queryKey: ['cohort-ltv', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/cohort-analysis/ltv?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch LTV data')
      return (await res.json()) as LTVRow[]
    },
  })

  // Recompute mutation
  const recompute = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/reports/cohort-analysis/compute?storeId=${storeId}`, {
        method: 'POST',
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: (data) => {
      toast.success(`Recomputed ${data.computed} cohort cells across ${data.cohorts} cohorts`)
      qc.invalidateQueries({ queryKey: ['cohort-grid', storeId] })
      qc.invalidateQueries({ queryKey: ['cohort-ltv', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rows: CohortDataRow[] = gridData?.rows ?? []
  const cohorts: string[] = gridData?.cohorts ?? []
  const maxPeriod: number = gridData?.maxPeriod ?? 0

  // Build cell lookup
  const cellLookup: Record<string, Record<number, CohortDataRow>> = {}
  for (const r of rows) {
    if (!cellLookup[r.cohortMonth]) cellLookup[r.cohortMonth] = {}
    cellLookup[r.cohortMonth][r.periodOffset] = r
  }

  // Normalize for heatmap
  const normalized = normalizeHeatmap(rows)
  const normLookup: Record<string, Record<number, number>> = {}
  for (const r of normalized) {
    if (!normLookup[r.cohortMonth]) normLookup[r.cohortMonth] = {}
    normLookup[r.cohortMonth][r.periodOffset] = r.normalized
  }

  // Summary stats
  const totalCohorts = cohorts.length
  const avgRetention1m =
    rows.filter(r => r.periodOffset === 1).length > 0
      ? rows.filter(r => r.periodOffset === 1).reduce((s, r) => s + r.retentionRate, 0) /
        rows.filter(r => r.periodOffset === 1).length
      : 0
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const avgLTV =
    ltvData && ltvData.length > 0
      ? ltvData.reduce((s: number, r: LTVRow) => s + r.ltv, 0) / ltvData.length
      : 0

  // Churn trend for chart (average churn per period offset across all cohorts)
  const churnByPeriod: Record<number, { sum: number; count: number }> = {}
  for (const r of rows) {
    if (!churnByPeriod[r.periodOffset]) churnByPeriod[r.periodOffset] = { sum: 0, count: 0 }
    churnByPeriod[r.periodOffset].sum += 100 - r.retentionRate
    churnByPeriod[r.periodOffset].count++
  }
  const churnTrend = Object.entries(churnByPeriod)
    .map(([p, { sum, count }]) => ({
      period: `M+${p}`,
      churnRate: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    }))
    .sort((a, b) => {
      const pa = parseInt(a.period.replace('M+', ''))
      const pb = parseInt(b.period.replace('M+', ''))
      return pa - pb
    })

  const isLoading = gridLoading || ltvLoading

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Cohort Analysis</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Track customer retention, lifetime value, and churn by acquisition cohort
          </p>
        </div>
        <button
          onClick={() => recompute.mutate()}
          disabled={recompute.isPending}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
          style={{ background: 'var(--primary)', color: '#fff' }}
        >
          {recompute.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Recompute
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard icon={Users} label="Total Cohorts" value={String(totalCohorts)} sub="acquisition months" />
        <SummaryCard
          icon={TrendingDown}
          label="Avg M+1 Retention"
          value={`${avgRetention1m.toFixed(1)}%`}
          sub="month-1 average"
          color="#22c55e"
        />
        <SummaryCard
          icon={DollarSign}
          label="Total Revenue"
          value={formatCurrency(totalRevenue, currency)}
          sub="across all cohorts"
          color="#3b82f6"
        />
        <SummaryCard
          icon={DollarSign}
          label="Avg LTV"
          value={formatCurrency(avgLTV, currency)}
          sub="per customer"
          color="#a855f7"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--bg-2)' }}>
        {(['heatmap', 'ltv', 'churn'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition',
              activeTab === tab
                ? 'shadow-sm'
                : 'opacity-60 hover:opacity-80',
            )}
            style={
              activeTab === tab
                ? { background: 'var(--bg-card)', color: 'var(--text-1)' }
                : { color: 'var(--text-2)' }
            }
          >
            {tab === 'heatmap' ? 'Retention Heatmap' : tab === 'ltv' ? 'LTV by Cohort' : 'Churn Trend'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
        </div>
      ) : rows.length === 0 ? (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
        >
          <Users size={40} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--text-3)' }} />
          <p className="font-medium" style={{ color: 'var(--text-2)' }}>No cohort data yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Click <strong>Recompute</strong> to generate cohort data from your orders.
          </p>
        </div>
      ) : (
        <>
          {/* Retention Heatmap */}
          {activeTab === 'heatmap' && (
            <div
              className="rounded-xl border overflow-auto"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
            >
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Retention Heatmap</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  Each row = acquisition cohort. Each column = months since first purchase.
                </p>
              </div>
              <div className="p-4">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr>
                      <th
                        className="px-3 py-2 text-left font-medium sticky left-0"
                        style={{ color: 'var(--text-2)', background: 'var(--bg-card)', minWidth: 90 }}
                      >
                        Cohort
                      </th>
                      <th className="px-2 py-2 text-center font-medium" style={{ color: 'var(--text-2)', minWidth: 60 }}>
                        Size
                      </th>
                      {Array.from({ length: maxPeriod + 1 }, (_, i) => (
                        <th
                          key={i}
                          className="px-2 py-2 text-center font-medium"
                          style={{ color: 'var(--text-2)', minWidth: 56 }}
                        >
                          M+{i}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map(cohort => {
                      const cohortSize = cellLookup[cohort]?.[0]?.customers ?? 0
                      return (
                        <tr key={cohort} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td
                            className="px-3 py-2 font-medium sticky left-0"
                            style={{ color: 'var(--text-1)', background: 'var(--bg-card)' }}
                          >
                            {cohort}
                          </td>
                          <td className="px-2 py-2 text-center" style={{ color: 'var(--text-2)' }}>
                            {cohortSize}
                          </td>
                          {Array.from({ length: maxPeriod + 1 }, (_, i) => {
                            const cell = cellLookup[cohort]?.[i]
                            const norm = normLookup[cohort]?.[i] ?? 0
                            const rate = cell?.retentionRate ?? 0
                            return (
                              <td key={i} className="px-1 py-1 text-center">
                                {cell ? (
                                  <div
                                    className="rounded px-1 py-1 text-xs font-medium"
                                    style={{
                                      background: heatColor(rate, norm),
                                      color: rate > 50 ? '#14532d' : 'var(--text-1)',
                                    }}
                                    title={`${cohort} M+${i}: ${cell.retained}/${cell.customers} (${rate.toFixed(1)}%)`}
                                  >
                                    {rate.toFixed(0)}%
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-3)' }}>—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LTV by Cohort */}
          {activeTab === 'ltv' && (
            <div
              className="rounded-xl border"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
            >
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>LTV by Cohort</h2>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                      {['Cohort', 'Customers', 'Cumulative Revenue', 'LTV', 'Avg Monthly Rev', 'Periods'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(ltvData ?? []).map((row: LTVRow) => (
                      <tr key={row.cohortMonth} className="border-t hover:opacity-80 transition" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>{row.cohortMonth}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{row.customers}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(row.cumulativeRevenue, currency)}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: 'var(--primary)' }}>{formatCurrency(row.ltv, currency)}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(row.avgMonthlyRevenue, currency)}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-3)' }}>{row.periods}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Churn Trend */}
          {activeTab === 'churn' && (
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
            >
              <h2 className="font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Average Churn Rate by Period</h2>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={churnTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                  <YAxis
                    tickFormatter={(v: any) => `${v}%`}
                    tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'Avg Churn Rate']}
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                    labelStyle={{ color: 'var(--text-1)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="churnRate"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-3)' }}>
                Average churn rate across all cohorts at each period offset
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
