'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { Package, TrendingUp, TrendingDown, Zap, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// Dynamic recharts imports — avoids SSR issues
const ComposedChart = dynamic(() => import('recharts').then(m => m.ComposedChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), {
  ssr: false,
})
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false })
const ReferenceLine = dynamic(() => import('recharts').then(m => m.ReferenceLine), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

export type ABCClass = 'A' | 'B' | 'C'

export interface ProductMetric {
  productId: string
  name: string
  totalRevenue: number
  qtySold: number
  percentOfTotal: number
  abcClass: ABCClass
  turnoverRate: number
  avgStock: number
}

interface ProductAnalyticsClientProps {
  storeId: string
  currency: string
}

type DateRange = 'week' | 'month' | 'quarter' | 'custom'

// ── Pure business-logic helpers (also exported for tests) ─────────────────────

/**
 * Assigns ABC classes to a list of products already sorted by totalRevenue DESC.
 * A = top products whose cumulative revenue reaches 80%
 * B = next products reaching 95% cumulative
 * C = the rest
 */
export function assignABCClasses(
  products: Pick<ProductMetric, 'totalRevenue'>[],
): ABCClass[] {
  const total = products.reduce((s, p) => s + p.totalRevenue, 0)
  if (total === 0) return products.map(() => 'C')

  let cumulative = 0
  return products.map(p => {
    cumulative += p.totalRevenue
    const pct = (cumulative / total) * 100
    if (pct <= 80) return 'A'
    if (pct <= 95) return 'B'
    return 'C'
  })
}

/**
 * Computes cumulative revenue % for each product (sorted DESC by revenue).
 * Returns array parallel to input.
 */
export function calcParetoCumulative(revenues: number[]): number[] {
  const total = revenues.reduce((s, r) => s + r, 0)
  if (total === 0) return revenues.map(() => 0)
  let cum = 0
  return revenues.map(r => {
    cum += r
    return Math.round((cum / total) * 10000) / 100 // 2 decimal places
  })
}

/**
 * Turnover rate = qtySold / avgStock.
 * Returns 0 when avgStock is 0 to avoid division by zero.
 */
export function calcTurnoverRate(qtySold: number, avgStock: number): number {
  if (avgStock <= 0) return 0
  return Math.round((qtySold / avgStock) * 100) / 100
}

/**
 * Identifies slow movers: products with qtySold === 0 in the period.
 */
export function detectSlowMovers(products: ProductMetric[]): ProductMetric[] {
  return products.filter(p => p.qtySold === 0)
}

/**
 * Returns the top N fast movers sorted by qtySold DESC.
 */
export function getTopFastMovers(products: ProductMetric[], n = 10): ProductMetric[] {
  return [...products].sort((a, b) => b.qtySold - a.qtySold).slice(0, n)
}

// ── Date range helper ─────────────────────────────────────────────────────────

function getDateRange(range: DateRange, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date()
  switch (range) {
    case 'week': {
      const w = new Date(now)
      w.setDate(w.getDate() - 7)
      return { from: w.toISOString(), to: now.toISOString() }
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: m.toISOString(), to: now.toISOString() }
    }
    case 'quarter': {
      const q = new Date(now)
      q.setDate(q.getDate() - 90)
      return { from: q.toISOString(), to: now.toISOString() }
    }
    case 'custom':
      return custom
    default:
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() }
  }
}

const RANGE_BTNS: { value: DateRange; label: string }[] = [
  { value: 'week', label: '7D' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: '90D' },
  { value: 'custom', label: 'Custom' },
]

