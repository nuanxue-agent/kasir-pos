'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, Users, Clock, TrendingUp, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CohortRow {
  cohort: string
  customers: number
  retention: number[] // index 0=M0, 1=M1, ...
}

export interface HeatmapCell {
  hour: number        // 0–23
  dayOfWeek: number   // 0=Sun, 6=Sat
  orderCount: number
  revenue: number
}

export interface PriceSensitivityRow {
  productId: string
  name: string
  baseRevenue: number
  basePriceAvg: number
  qtySold: number
  impact: {
    minus15: number
    minus10: number
    minus5: number
    plus5: number
    plus10: number
    plus15: number
  }
}

interface BusinessIntelligenceClientProps {
  storeId: string
  currency?: string
}

// ── Pure business logic (exported for unit tests) ─────────────────────────────

/** Compute cohort retention matrix from raw rows */
export function buildCohortMatrix(rows: CohortRow[]): CohortRow[] {
  return rows.map(r => ({
    ...r,
    retention: r.retention.map(v => Math.round(v * 10) / 10),
  }))
}

/** Aggregate heatmap cells: compute max orderCount for color scaling */
export function heatmapMax(cells: HeatmapCell[]): number {
  return cells.reduce((m, c) => Math.max(m, c.orderCount), 1)
}

/** Compute revenue impact given base revenue, qty sold, and a price change ratio */
export function calcPriceImpact(baseRevenue: number, qtySold: number, changePct: number): number {
  // Simple model: demand elasticity -1 (1% price increase → 1% qty decrease)
  const priceMultiplier = 1 + changePct / 100
  const demandMultiplier = 1 - changePct / 100 // elasticity = -1
  return Math.round(baseRevenue * priceMultiplier * demandMultiplier * 100) / 100
}

/** Build price sensitivity rows for top products */
export function buildPriceSensitivity(
  products: { productId: string; name: string; baseRevenue: number; basePriceAvg: number; qtySold: number }[],
): PriceSensitivityRow[] {
  return products.map(p => ({
    ...p,
    impact: {
      minus15: calcPriceImpact(p.baseRevenue, p.qtySold, -15),
      minus10: calcPriceImpact(p.baseRevenue, p.qtySold, -10),
      minus5: calcPriceImpact(p.baseRevenue, p.qtySold, -5),
      plus5: calcPriceImpact(p.baseRevenue, p.qtySold, 5),
      plus10: calcPriceImpact(p.baseRevenue, p.qtySold, 10),
      plus15: calcPriceImpact(p.baseRevenue, p.qtySold, 15),
    },
  }))
}

/** Return retention cell color class based on percentage */
export function retentionColor(pct: number): string {
  if (pct >= 70) return 'bg-emerald-500 text-white'
  if (pct >= 50) return 'bg-emerald-400 text-white'
  if (pct >= 30) return 'bg-yellow-400 text-gray-900'
  if (pct >= 10) return 'bg-orange-400 text-white'
  if (pct > 0) return 'bg-red-400 text-white'
  return 'bg-[var(--bg-card)] text-[var(--text-muted)]'
}

/** Compute heatmap cell bg opacity from 0–1 */
export function heatmapOpacity(count: number, max: number): number {
  if (max === 0) return 0
  return Math.round((count / max) * 10) / 10
}

// ── Day/Hour labels ───────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12am' : i < 12 ? `${i}am` : i === 12 ? '12pm' : `${i - 12}pm`,
)

// ── Tab types ─────────────────────────────────────────────────────────────────

type Tab = 'cohort' | 'heatmap' | 'price'

// ── Cohort table ──────────────────────────────────────────────────────────────

