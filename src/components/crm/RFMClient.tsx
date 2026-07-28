'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { Users, RefreshCw, Loader2, TrendingUp, ShoppingBag, Clock } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import type { RFMSegment } from '@/lib/rfm'

// Re-export pure logic for unit tests
export { scoreMetric, assignSegment, computeRFM } from '@/lib/rfm'

// Dynamic recharts imports
const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false })

interface CustomerRFMRow {
  id: string
  customerId: string
  name: string
  phone: string | null
  email: string | null
  recencyDays: number
  frequencyCount: number
  monetaryTotal: number
  recencyScore: number
  frequencyScore: number
  monetaryScore: number
  rfmScore: number
  segment: RFMSegment
  computedAt: string
}

interface SegmentDist {
  segment: RFMSegment
  count: number
  avgMonetary: number
  pct: number
}

interface SegmentsResponse {
  total: number
  distribution: SegmentDist[]
}

interface Props {
  storeId: string
  currency: string
}

const SEGMENT_CONFIG: Record<RFMSegment, { label: string; color: string; bg: string; desc: string }> = {
  Champions: {
    label: 'Champions',
    color: '#22c55e',
    bg: 'bg-green-500/10',
    desc: 'Bought recently, buy often, spend the most',
  },
  Loyal: {
    label: 'Loyal',
    color: '#3b82f6',
    bg: 'bg-blue-500/10',
    desc: 'Spend well and buy on a regular basis',
  },
  New: {
    label: 'New Customers',
    color: '#a855f7',
    bg: 'bg-purple-500/10',
    desc: 'Bought recently but infrequently',
  },
  AtRisk: {
    label: 'At Risk',
    color: '#f59e0b',
    bg: 'bg-amber-500/10',
    desc: 'Used to buy often but haven\'t lately',
  },
  Lost: {
    label: 'Lost',
    color: '#ef4444',
    bg: 'bg-red-500/10',
    desc: 'Lowest recency, frequency, and spend',
  },
}

function ScoreDot({ score }: { score: number }) {
  const filled = score
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            i <= filled ? 'bg-[var(--primary)]' : 'bg-[var(--border)]',
          )}
        />
      ))}
    </span>
  )
}

function SegmentBadge({ segment }: { segment: RFMSegment }) {
  const cfg = SEGMENT_CONFIG[segment]
  return (
    <span
      className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cfg.bg)}
      style={{ color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

export default function RFMClient({ storeId, currency }: Props) {
  const qc = useQueryClient()
  const [activeSegment, setActiveSegment] = useState<RFMSegment | null>(null)
  const [computing, setComputing] = useState(false)

  const { data: segData, isLoading: segLoading } = useQuery<SegmentsResponse>({
    queryKey: ['rfm-segments', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/rfm/segments?storeId=${storeId}`)
      return await res.json() as any
    },
  })

  const { data: customers = [], isLoading: custLoading } = useQuery<CustomerRFMRow[]>({
    queryKey: ['rfm-customers', storeId, activeSegment],
    queryFn: async () => {
      const url = activeSegment
        ? `/api/rfm?storeId=${storeId}&segment=${activeSegment}`
        : `/api/rfm?storeId=${storeId}`
      const res = await fetch(url)
      return await res.json() as any
    },
  })

  const handleCompute = async () => {
    setComputing(true)
    try {
      const res = await fetch(`/api/rfm/compute?storeId=${storeId}`, { method: 'POST' })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`Computed RFM for ${json.computed} customers`)
      qc.invalidateQueries({ queryKey: ['rfm-segments', storeId] })
      qc.invalidateQueries({ queryKey: ['rfm-customers', storeId] })
    } catch {
      toast.error('Failed to compute RFM')
    } finally {
      setComputing(false)
    }
  }

  const chartData = (segData?.distribution ?? []).map((d) => ({
    name: SEGMENT_CONFIG[d.segment]?.label ?? d.segment,
    count: d.count,
    fill: SEGMENT_CONFIG[d.segment]?.color ?? '#888',
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">RFM Analysis</h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            Segment customers by Recency, Frequency &amp; Monetary value
          </p>
        </div>
        <button
          onClick={handleCompute}
          disabled={computing}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {computing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Recompute All
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(segData?.distribution ?? []).slice(0, 4).map((d) => {
          const cfg = SEGMENT_CONFIG[d.segment]
          return (
            <button
              key={d.segment}
              onClick={() => setActiveSegment(activeSegment === d.segment ? null : d.segment)}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                'border-[var(--border)] bg-[var(--bg-card)]',
                activeSegment === d.segment && 'ring-2 ring-[var(--primary)]',
              )}
            >
              <div className="text-2xl font-bold" style={{ color: cfg.color }}>
                {d.count}
              </div>
              <div className="mt-1 text-xs font-medium text-[var(--text-2)]">{cfg.label}</div>
              <div className="mt-0.5 text-xs text-[var(--text-3)]">{d.pct}% of customers</div>
            </button>
          )
        })}
      </div>

      {/* Chart */}
      {segLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" />
        </div>
      ) : (segData?.total ?? 0) > 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-1)]">Segment Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={36}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-3)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--text-3)' }} allowDecimals={false} />
              <Tooltip
                formatter={(v: any) => [v, 'Customers']}
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <rect key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Segment filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveSegment(null)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            activeSegment === null
              ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
              : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--primary)]',
          )}
        >
          All
        </button>
        {(Object.keys(SEGMENT_CONFIG) as RFMSegment[]).map((seg) => (
          <button
            key={seg}
            onClick={() => setActiveSegment(activeSegment === seg ? null : seg)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              activeSegment === seg
                ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--primary)]',
            )}
          >
            {SEGMENT_CONFIG[seg].label}
          </button>
        ))}
      </div>

      {/* Customer table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
            <Users className="h-4 w-4" />
            {activeSegment
              ? `${SEGMENT_CONFIG[activeSegment].label} Customers`
              : 'All Customers'}
            {customers.length > 0 && (
              <span className="rounded-full bg-[var(--bg-1)] px-2 py-0.5 text-xs text-[var(--text-3)]">
                {customers.length}
              </span>
            )}
          </div>
        </div>

        {custLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" />
          </div>
        ) : customers.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-[var(--text-3)]">
            <TrendingUp className="h-8 w-8 opacity-40" />
            <p className="text-sm">No RFM data yet — click Recompute All to analyse customers</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Segment</th>
                  <th className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3" /> Recency
                    </span>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1">
                      <ShoppingBag className="h-3 w-3" /> Frequency
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right">Monetary</th>
                  <th className="px-4 py-3 text-center">RFM Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--bg-1)]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-1)]">{c.name}</div>
                      {c.phone && (
                        <div className="text-xs text-[var(--text-3)]">{c.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SegmentBadge segment={c.segment} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-[var(--text-2)]">
                          {c.recencyDays}d ago
                        </span>
                        <ScoreDot score={c.recencyScore} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-[var(--text-2)]">
                          {c.frequencyCount}x
                        </span>
                        <ScoreDot score={c.frequencyScore} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-medium text-[var(--text-1)]">
                        {formatCurrency(c.monetaryTotal, currency)}
                      </div>
                      <div className="flex justify-end">
                        <ScoreDot score={c.monetaryScore} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-lg font-bold text-[var(--primary)]">
                        {c.rfmScore}
                      </span>
                      <span className="text-xs text-[var(--text-3)]">/15</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
