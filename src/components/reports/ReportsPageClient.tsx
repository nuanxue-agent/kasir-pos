'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, ShoppingCart, TrendingUp, TrendingDown, Users, Scale, BarChart2 } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { SalesChart } from './SalesChart'
import { TopProductsChart } from './TopProductsChart'
import { PaymentBreakdown } from './PaymentBreakdown'
import { ExportButton } from '@/components/ExportButton'
import type { ExportColumn } from '@/lib/export'

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

function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case 'today':
      return { from: today.toISOString(), to: now.toISOString() }
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      const ye = new Date(y); ye.setHours(23, 59, 59, 999)
      return { from: y.toISOString(), to: ye.toISOString() }
    }
    case 'week': {
      const w = new Date(today); w.setDate(w.getDate() - 7)
      return { from: w.toISOString(), to: now.toISOString() }
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: m.toISOString(), to: now.toISOString() }
    }
    default: return { from: today.toISOString(), to: now.toISOString() }
  }
}

const RANGE_BTNS: { value: DateRange; label: string }[] = [
  { value: 'today',     label: 'Hari Ini' },
  { value: 'yesterday', label: 'Kemarin' },
  { value: 'week',      label: '7 Hari' },
  { value: 'month',     label: 'Bulan Ini' },
  { value: 'custom',    label: 'Kustom' },
]

const REPORT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'date',      label: 'Tanggal' },
  { key: 'revenue',   label: 'Pendapatan' },
  { key: 'orders',    label: 'Pesanan' },
  { key: 'expenses',  label: 'Pengeluaran' },
  { key: 'netProfit', label: 'Laba Bersih' },
]

export function ReportsPageClient({ storeId, currency, taxRate }: ReportsPageClientProps) {
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } = dateRange === 'custom' && customFrom && customTo
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

  const reportExportRows = (data?.dailySales ?? []).map((s) => ({
    date:      s.date,
    revenue:   s.total,
    orders:    s.orders,
    expenses:  data?.totalExpenses ?? 0,
    netProfit: data?.netProfit ?? 0,
  }))

  const skeleton = (h = 'h-28') => (
    <div className={`${h} bg-stone-50 animate-pulse rounded-2xl border border-stone-100`} />
  )

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Laporan</h1>
        <p className="text-stone-400 text-sm mt-0.5">Analitik penjualan dan performa toko</p>
      </div>

      {/* Date range selector */}
      <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          {RANGE_BTNS.map(btn => (
            <button
              key={btn.value}
              onClick={() => setDateRange(btn.value)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                dateRange === btn.value
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                  : 'bg-stone-50 text-stone-500 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
              <span className="text-xs text-stone-400">Dari</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-sm text-stone-700 bg-transparent focus:outline-none" />
            </div>
            <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
              <span className="text-xs text-stone-400">Sampai</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-sm text-stone-700 bg-transparent focus:outline-none" />
            </div>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
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
        </div>
        </div>

      {/* Financial Report Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/dashboard/reports/balance-sheet"
          className="group bg-white border border-stone-100 rounded-2xl p-5 shadow-sm hover:border-amber-200 hover:shadow-md transition-all flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 group-hover:bg-amber-100 transition-colors">
            <Scale className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-stone-800">Neraca</p>
            <p className="text-xs text-stone-400 mt-0.5">Balance sheet — posisi keuangan</p>
          </div>
          <TrendingUp className="h-4 w-4 text-stone-300 ml-auto group-hover:text-amber-400 transition-colors" />
        </Link>
        <Link
          href="/dashboard/reports/pnl"
          className="group bg-white border border-stone-100 rounded-2xl p-5 shadow-sm hover:border-amber-200 hover:shadow-md transition-all flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 group-hover:bg-amber-100 transition-colors">
            <BarChart2 className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-stone-800">Laba Rugi</p>
            <p className="text-xs text-stone-400 mt-0.5">P&amp;L — pendapatan &amp; beban</p>
          </div>
          <TrendingUp className="h-4 w-4 text-stone-300 ml-auto group-hover:text-amber-400 transition-colors" />
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {isLoading ? (
          <>{[...Array(6)].map((_, i) => <div key={i}>{skeleton()}</div>)}</>
        ) : (
          <>
            {/* Omzet */}
            <div className="col-span-2 sm:col-span-1 lg:col-span-2 bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-xs font-medium text-stone-400">Omzet</p>
              </div>
              <p className="text-2xl font-bold text-stone-800">{formatCurrency(data?.totalRevenue ?? 0, currency)}</p>
            </div>
            {/* Pengeluaran */}
            <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                </div>
                <p className="text-xs font-medium text-stone-400">Pengeluaran</p>
              </div>
              <p className="text-xl font-bold text-red-500">-{formatCurrency(data?.totalExpenses ?? 0, currency)}</p>
            </div>
            {/* Laba Bersih */}
            <div className={`bg-white rounded-2xl p-4 shadow-sm border ${(data?.netProfit ?? 0) >= 0 ? 'border-emerald-200' : 'border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${(data?.netProfit ?? 0) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <TrendingUp className={`h-4 w-4 ${(data?.netProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
                </div>
                <p className="text-xs font-medium text-stone-400">Laba Bersih</p>
              </div>
              <p className={`text-xl font-bold ${(data?.netProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatCurrency(data?.netProfit ?? 0, currency)}
              </p>
            </div>
            {/* Pesanan */}
            <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <ShoppingCart className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-xs font-medium text-stone-400">Pesanan</p>
              </div>
              <p className="text-xl font-bold text-stone-800">{data?.totalOrders ?? 0}</p>
            </div>
            {/* Pelanggan Baru */}
            <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-orange-400" />
                </div>
                <p className="text-xs font-medium text-stone-400">Pelanggan</p>
              </div>
              <p className="text-xl font-bold text-stone-800">{data?.newCustomers ?? 0}</p>
            </div>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-800 mb-4">Tren Penjualan</h3>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-stone-100 border-t-amber-500" />
            </div>
          ) : (
            <SalesChart data={data?.dailySales ?? []} currency={currency} />
          )}
        </div>

        <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-800 mb-4">5 Produk Terlaris</h3>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-stone-100 border-t-amber-500" />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-800 mb-4">Metode Pembayaran</h3>
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-stone-50 animate-pulse rounded-xl" />)}</div>
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

        <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-800 mb-4">Penjualan Harian</h3>
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-stone-50 animate-pulse rounded-xl" />)}</div>
          ) : (data?.dailySales ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <ShoppingCart className="h-8 w-8 text-stone-200 mb-2" />
              <p className="text-sm text-stone-400">Belum ada penjualan di periode ini</p>
            </div>
          ) : (
            <div className="space-y-1">
              {(data?.dailySales ?? []).map((s, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-stone-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-stone-700">
                      {new Date(s.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-xs text-stone-400">{s.orders} pesanan</p>
                  </div>
                  <p className="text-sm font-bold text-stone-800">{formatCurrency(s.total, currency)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
