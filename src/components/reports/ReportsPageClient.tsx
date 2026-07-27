'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Users,
  Scale,
  BarChart2,
  LineChart,
  Percent,
} from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { SalesChart } from './SalesChart'
import { TopProductsChart } from './TopProductsChart'
import { PaymentBreakdown } from './PaymentBreakdown'
import { ExportButton } from '@/components/ExportButton'
import type { ExportColumn } from '@/lib/export'
import { PrintButton } from '@/components/ui/PrintButton'

interface ReportsPageClientProps {
  storeId: string
  currency: string
  taxRate: number
}

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

interface ReportData {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  newCustomers: number
  totalExpenses: number
  netProfit: number
  topProducts: Array<{ name: string; revenue: number; qty: number }>
  dailySales: Array<{ date: string; total: number; orders: number }>
  paymentBreakdown: Array<{ method: string; total: number; count: number }>
}

interface GrossProfitData {
  revenue: number
  cogs: number
  grossProfit: number
  grossMargin: number
}

function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case 'today':
      return { from: today.toISOString(), to: now.toISOString() }
    case 'yesterday': {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      const ye = new Date(y)
      ye.setHours(23, 59, 59, 999)
      return { from: y.toISOString(), to: ye.toISOString() }
    }
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
  { value: 'yesterday', label: 'Kemarin' },
  { value: 'week', label: '7 Hari' },
  { value: 'month', label: 'Bulan Ini' },
  { value: 'custom', label: 'Kustom' },
]

const REPORT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'date', label: 'Tanggal' },
  { key: 'revenue', label: 'Pendapatan' },
  { key: 'orders', label: 'Pesanan' },
  { key: 'expenses', label: 'Pengeluaran' },
  { key: 'netProfit', label: 'Laba Bersih' },
]