const ABC_BADGE: Record<ABCClass, string> = {
  A: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  B: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  C: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductAnalyticsClient({ storeId, currency }: ProductAnalyticsClientProps) {
  const [range, setRange] = useState<DateRange>('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [activeTab, setActiveTab] = useState<'table' | 'pareto' | 'movers'>('table')

  const { from, to } = getDateRange(range, custom)

  const { data: products = [], isLoading } = useQuery<ProductMetric[]>({
    queryKey: ['reports-products', storeId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId, from, to })
      const res = await fetch(`/api/reports/products?${params}`)
      if (!res.ok) throw new Error('Failed to fetch product analytics')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })

  // Pareto chart data (top 20 for readability)
  const paretoData = products.slice(0, 20).map((p, i) => ({
    name: p.name.length > 14 ? p.name.slice(0, 12) + '…' : p.name,
    revenue: p.totalRevenue,
    cumulative: calcParetoCumulative(products.map(x => x.totalRevenue))[i],
  }))

  const slowMovers = detectSlowMovers(products)
  const fastMovers = getTopFastMovers(products, 10)

  const classCount = { A: 0, B: 0, C: 0 }
  products.forEach(p => classCount[p.abcClass]++)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Product Analytics</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            ABC classification, Pareto analysis &amp; product turnover
          </p>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          {RANGE_BTNS.map(btn => (
            <button
              key={btn.value}
              onClick={() => setRange(btn.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                range === btn.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {range === 'custom' && (
        <div className="flex gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">From</label>
            <input
              type="date"
              value={custom.from.slice(0, 10)}
              onChange={e => setCustom(c => ({ ...c, from: e.target.value ? new Date(e.target.value).toISOString() : '' }))}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">To</label>
            <input
              type="date"
              value={custom.to.slice(0, 10)}
              onChange={e => setCustom(c => ({ ...c, to: e.target.value ? new Date(e.target.value).toISOString() : '' }))}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<Package className="h-5 w-5 text-indigo-500" />} label="Total Products" value={products.length} />
        <StatCard
          icon={<span className="inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold bg-emerald-100 text-emerald-700">A</span>}
          label="Class A"
          value={classCount.A}
          sub="≤80% revenue"
        />
        <StatCard
          icon={<span className="inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold bg-amber-100 text-amber-700">B</span>}
          label="Class B"
          value={classCount.B}
          sub="80–95% revenue"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5 text-rose-400" />}
          label="Slow Movers"
          value={slowMovers.length}
          sub="0 sales in period"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {(['table', 'pareto', 'movers'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab === 'table' ? 'All Products' : tab === 'pareto' ? 'Pareto Chart' : 'Fast / Slow Movers'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Tab: All Products table ── */}
          {activeTab === 'table' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {['Product', 'Revenue', 'Qty Sold', '% of Total', 'Turnover Rate', 'Class'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No data for this period
                      </td>
                    </tr>
                  ) : (
                    products.map(p => (
                      <tr key={p.productId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{p.name}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {formatCurrency(p.totalRevenue, currency)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {p.qtySold.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {p.percentOfTotal.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {p.turnoverRate > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                              {p.turnoverRate.toFixed(2)}x
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ABC_BADGE[p.abcClass]}`}
                          >
                            {p.abcClass}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Tab: Pareto chart ── */}
          {activeTab === 'pareto' && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-1 text-base font-semibold text-slate-800 dark:text-white">
                Pareto Chart — Top 20 Products
              </h2>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                Bars = individual revenue · Line = cumulative % of total revenue
              </p>
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={paretoData} margin={{ top: 4, right: 24, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v: number) => formatCurrency(v, currency)}
                    width={80}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === 'revenue'
                        ? [formatCurrency(Number(value), currency), 'Revenue']
                        : [`${Number(value).toFixed(1)}%`, 'Cumulative %']
                    }
                  />
                  <Legend />
                  <ReferenceLine yAxisId="right" y={80} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: '80%', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                  <Bar yAxisId="left" dataKey="revenue" name="revenue" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulative"
                    name="cumulative"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Tab: Fast / Slow movers ── */}
          {activeTab === 'movers' && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Fast movers */}
              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <Zap className="h-4 w-4 text-emerald-500" />
                  <h2 className="font-semibold text-slate-800 dark:text-white">Top 10 Fast Movers</h2>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {fastMovers.length === 0 ? (
                    <li className="px-5 py-8 text-center text-sm text-slate-400">No data</li>
                  ) : (
                    fastMovers.map((p, i) => (
                      <li key={p.productId} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-right text-xs font-bold text-slate-400">{i + 1}</span>
                          <span className="text-sm font-medium text-slate-800 dark:text-white">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <span className="text-sm text-slate-600 dark:text-slate-300">
                            {p.qtySold.toLocaleString()} units
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ABC_BADGE[p.abcClass]}`}>
                            {p.abcClass}
                          </span>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {/* Slow movers */}
              <div className="rounded-xl border border-rose-100 bg-white dark:border-rose-900/30 dark:bg-slate-900">
                <div className="flex items-center gap-2 border-b border-rose-100 px-5 py-4 dark:border-rose-900/30">
                  <TrendingDown className="h-4 w-4 text-rose-400" />
                  <h2 className="font-semibold text-slate-800 dark:text-white">Slow Movers (0 sales)</h2>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {slowMovers.length === 0 ? (
                    <li className="px-5 py-8 text-center text-sm text-slate-400">
                      No slow movers — great!
                    </li>
                  ) : (
                    slowMovers.slice(0, 20).map(p => (
                      <li key={p.productId} className="flex items-center justify-between px-5 py-3">
                        <span className="text-sm font-medium text-slate-800 dark:text-white">{p.name}</span>
                        <span className="text-xs text-rose-500">No sales this period</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Small helper component ─────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}