function CohortTable({ storeId }: { storeId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bi-cohort', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/cohort?storeId=${storeId}&months=6`)
      if (!res.ok) throw new Error('Failed to load cohort data')
      return res.json() as Promise<{ rows: CohortRow[] }>
    },
  })

  if (isLoading) return <div className="text-[var(--text-muted)] py-8 text-center">Loading cohort data…</div>
  if (isError) return (
    <div className="flex items-center gap-2 text-red-500 py-8">
      <AlertCircle className="h-4 w-4" /> Failed to load cohort data
    </div>
  )

  const rows = buildCohortMatrix(data?.rows ?? [])
  const maxPeriods = rows.reduce((m, r) => Math.max(m, r.retention.length), 0)

  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-[var(--text-muted)] mb-3">
        Each row shows the % of customers from that signup month who made a purchase in M+0, M+1, M+2, etc.
      </p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left">
            <th className="px-3 py-2 text-[var(--text-muted)] font-medium whitespace-nowrap">Cohort Month</th>
            <th className="px-3 py-2 text-[var(--text-muted)] font-medium">Customers</th>
            {Array.from({ length: maxPeriods }, (_, i) => (
              <th key={i} className="px-3 py-2 text-[var(--text-muted)] font-medium text-center">
                {i === 0 ? 'M+0' : `M+${i}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={maxPeriods + 2} className="px-3 py-8 text-center text-[var(--text-muted)]">
                No cohort data available
              </td>
            </tr>
          )}
          {rows.map(row => (
            <tr key={row.cohort} className="border-t border-[var(--border)]">
              <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">{row.cohort}</td>
              <td className="px-3 py-2 text-[var(--text-muted)]">{row.customers.toLocaleString()}</td>
              {row.retention.map((pct, i) => (
                <td key={i} className="px-1 py-1 text-center">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${retentionColor(pct)}`}>
                    {pct > 0 ? `${pct.toFixed(1)}%` : '—'}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Heatmap grid ──────────────────────────────────────────────────────────────

function HeatmapGrid({ storeId }: { storeId: string }) {
  const [metric, setMetric] = useState<'orders' | 'revenue'>('orders')

  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bi-heatmap', storeId, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/reports/heatmap?storeId=${storeId}&from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Failed to load heatmap data')
      return res.json() as Promise<{ cells: HeatmapCell[] }>
    },
  })

  const cells = data?.cells ?? []

  // Build lookup: dayOfWeek → hour → cell
  const lookup = useMemo(() => {
    const m = new Map<string, HeatmapCell>()
    for (const c of cells) {
      m.set(`${c.dayOfWeek}|${c.hour}`, c)
    }
    return m
  }, [cells])

  const maxVal = useMemo(() => {
    if (metric === 'orders') return heatmapMax(cells)
    return cells.reduce((m, c) => Math.max(m, c.revenue), 1)
  }, [cells, metric])

  if (isLoading) return <div className="text-[var(--text-muted)] py-8 text-center">Loading heatmap…</div>
  if (isError) return (
    <div className="flex items-center gap-2 text-red-500 py-8">
      <AlertCircle className="h-4 w-4" /> Failed to load heatmap data
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-[var(--text-muted)]">Metric:</span>
        <button
          onClick={() => setMetric('orders')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${metric === 'orders' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}
        >
          Orders
        </button>
        <button
          onClick={() => setMetric('revenue')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${metric === 'revenue' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}
        >
          Revenue
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1 text-[var(--text-muted)]" />
              {HOUR_LABELS.map((h, i) => (
                <th key={i} className="px-1 py-1 text-[var(--text-muted)] font-normal w-8 text-center">
                  {i % 3 === 0 ? h : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((day, dow) => (
              <tr key={dow}>
                <td className="px-2 py-0.5 text-[var(--text-muted)] font-medium whitespace-nowrap pr-3">{day}</td>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = lookup.get(`${dow}|${hour}`)
                  const val = cell ? (metric === 'orders' ? cell.orderCount : cell.revenue) : 0
                  const opacity = heatmapOpacity(val, maxVal)
                  const title = cell
                    ? `${day} ${HOUR_LABELS[hour]}: ${cell.orderCount} orders, ${formatCurrency(cell.revenue)}`
                    : `${day} ${HOUR_LABELS[hour]}: no data`
                  return (
                    <td key={hour} className="p-0.5" title={title}>
                      <div
                        className="w-7 h-7 rounded-sm"
                        style={{
                          backgroundColor: `rgba(99, 102, 241, ${opacity})`,
                          border: '1px solid var(--border)',
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-[var(--text-muted)]">Low</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(o => (
            <div
              key={o}
              className="w-5 h-5 rounded-sm"
              style={{ backgroundColor: `rgba(99, 102, 241, ${o})`, border: '1px solid var(--border)' }}
            />
          ))}
          <span className="text-xs text-[var(--text-muted)]">High</span>
        </div>
      </div>
    </div>
  )
}

// ── Price sensitivity ─────────────────────────────────────────────────────────

function PriceSensitivityPanel({ storeId, currency }: { storeId: string; currency: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bi-price-sensitivity', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/analytics?storeId=${storeId}&limit=10`)
      if (!res.ok) throw new Error('Failed to load product data')
      return res.json() as Promise<{ products: { id: string; name: string; revenue: number; qty: number; avgPrice: number }[] }>
    },
  })

  const rows = useMemo(() => {
    const products = (data?.products ?? []).slice(0, 10).map(p => ({
      productId: p.id,
      name: p.name,
      baseRevenue: p.revenue ?? 0,
      basePriceAvg: p.avgPrice ?? 0,
      qtySold: p.qty ?? 0,
    }))
    return buildPriceSensitivity(products)
  }, [data])

  if (isLoading) return <div className="text-[var(--text-muted)] py-8 text-center">Loading products…</div>
  if (isError) return (
    <div className="flex items-center gap-2 text-red-500 py-8">
      <AlertCircle className="h-4 w-4" /> Failed to load product data
    </div>
  )

  const deltas = [
    { key: 'minus15', label: '−15%', negative: true },
    { key: 'minus10', label: '−10%', negative: true },
    { key: 'minus5', label: '−5%', negative: true },
    { key: 'plus5', label: '+5%', negative: false },
    { key: 'plus10', label: '+10%', negative: false },
    { key: 'plus15', label: '+15%', negative: false },
  ] as const

  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Estimated revenue impact of price changes (assumes unit demand elasticity −1).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-2 text-[var(--text-muted)] font-medium">Product</th>
              <th className="px-3 py-2 text-[var(--text-muted)] font-medium text-right">Base Revenue</th>
              {deltas.map(d => (
                <th key={d.key} className={`px-3 py-2 font-medium text-right ${d.negative ? 'text-red-400' : 'text-emerald-500'}`}>
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--text-muted)]">
                  No product data available
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.productId} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium max-w-[200px] truncate">{row.name}</td>
                <td className="px-3 py-2 text-right font-mono text-[var(--text-muted)]">
                  {formatCurrency(row.baseRevenue, currency)}
                </td>
                {deltas.map(d => {
                  const val = row.impact[d.key]
                  const diff = val - row.baseRevenue
                  const diffPct = row.baseRevenue > 0 ? (diff / row.baseRevenue) * 100 : 0
                  return (
                    <td key={d.key} className="px-3 py-2 text-right font-mono">
                      <div className="text-xs">{formatCurrency(val, currency)}</div>
                      <div className={`text-xs ${diff >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                        {diff >= 0 ? '+' : ''}{diffPct.toFixed(1)}%
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BusinessIntelligenceClient({ storeId, currency = 'IDR' }: BusinessIntelligenceClientProps) {
  const [tab, setTab] = useState<Tab>('cohort')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'cohort', label: 'Cohort Retention', icon: <Users className="h-4 w-4" /> },
    { id: 'heatmap', label: 'Hour of Day', icon: <Clock className="h-4 w-4" /> },
    { id: 'price', label: 'Price Sensitivity', icon: <TrendingUp className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
          <BarChart2 className="h-5 w-5 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Business Intelligence</h1>
          <p className="text-sm text-[var(--text-muted)]">Advanced analytics: cohort retention, activity heatmap, price sensitivity</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--bg-hover)] p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
        {tab === 'cohort' && <CohortTable storeId={storeId} />}
        {tab === 'heatmap' && <HeatmapGrid storeId={storeId} />}
        {tab === 'price' && <PriceSensitivityPanel storeId={storeId} currency={currency} />}
      </div>
    </div>
  )
}