export function ReportsPageClient({ storeId, currency, taxRate }: ReportsPageClientProps) {
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } =
    dateRange === 'custom' && customFrom && customTo
      ? { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() }
      : getDateRange(dateRange)

  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ['reports', storeId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId, from, to })
      const res = await fetch(`/api/reports/summary?${params}`)
      if (!res.ok) throw new Error('Failed to fetch reports')
      return res.json()
    },
  })

  const { data: gp, isLoading: gpLoading } = useQuery<GrossProfitData>({
    queryKey: ['reports-gross-profit', storeId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId, from, to })
      const res = await fetch(`/api/reports/gross-profit?${params}`)
      if (!res.ok) throw new Error('Failed to fetch gross profit')
      return res.json()
    },
  })

  const reportExportRows = (data?.dailySales ?? []).map(s => ({
    date: s.date,
    revenue: s.total,
    orders: s.orders,
    expenses: data?.totalExpenses ?? 0,
    netProfit: data?.netProfit ?? 0,
  }))

  const skeleton = (h = 'h-28') => (
    <div
      className={`${h} animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]`}
    />
  )

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Laporan</h1>
        <p className="mt-0.5 text-sm text-[var(--text-3)]">Analitik penjualan dan performa toko</p>
      </div>

      {/* Date range selector */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
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
        <div className="flex flex-wrap gap-2">
          <ExportButton
            type="pdf"
            label="Ekspor PDF"
            data={reportExportRows}
            columns={REPORT_EXPORT_COLUMNS}
            filename={`laporan-${from.slice(0, 10)}-${to.slice(0, 10)}`}
            title="Laporan Penjualan"
            currency={currency}
          />
          <ExportButton
            type="excel"
            label="Ekspor Excel"
            data={reportExportRows}
            columns={REPORT_EXPORT_COLUMNS}
            filename={`laporan-${from.slice(0, 10)}-${to.slice(0, 10)}`}
            title="Laporan Penjualan"
            currency={currency}
          />
          <PrintButton title="Laporan Penjualan" />
        </div>
      </div>

      {/* Financial Report Links */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/dashboard/reports/balance-sheet"
          className="group flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm transition-all hover:border-amber-200 hover:shadow-md"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 transition-colors group-hover:bg-amber-100">
            <Scale className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-1)]">Neraca</p>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">Balance sheet — posisi keuangan</p>
          </div>
          <TrendingUp className="ml-auto h-4 w-4 text-stone-300 transition-colors group-hover:text-amber-400" />
        </Link>
        <Link
          href="/dashboard/reports/pnl"
          className="group flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm transition-all hover:border-amber-200 hover:shadow-md"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 transition-colors group-hover:bg-amber-100">
            <BarChart2 className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-1)]">Laba Rugi</p>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">P&amp;L — pendapatan &amp; beban</p>
          </div>
          <TrendingUp className="ml-auto h-4 w-4 text-stone-300 transition-colors group-hover:text-amber-400" />
        </Link>
        <Link
          href="/dashboard/reports/analytics"
          className="group flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm transition-all hover:border-amber-200 hover:shadow-md sm:col-span-2"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 transition-colors group-hover:bg-amber-100">
            <LineChart className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-1)]">Analytics</p>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">
              Hourly trends, category breakdown &amp; customer retention
            </p>
          </div>
          <TrendingUp className="ml-auto h-4 w-4 text-stone-300 transition-colors group-hover:text-amber-400" />
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {isLoading ? (
          <>
            {[...Array(6)].map((_, i) => (
              <div key={i}>{skeleton()}</div>
            ))}
          </>
        ) : (
          <>
            {/* Omzet */}
            <div className="col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm sm:col-span-1 lg:col-span-2">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-xs font-medium text-[var(--text-3)]">Omzet</p>
              </div>
              <p className="text-2xl font-bold text-[var(--text-1)]">
                {formatCurrency(data?.totalRevenue ?? 0, currency)}
              </p>
            </div>
            {/* Gross Profit */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm lg:col-span-2">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50">
                  <Percent className="h-4 w-4 text-teal-600" />
                </div>
                <p className="text-xs font-medium text-[var(--text-3)]">Laba Kotor</p>
              </div>
              {gpLoading ? (
                <div className="h-7 w-24 animate-pulse rounded-lg bg-[var(--bg-subtle)]" />
              ) : (
                <>
                  <p className="text-xl font-bold text-teal-600">
                    {formatCurrency(gp?.grossProfit ?? 0, currency)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-3)]">
                    Margin {(gp?.grossMargin ?? 0).toFixed(1)}%
                  </p>
                </>
              )}
            </div>
            {/* Pengeluaran */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-50">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                </div>
                <p className="text-xs font-medium text-[var(--text-3)]">Pengeluaran</p>
              </div>
              <p className="text-xl font-bold text-red-500">
                -{formatCurrency(data?.totalExpenses ?? 0, currency)}
              </p>
            </div>
            {/* Laba Bersih */}
            <div
              className={`rounded-xl border bg-[var(--bg-card)] p-4 shadow-sm ${(data?.netProfit ?? 0) >= 0 ? 'border-emerald-200' : 'border-red-200'}`}
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${(data?.netProfit ?? 0) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}
                >
                  <TrendingUp
                    className={`h-4 w-4 ${(data?.netProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                  />
                </div>
                <p className="text-xs font-medium text-[var(--text-3)]">Laba Bersih</p>
              </div>
              <p
                className={`text-xl font-bold ${(data?.netProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
              >
                {formatCurrency(data?.netProfit ?? 0, currency)}
              </p>
            </div>
            {/* Pesanan */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                  <ShoppingCart className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-xs font-medium text-[var(--text-3)]">Pesanan</p>
              </div>
              <p className="text-xl font-bold text-[var(--text-1)]">{data?.totalOrders ?? 0}</p>
            </div>
            {/* Pelanggan Baru */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-50">
                  <Users className="h-4 w-4 text-orange-400" />
                </div>
                <p className="text-xs font-medium text-[var(--text-3)]">Pelanggan</p>
              </div>
              <p className="text-xl font-bold text-[var(--text-1)]">{data?.newCustomers ?? 0}</p>
            </div>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-1)]">Tren Penjualan</h3>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-amber-500" />
            </div>
          ) : (
            <SalesChart data={data?.dailySales ?? []} currency={currency} />
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-1)]">5 Produk Terlaris</h3>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-amber-500" />
            </div>
          ) : (
            <TopProductsChart
              data={(data?.topProducts?.slice(0, 5) ?? []).map((p: any) => ({
                productId: p.productId ?? p.id ?? '',
                name: p.name,
                _sum: { subtotal: p.revenue ?? 0, qty: p.qty ?? 0 },
              }))}
              currency={currency}
            />
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-1)]">Metode Pembayaran</h3>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
              ))}
            </div>
          ) : (
            <PaymentBreakdown
              data={(data?.paymentBreakdown ?? []).map((p: any) => ({
                method: p.method,
                _sum: { amount: p.total ?? 0 },
                _count: { id: p.count ?? 0 },
              }))}
              currency={currency}
            />
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-1)]">Penjualan Harian</h3>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
              ))}
            </div>
          ) : (data?.dailySales ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <ShoppingCart className="mb-2 h-8 w-8 text-stone-200" />
              <p className="text-sm text-[var(--text-3)]">Belum ada penjualan di periode ini</p>
            </div>
          ) : (
            <div className="space-y-1">
              {(data?.dailySales ?? []).map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text-1)]">
                      {new Date(s.date).toLocaleDateString('id-ID', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <p className="text-xs text-[var(--text-3)]">{s.orders} pesanan</p>
                  </div>
                  <p className="text-sm font-bold text-[var(--text-1)]">
                    {formatCurrency(s.total, currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
