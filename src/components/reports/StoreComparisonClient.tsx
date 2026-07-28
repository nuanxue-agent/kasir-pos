'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Users,
  Award,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// Dynamic recharts imports — avoids SSR issues
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), {
  ssr: false,
})
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateRange = 'today' | 'week' | 'month' | 'custom'

export interface StoreMetrics {
  storeId: string
  storeName: string
  revenue: number
  orders: number
  avgOrderValue: number
  grossMarginPct: number
  newCustomers: number
  returningCustomers: number
  percentileRank: number // 0-100 among all stores
}

export interface ComparisonData {
  stores: StoreMetrics[]
  generatedAt: string
}

export interface PerformanceAlert {
  id: string
  storeId: string
  metric: string
  threshold: number
  actualValue: number
  alertedAt: string
}

interface StoreOption {
  id: string
  name: string
}

interface StoreComparisonClientProps {
  availableStores: StoreOption[]
  currency: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGE_BTNS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Hari Ini' },
  { value: 'week', label: 'Minggu Ini' },
  { value: 'month', label: 'Bulan Ini' },
  { value: 'custom', label: 'Kustom' },
]

const METRIC_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444']

const METRICS: {
  key: keyof StoreMetrics
  label: string
  format: (v: number, currency: string) => string
  icon: React.ReactNode
}[] = [
  {
    key: 'revenue',
    label: 'Pendapatan',
    format: (v, c) => formatCurrency(v, c),
    icon: <DollarSign className="w-4 h-4" />,
  },
  {
    key: 'orders',
    label: 'Pesanan',
    format: v => v.toLocaleString('id-ID'),
    icon: <ShoppingCart className="w-4 h-4" />,
  },
  {
    key: 'avgOrderValue',
    label: 'Rata-rata Pesanan',
    format: (v, c) => formatCurrency(v, c),
    icon: <TrendingUp className="w-4 h-4" />,
  },
  {
    key: 'grossMarginPct',
    label: 'Margin Kotor %',
    format: v => `${v.toFixed(1)}%`,
    icon: <TrendingUp className="w-4 h-4" />,
  },
  {
    key: 'newCustomers',
    label: 'Pelanggan Baru',
    format: v => v.toLocaleString('id-ID'),
    icon: <Users className="w-4 h-4" />,
  },
  {
    key: 'returningCustomers',
    label: 'Pelanggan Kembali',
    format: v => v.toLocaleString('id-ID'),
    icon: <Users className="w-4 h-4" />,
  },
]

// ─── Pure helpers (exported for unit tests) ───────────────────────────────────

export function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case 'today':
      return { from: today.toISOString(), to: now.toISOString() }
    case 'week': {
      const w = new Date(today)
      w.setDate(w.getDate() - w.getDay()) // start of this week (Sun)
      return { from: w.toISOString(), to: now.toISOString() }
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: m.toISOString(), to: now.toISOString() }
    }
    default:
      return { from: today.toISOString(), to: now.toISOString() }
  }
}

export function findBestPerformer(stores: StoreMetrics[], metric: keyof StoreMetrics): string {
  if (stores.length === 0) return ''
  let best = stores[0]
  for (const s of stores) {
    if ((s[metric] as number) > (best[metric] as number)) best = s
  }
  return best.storeId
}

export function calcPercentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0
  const below = allValues.filter(v => v < value).length
  return Math.round((below / allValues.length) * 100)
}

export function aggregateStoreMetrics(
  orders: Array<{
    storeId: string
    total: number
    costTotal: number
    customerId: string | null
    isNew: boolean
  }>,
  storeId: string,
): Omit<StoreMetrics, 'storeName' | 'percentileRank'> {
  const storeOrders = orders.filter(o => o.storeId === storeId)
  const revenue = storeOrders.reduce((s, o) => s + o.total, 0)
  const cost = storeOrders.reduce((s, o) => s + o.costTotal, 0)
  const totalOrders = storeOrders.length
  const avgOrderValue = totalOrders > 0 ? revenue / totalOrders : 0
  const grossMarginPct = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0
  const newCustomers = storeOrders.filter(o => o.isNew).length
  const returningCustomers = storeOrders.filter(o => !o.isNew && o.customerId !== null).length

  return {
    storeId,
    revenue,
    orders: totalOrders,
    avgOrderValue,
    grossMarginPct,
    newCustomers,
    returningCustomers,
  }
}

