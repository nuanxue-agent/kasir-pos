'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Store,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Users,
  AlertTriangle,
  Trophy,
  Target,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Minus,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface StoreSummary {
  storeId: string
  storeName: string
  revenue: number
  transactions: number
  avgOrder: number
  topProduct: string | null
  stockShortage: number
  newCustomers: number
}

interface StoreRanking {
  storeId: string
  storeName: string
  revenue: number
  transactions: number
  growth: number
  rank: number
}

interface StoreTarget {
  id: string
  storeId: string
  metric: 'REVENUE' | 'TRANSACTIONS' | 'NEW_CUSTOMERS'
  targetValue: number
  period: string
  actualValue: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000)     return `Rp ${(n / 1_000).toFixed(0)}rb`
  return `Rp ${n.toFixed(0)}`
}

function pct(actual: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(Math.round((actual / target) * 100), 100)
}

function growthIcon(g: number) {
  if (g > 0)  return <TrendingUp  className="h-4 w-4 text-emerald-500" />
  if (g < 0)  return <TrendingDown className="h-4 w-4 text-rose-500" />
  return <Minus className="h-4 w-4 text-[var(--text-3)]" />
}

function metricLabel(m: string): string {
  if (m === 'REVENUE')       return 'Pendapatan'
  if (m === 'TRANSACTIONS')  return 'Transaksi'
  if (m === 'NEW_CUSTOMERS') return 'Pelanggan Baru'
  return m
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[var(--text-2)]">{icon}</span>
      <h2 className="text-sm font-semibold text-[var(--text-1)]">{title}</h2>
    </div>
  )
}

function StoreComparisonTable({ stores }: { stores: StoreSummary[] }) {
  if (stores.length === 0) {
    return (
      <p className="text-xs text-[var(--text-3)] py-4 text-center">Tidak ada data toko.</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {['Toko', 'Pendapatan', 'Transaksi', 'Rata-rata Order', 'Produk Terlaris', 'Pelanggan Baru'].map((h) => (
              <th key={h} className="text-left py-2 pr-4 text-[var(--text-3)] font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.storeId} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)]">
              <td className="py-2 pr-4 font-medium text-[var(--text-1)] whitespace-nowrap">{s.storeName}</td>
              <td className="py-2 pr-4 text-[var(--text-2)] whitespace-nowrap">{fmt(s.revenue)}</td>
              <td className="py-2 pr-4 text-[var(--text-2)]">{s.transactions.toLocaleString()}</td>
              <td className="py-2 pr-4 text-[var(--text-2)] whitespace-nowrap">{fmt(s.avgOrder)}</td>
              <td className="py-2 pr-4 text-[var(--text-2)] max-w-[120px] truncate">{s.topProduct ?? '—'}</td>
              <td className="py-2 pr-4 text-[var(--text-2)]">{s.newCustomers.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StoreRankingList({
  ranking,
  metric,
  onMetricChange,
}: {
  ranking: StoreRanking[]
  metric: string
  onMetricChange: (m: string) => void
}) {
  const metrics = [
    { value: 'revenue',      label: 'Pendapatan' },
    { value: 'transactions', label: 'Transaksi' },
    { value: 'growth',       label: 'Pertumbuhan' },
  ]

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {metrics.map((m) => (
          <button
            key={m.value}
            onClick={() => onMetricChange(m.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              metric === m.value
                ? 'bg-blue-600 text-white'
                : 'bg-[var(--bg-card)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {ranking.map((r) => (
          <div
            key={r.storeId}
            className="flex items-center gap-3 p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]"
          >
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                r.rank === 1
                  ? 'bg-amber-100 text-amber-700'
                  : r.rank === 2
                  ? 'bg-slate-100 text-slate-600'
                  : r.rank === 3
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-[var(--bg-hover)] text-[var(--text-3)]'
              }`}
            >
              {r.rank}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--text-1)] truncate">{r.storeName}</p>
              <p className="text-xs text-[var(--text-3)]">
                {metric === 'growth'
                  ? `${r.growth > 0 ? '+' : ''}${r.growth.toFixed(1)}%`
                  : metric === 'transactions'
                  ? `${r.transactions.toLocaleString()} transaksi`
                  : fmt(r.revenue)}
              </p>
            </div>
            {growthIcon(r.growth)}
          </div>
        ))}
        {ranking.length === 0 && (
          <p className="text-xs text-[var(--text-3)] text-center py-4">Tidak ada data.</p>
        )}
      </div>
    </div>
  )
}

function StoreTargetTable({
  targets,
  storeId,
  onAdd,
}: {
  targets: StoreTarget[]
  storeId: string
  onAdd: (t: Omit<StoreTarget, 'id' | 'storeId' | 'actualValue'>) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ metric: 'REVENUE', targetValue: '', period: '' })
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!form.targetValue || !form.period) {
      toast.error('Isi semua kolom target')
      return
    }
    setSaving(true)
    try {
      await onAdd({
        metric:      form.metric as StoreTarget['metric'],
        targetValue: Number(form.targetValue),
        period:      form.period,
      })
      setForm({ metric: 'REVENUE', targetValue: '', period: '' })
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {['Metrik', 'Periode', 'Target', 'Realisasi', 'Pencapaian'].map((h) => (
                <th key={h} className="text-left py-2 pr-4 text-[var(--text-3)] font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const achievement = pct(t.actualValue, t.targetValue)
              return (
                <tr key={t.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)]">
                  <td className="py-2 pr-4 font-medium text-[var(--text-1)]">{metricLabel(t.metric)}</td>
                  <td className="py-2 pr-4 text-[var(--text-2)]">{t.period}</td>
                  <td className="py-2 pr-4 text-[var(--text-2)] whitespace-nowrap">
                    {t.metric === 'REVENUE' ? fmt(t.targetValue) : t.targetValue.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-[var(--text-2)] whitespace-nowrap">
                    {t.metric === 'REVENUE' ? fmt(t.actualValue) : t.actualValue.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-[var(--bg-hover)] rounded-full h-1.5 w-20">
                        <div
                          className={`h-1.5 rounded-full ${
                            achievement >= 100
                              ? 'bg-emerald-500'
                              : achievement >= 75
                              ? 'bg-blue-500'
                              : achievement >= 50
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${achievement}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          achievement >= 100
                            ? 'text-emerald-600'
                            : achievement >= 50
                            ? 'text-amber-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {achievement}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
            {targets.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-[var(--text-3)]">
                  Belum ada target.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="flex flex-wrap gap-2 items-end p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-hover)]">
          <div>
            <label className="block text-xs text-[var(--text-3)] mb-1">Metrik</label>
            <select
              value={form.metric}
              onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value }))}
              className="text-xs rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] px-2 py-1"
            >
              <option value="REVENUE">Pendapatan</option>
              <option value="TRANSACTIONS">Transaksi</option>
              <option value="NEW_CUSTOMERS">Pelanggan Baru</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-3)] mb-1">Periode</label>
            <input
              type="text"
              placeholder="e.g. 2025-07"
              value={form.period}
              onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
              className="text-xs rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] px-2 py-1 w-28"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-3)] mb-1">Nilai Target</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={form.targetValue}
              onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))}
              className="text-xs rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] px-2 py-1 w-32"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
          <button
            onClick={() => setAdding(false)}
            className="px-3 py-1 rounded-md border border-[var(--border)] text-xs text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
          >
            Batal
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-blue-600 hover:underline"
        >
          + Tambah Target
        </button>
      )}
    </div>
  )
}

