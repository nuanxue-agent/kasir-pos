'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { Users, TrendingUp, ShoppingCart, Award } from 'lucide-react'
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

interface StaffPerformanceClientProps {
  storeId: string
  currency: string
}

type DateRange = 'today' | 'week' | 'month' | 'custom'

export interface StaffMetric {
  userId: string
  name: string
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
  itemsSold: number
  commissionRate: number
  commissionEarned: number
}

function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case 'today':
      return { from: today.toISOString(), to: now.toISOString() }
    case 'week': {
      const w = new Date(today)
      w.setDate(w.getDate() - 7)
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

const RANGE_BTNS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Hari Ini' },
  { value: 'week', label: '7 Hari' },
  { value: 'month', label: 'Bulan Ini' },
  { value: 'custom', label: 'Kustom' },
]

function exportCSV(rows: StaffMetric[], currency: string) {
  const header = [
    'Nama',
    'Total Pesanan',
    'Total Pendapatan',
    'Rata-rata Nilai Pesanan',
    'Item Terjual',
    'Tarif Komisi (%)',
    'Komisi Diperoleh',
  ].join(',')

  const lines = rows.map(r =>
    [
      `"${r.name}"`,
      r.totalOrders,
      r.totalRevenue,
      r.avgOrderValue.toFixed(0),
      r.itemsSold,
      r.commissionRate,
      r.commissionEarned.toFixed(0),
    ].join(','),
  )

  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `staff-performance-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function StaffPerformanceClient({ storeId, currency }: StaffPerformanceClientProps) {
  const [dateRange, setDateRange] = useState<DateRange>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } =
    dateRange === 'custom' && customFrom && customTo
      ? { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() }
      : getDateRange(dateRange)

  const { data: staff = [], isLoading } = useQuery<StaffMetric[]>({
    queryKey: ['reports-staff', storeId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId, from, to })
      const res = await fetch(`/api/reports/staff?${params}`)
      if (!res.ok) throw new Error('Failed to fetch staff report')
      return res.json()
    },
  })

  // Monthly commission summary — filter current month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data: monthlyStaff = [] } = useQuery<StaffMetric[]>({
    queryKey: ['reports-staff-monthly', storeId, monthStart],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId, from: monthStart, to: now.toISOString() })
      const res = await fetch(`/api/reports/staff?${params}`)
      if (!res.ok) throw new Error('Failed to fetch monthly staff report')
      return res.json()
    },
  })

  const totalMonthlyCommission = monthlyStaff.reduce((s, r) => s + r.commissionEarned, 0)

  // Sort by revenue descending for ranking
  const ranked = [...staff].sort((a, b) => b.totalRevenue - a.totalRevenue)

  const skeleton = () => <div className="h-10 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Performa Staf</h1>
        <p className="mt-0.5 text-sm text-[var(--text-3)]">
          Analitik performa kasir &amp; komisi penjualan
        </p>
      </div>

      {/* Date range selector */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {RANGE_BTNS.map(btn => (
              <button
                key={btn.value}
                onClick={() => setDateRange(btn.value)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  dateRange === btn.value
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                    : 'border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-muted)]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportCSV(ranked, currency)}
            disabled={ranked.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] disabled:opacity-40"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M8 12l4 4 4-4M12 4v12"
              />
            </svg>
            Ekspor CSV
          </button>
        </div>
        {dateRange === 'custom' && (
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
              <span className="text-xs text-[var(--text-3)]">Dari</span>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="bg-transparent text-sm text-[var(--text-1)] focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
              <span className="text-xs text-[var(--text-3)]">Sampai</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="bg-transparent text-sm text-[var(--text-1)] focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50">
              <Users className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-xs font-medium text-[var(--text-3)]">Staf Aktif</p>
          </div>
          <p className="text-xl font-bold text-[var(--text-1)]">{staff.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-xs font-medium text-[var(--text-3)]">Total Pendapatan</p>
          </div>
          <p className="text-xl font-bold text-[var(--text-1)]">
            {formatCurrency(
              staff.reduce((s, r) => s + r.totalRevenue, 0),
              currency,
            )}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <ShoppingCart className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-xs font-medium text-[var(--text-3)]">Total Pesanan</p>
          </div>
          <p className="text-xl font-bold text-[var(--text-1)]">
            {staff.reduce((s, r) => s + r.totalOrders, 0)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-50">
              <Award className="h-4 w-4 text-orange-400" />
            </div>
            <p className="text-xs font-medium text-[var(--text-3)]">Total Komisi Bulan Ini</p>
          </div>
          <p className="text-xl font-bold text-orange-500">
            {formatCurrency(totalMonthlyCommission, currency)}
          </p>
        </div>
      </div>

      {/* Revenue by staff bar chart */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-[var(--text-1)]">Pendapatan per Staf</h3>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-amber-500" />
          </div>
        ) : ranked.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center">
            <Users className="mb-2 h-8 w-8 text-stone-200" />
            <p className="text-sm text-[var(--text-3)]">Belum ada data di periode ini</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ranked} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v =>
                  v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1000
                      ? `${(v / 1000).toFixed(0)}k`
                      : String(v)
                }
              />
              <Tooltip
                formatter={value => [formatCurrency(value as number, currency), 'Pendapatan']}
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="totalRevenue" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Performance table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Detail Performa Staf</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-5 py-3 text-xs font-semibold text-[var(--text-3)]">#</th>
                <th className="px-5 py-3 text-xs font-semibold text-[var(--text-3)]">Nama</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">
                  Pesanan
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">
                  Pendapatan
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">
                  Rata-rata
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">
                  Item
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">
                  Komisi %
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">
                  Komisi
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        {skeleton()}
                      </td>
                    ))}
                  </tr>
                ))
              ) : ranked.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-[var(--text-3)]">
                    Belum ada data di periode ini
                  </td>
                </tr>
              ) : (
                ranked.map((r, i) => (
                  <tr
                    key={r.userId}
                    className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--bg-subtle)]"
                  >
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          i === 0
                            ? 'bg-amber-100 text-amber-700'
                            : i === 1
                              ? 'bg-stone-100 text-stone-600'
                              : i === 2
                                ? 'bg-orange-100 text-orange-600'
                                : 'bg-[var(--bg-subtle)] text-[var(--text-3)]'
                        }`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-[var(--text-1)]">{r.name}</td>
                    <td className="px-5 py-3 text-right text-[var(--text-2)]">{r.totalOrders}</td>
                    <td className="px-5 py-3 text-right font-semibold text-[var(--text-1)]">
                      {formatCurrency(r.totalRevenue, currency)}
                    </td>
                    <td className="px-5 py-3 text-right text-[var(--text-2)]">
                      {formatCurrency(r.avgOrderValue, currency)}
                    </td>
                    <td className="px-5 py-3 text-right text-[var(--text-2)]">{r.itemsSold}</td>
                    <td className="px-5 py-3 text-right text-[var(--text-2)]">
                      {r.commissionRate > 0 ? `${r.commissionRate}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-600">
                      {r.commissionEarned > 0 ? formatCurrency(r.commissionEarned, currency) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly commission summary */}
      {monthlyStaff.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-amber-800">
            Ringkasan Komisi Bulan{' '}
            {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="space-y-2">
            {monthlyStaff
              .filter(r => r.commissionEarned > 0)
              .sort((a, b) => b.commissionEarned - a.commissionEarned)
              .map(r => (
                <div key={r.userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-800">
                      {r.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-amber-900">{r.name}</span>
                    <span className="text-xs text-amber-600">({r.commissionRate}%)</span>
                  </div>
                  <span className="text-sm font-bold text-amber-700">
                    {formatCurrency(r.commissionEarned, currency)}
                  </span>
                </div>
              ))}
            {monthlyStaff.every(r => r.commissionEarned === 0) && (
              <p className="text-sm text-amber-700">
                Belum ada komisi yang ditetapkan untuk staf bulan ini.
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-amber-200 pt-3">
            <span className="text-sm font-semibold text-amber-800">Total Komisi</span>
            <span className="text-base font-bold text-amber-700">
              {formatCurrency(totalMonthlyCommission, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