export function isAlertTriggered(actual: number, avg30d: number, thresholdPct = 20): boolean {
  if (avg30d === 0) return false
  return actual < avg30d * (1 - thresholdPct / 100)
}

// ─── Chart helper ─────────────────────────────────────────────────────────────

function buildChartData(
  stores: StoreMetrics[],
  metric: keyof StoreMetrics,
): Array<Record<string, string | number>> {
  return stores.map(s => ({
    name: s.storeName,
    value: s[metric] as number,
    storeId: s.storeId,
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StoreComparisonClient({ availableStores, currency }: StoreComparisonClientProps) {
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(
    availableStores.slice(0, 2).map(s => s.id),
  )
  const [dateRange, setDateRange] = useState<DateRange>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [activeMetric, setActiveMetric] = useState<keyof StoreMetrics>('revenue')
  const [alertsOpen, setAlertsOpen] = useState(false)

  const { from, to } =
    dateRange === 'custom' && customFrom && customTo
      ? { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() }
      : getDateRange(dateRange)

  const {
    data: compData,
    isLoading,
    error,
    refetch,
  } = useQuery<ComparisonData>({
    queryKey: ['store-comparison', selectedStoreIds, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({
        storeIds: selectedStoreIds.join(','),
        from,
        to,
      })
      const res = await fetch(`/api/reports/store-comparison?${params}`)
      if (!res.ok) throw new Error('Failed to load comparison data')
      return res.json()
    },
    enabled: selectedStoreIds.length >= 1,
    staleTime: 60_000,
  })

  const { data: alerts } = useQuery<PerformanceAlert[]>({
    queryKey: ['performance-alerts', selectedStoreIds],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/performance-alerts?storeIds=${selectedStoreIds.join(',')}`,
      )
      if (!res.ok) return []
      return res.json()
    },
    enabled: selectedStoreIds.length >= 1,
    staleTime: 120_000,
  })

  const stores = compData?.stores ?? []
  const chartData = buildChartData(stores, activeMetric)
  const bestPerformerId = findBestPerformer(stores, activeMetric)
  const activeMetricDef = METRICS.find(m => m.key === activeMetric)!
  const alertCount = (alerts ?? []).length

  function toggleStore(id: string) {
    setSelectedStoreIds(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id)
      if (prev.length >= 4) return prev // max 4
      return [...prev, id]
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Perbandingan Toko</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">
            Bandingkan performa hingga 4 toko secara bersamaan
          </p>
        </div>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <button
              onClick={() => setAlertsOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              {alertCount} Peringatan
            </button>
          )}
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-[var(--text-3)]" />
          </button>
        </div>
      </div>

      {/* Alerts panel */}
      {alertsOpen && alertCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Peringatan Performa
          </h3>
          {(alerts ?? []).map(a => (
            <div key={a.id} className="text-sm text-amber-700">
              <span className="font-medium">
                {stores.find(s => s.storeId === a.storeId)?.storeName ?? a.storeId}
              </span>{' '}
              — {a.metric}: {a.actualValue.toFixed(1)} (rata-rata 30 hari:{' '}
              {a.threshold.toFixed(1)}, turun &gt;20%)
            </div>
          ))}
        </div>
      )}

      {/* Store selector */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text-2)] mb-3">
          Pilih Toko (maks. 4)
        </h2>
        <div className="flex flex-wrap gap-2">
          {availableStores.map((store, idx) => {
            const selected = selectedStoreIds.includes(store.id)
            const colorIdx = selectedStoreIds.indexOf(store.id)
            return (
              <button
                key={store.id}
                onClick={() => toggleStore(store.id)}
                style={
                  selected
                    ? {
                        backgroundColor: METRIC_COLORS[colorIdx] + '22',
                        borderColor: METRIC_COLORS[colorIdx],
                        color: METRIC_COLORS[colorIdx],
                      }
                    : {}
                }
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  selected
                    ? ''
                    : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--border-mid)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {store.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-[var(--bg-subtle)] rounded-lg p-0.5">
          {RANGE_BTNS.map(btn => (
            <button
              key={btn.value}
              onClick={() => setDateRange(btn.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                dateRange === btn.value
                  ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                  : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg"
            />
            <span className="text-[var(--text-3)]">—</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg"
            />
          </div>
        )}
      </div>

      {/* Metric tabs */}
      <div className="flex flex-wrap gap-2">
        {METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => setActiveMetric(m.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              activeMetric === m.key
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      {/* Loading / error states */}
      {isLoading && (
        <div className="flex items-center justify-center h-48 text-[var(--text-3)] text-sm">
          Memuat data...
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-48 text-red-500 text-sm">
          Gagal memuat data perbandingan.
        </div>
      )}

      {!isLoading && !error && stores.length > 0 && (
        <>
          {/* Bar chart */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text-2)] mb-4">
              {activeMetricDef.label} — Perbandingan Toko
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={v =>
                    activeMetric === 'grossMarginPct'
                      ? `${v.toFixed(0)}%`
                      : activeMetric === 'revenue' || activeMetric === 'avgOrderValue'
                        ? formatCurrency(v, currency)
                        : v.toLocaleString('id-ID')
                  }
                  width={80}
                />
                <Tooltip
                  formatter={(value) =>
                    activeMetricDef.format(Number(value), currency)
                  }
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <rect
                      key={entry.storeId as string}
                      fill={METRIC_COLORS[idx % METRIC_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Metric cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {METRICS.map(metric => {
              const bestId = findBestPerformer(stores, metric.key)
              return (
                <div
                  key={metric.key}
                  className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-2)]">
                    {metric.icon}
                    {metric.label}
                  </div>
                  <div className="space-y-2">
                    {stores.map((store, idx) => {
                      const isBest = store.storeId === bestId
                      const value = store[metric.key] as number
                      return (
                        <div key={store.storeId} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: METRIC_COLORS[idx % METRIC_COLORS.length] }}
                            />
                            <span className="text-sm text-[var(--text-2)] truncate">{store.storeName}</span>
                            {isBest && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200 flex-shrink-0">
                                <Award className="w-3 h-3" />
                                Terbaik
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-[var(--text-1)] ml-2 flex-shrink-0">
                            {metric.format(value, currency)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Percentile ranking */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text-2)] mb-4">
              Peringkat Persentil (Pendapatan — di antara semua toko)
            </h2>
            <div className="space-y-3">
              {stores.map((store, idx) => (
                <div key={store.storeId}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: METRIC_COLORS[idx % METRIC_COLORS.length] }}
                      />
                      <span className="text-sm text-[var(--text-2)]">{store.storeName}</span>
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-1)]">
                      P{store.percentileRank}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--bg-subtle)] rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${store.percentileRank}%`,
                        backgroundColor: METRIC_COLORS[idx % METRIC_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Side-by-side summary table */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-[var(--text-2)]">Ringkasan Lengkap</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--bg-subtle)]">
                    <th className="text-left px-4 py-3 text-[var(--text-3)] font-medium">Metrik</th>
                    {stores.map((store, idx) => (
                      <th
                        key={store.storeId}
                        className="text-right px-4 py-3 font-medium"
                        style={{ color: METRIC_COLORS[idx % METRIC_COLORS.length] }}
                      >
                        {store.storeName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {METRICS.map(metric => {
                    const bestId = findBestPerformer(stores, metric.key)
                    return (
                      <tr key={metric.key} className="hover:bg-[var(--bg-subtle)] transition-colors">
                        <td className="px-4 py-3 text-[var(--text-2)]">{metric.label}</td>
                        {stores.map(store => {
                          const isBest = store.storeId === bestId
                          return (
                            <td
                              key={store.storeId}
                              className={`px-4 py-3 text-right font-medium ${
                                isBest ? 'text-amber-700' : 'text-[var(--text-1)]'
                              }`}
                            >
                              {metric.format(store[metric.key] as number, currency)}
                              {isBest && (
                                <Award className="w-3 h-3 inline ml-1 text-amber-500" />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  <tr className="bg-[var(--bg-subtle)]">
                    <td className="px-4 py-3 text-[var(--text-2)]">Persentil</td>
                    {stores.map(store => (
                      <td key={store.storeId} className="px-4 py-3 text-right font-medium text-indigo-600">
                        P{store.percentileRank}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!isLoading && !error && stores.length === 0 && selectedStoreIds.length > 0 && (
        <div className="flex items-center justify-center h-48 text-[var(--text-3)] text-sm">
          Tidak ada data untuk periode yang dipilih.
        </div>
      )}
    </div>
  )
}