function CrossStoreAlerts({ stores }: { stores: StoreSummary[] }) {
  const shortages  = stores.filter((s) => s.stockShortage > 0)
  const revenues   = stores.map((s) => s.revenue)
  const mean       = revenues.length ? revenues.reduce((a, b) => a + b, 0) / revenues.length : 0
  const stddev     = revenues.length
    ? Math.sqrt(revenues.reduce((a, b) => a + (b - mean) ** 2, 0) / revenues.length)
    : 0
  const outliers   = stores.filter((s) => Math.abs(s.revenue - mean) > 1.5 * stddev)

  if (shortages.length === 0 && outliers.length === 0) {
    return (
      <p className="text-xs text-[var(--text-3)] py-2">Tidak ada peringatan saat ini.</p>
    )
  }

  return (
    <div className="space-y-2">
      {shortages.map((s) => (
        <div
          key={`shortage-${s.storeId}`}
          className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-800">{s.storeName}</p>
            <p className="text-xs text-amber-700">
              {s.stockShortage} produk di bawah titik reorder
            </p>
          </div>
        </div>
      ))}
      {outliers.map((s) => (
        <div
          key={`outlier-${s.storeId}`}
          className="flex items-start gap-2 p-2.5 rounded-lg border border-blue-200 bg-blue-50"
        >
          <TrendingUp className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-blue-800">{s.storeName}</p>
            <p className="text-xs text-blue-700">
              Performa outlier — pendapatan {s.revenue > mean ? 'jauh di atas' : 'jauh di bawah'} rata-rata ({fmt(mean)})
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MultiStoreDashboardClient() {
  const [stores,        setStores]        = useState<StoreSummary[]>([])
  const [ranking,       setRanking]       = useState<StoreRanking[]>([])
  const [targets,       setTargets]       = useState<StoreTarget[]>([])
  const [rankMetric,    setRankMetric]    = useState('revenue')
  const [selectedStore, setSelectedStore] = useState<string>('')
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    const res  = await fetch('/api/multi-store/summary')
    const data = await res.json() as any
    if (!res.ok) throw new Error(data.error ?? 'Gagal memuat summary')
    setStores(data.stores ?? [])
    if (!selectedStore && (data.stores ?? []).length > 0) {
      setSelectedStore(data.stores[0].storeId)
    }
  }, [selectedStore])

  const loadRanking = useCallback(async (metric: string) => {
    const res  = await fetch(`/api/multi-store/ranking?metric=${metric}`)
    const data = await res.json() as any
    if (!res.ok) throw new Error(data.error ?? 'Gagal memuat ranking')
    setRanking(data.ranking ?? [])
  }, [])

  const loadTargets = useCallback(async (storeId: string) => {
    if (!storeId) return
    const res  = await fetch(`/api/store-targets?storeId=${storeId}`)
    const data = await res.json() as any
    if (!res.ok) throw new Error(data.error ?? 'Gagal memuat target')
    setTargets(data.targets ?? [])
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await loadSummary()
      await loadRanking(rankMetric)
    } catch (e: any) {
      setError(e.message)
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [loadSummary, loadRanking, rankMetric])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (selectedStore) loadTargets(selectedStore).catch(() => {})
  }, [selectedStore, loadTargets])

  async function handleAddTarget(t: Omit<StoreTarget, 'id' | 'storeId' | 'actualValue'>) {
    const res  = await fetch('/api/store-targets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...t, storeId: selectedStore }),
    })
    const data = await res.json() as any
    if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan target'); return }
    toast.success('Target disimpan')
    await loadTargets(selectedStore)
  }

  async function handleMetricChange(m: string) {
    setRankMetric(m)
    try {
      await loadRanking(m)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="h-5 w-5 animate-spin text-[var(--text-3)]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          onClick={loadAll}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          Coba Lagi
        </button>
      </div>
    )
  }

  const selectedStoreName = stores.find((s) => s.storeId === selectedStore)?.storeName ?? ''

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-[var(--text-1)]">Dashboard Multi-Toko</h1>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-1.5 text-xs text-[var(--text-3)] hover:text-[var(--text-1)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Toko',
            value: stores.length,
            icon:  <Store className="h-4 w-4" />,
            color: 'text-blue-600',
          },
          {
            label: 'Total Pendapatan',
            value: fmt(stores.reduce((s, r) => s + r.revenue, 0)),
            icon:  <TrendingUp className="h-4 w-4" />,
            color: 'text-emerald-600',
          },
          {
            label: 'Total Transaksi',
            value: stores.reduce((s, r) => s + r.transactions, 0).toLocaleString(),
            icon:  <ShoppingCart className="h-4 w-4" />,
            color: 'text-violet-600',
          },
          {
            label: 'Peringatan Stok',
            value: stores.reduce((s, r) => s + r.stockShortage, 0),
            icon:  <AlertTriangle className="h-4 w-4" />,
            color: 'text-amber-600',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3"
          >
            <div className={`flex items-center gap-1.5 mb-1 ${card.color}`}>
              {card.icon}
              <span className="text-xs text-[var(--text-3)]">{card.label}</span>
            </div>
            <p className="text-base font-semibold text-[var(--text-1)]">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Main grid: comparison + ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Store comparison table */}
        <div className="lg:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <SectionHeader title="Perbandingan Toko (30 Hari Terakhir)" icon={<ShoppingCart className="h-4 w-4" />} />
          <StoreComparisonTable stores={stores} />
        </div>

        {/* Store ranking */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <SectionHeader title="Ranking Toko" icon={<Trophy className="h-4 w-4" />} />
          <StoreRankingList
            ranking={ranking}
            metric={rankMetric}
            onMetricChange={handleMetricChange}
          />
        </div>
      </div>

      {/* Store targets */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader title="Target Toko" icon={<Target className="h-4 w-4" />} />
          {stores.length > 1 && (
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="text-xs rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] px-2 py-1"
            >
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>
                  {s.storeName}
                </option>
              ))}
            </select>
          )}
        </div>
        <StoreTargetTable
          targets={targets}
          storeId={selectedStore}
          onAdd={handleAddTarget}
        />
      </div>

      {/* Cross-store alerts */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <SectionHeader title="Peringatan Lintas Toko" icon={<AlertTriangle className="h-4 w-4" />} />
        <CrossStoreAlerts stores={stores} />
      </div>
    </div>
  )
}
