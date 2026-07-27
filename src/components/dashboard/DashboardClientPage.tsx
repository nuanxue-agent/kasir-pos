'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ShoppingCart, DollarSign, TrendingUp, Users, Plus, Package,
  BarChart3, AlertTriangle, ArrowRight, CheckCircle2, Clock,
  XCircle, Boxes, Sparkles, ShoppingBag, Star, ChevronRight,
} from 'lucide-react'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { formatCurrency, formatDate } from '@/lib/utils'

interface DashboardClientPageProps {
  storeId: string
  session: any
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Selamat pagi'
  if (h < 17) return 'Selamat siang'
  return 'Selamat malam'
}

function todayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
}
function todayEnd() {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString()
}
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d.toISOString()
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; pill: string; label: string }> = {
  PAID:    { icon: <CheckCircle2 className="h-3 w-3" />, pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200', label: 'Lunas' },
  PENDING: { icon: <Clock        className="h-3 w-3" />, pill: 'bg-amber-50 text-amber-600 border border-amber-200',       label: 'Pending' },
  VOIDED:  { icon: <XCircle      className="h-3 w-3" />, pill: 'bg-red-50 text-red-500 border border-red-200',             label: 'Batal' },
}

// Simple SVG sparkline
function Sparkline({ data, color = '#f59e0b' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80, h = 32, pad = 2
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="shrink-0">
      <polyline points={pts} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <polyline points={`${pts} ${w - pad},${h} ${pad},${h}`} stroke="none" fill={color} fillOpacity="0.1" />
    </svg>
  )
}

export default function DashboardClientPage({ storeId, session }: DashboardClientPageProps) {
  const currency = session?.user?.stores?.[0]?.currency ?? 'IDR'
  const userName = session?.user?.name ?? ''

  // Today's summary
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', storeId],
    queryFn: () => fetch(`/api/reports/summary?storeId=${storeId}&from=${todayStart()}&to=${todayEnd()}`).then(r => r.json()),
  })

  // Yesterday for comparison
  const { data: yesterday } = useQuery({
    queryKey: ['dashboard-summary-yesterday', storeId],
    queryFn: () => {
      const y = new Date(); y.setDate(y.getDate() - 1)
      const ys = new Date(y); ys.setHours(0, 0, 0, 0)
      const ye = new Date(y); ye.setHours(23, 59, 59, 999)
      return fetch(`/api/reports/summary?storeId=${storeId}&from=${ys.toISOString()}&to=${ye.toISOString()}`).then(r => r.json())
    },
  })

  // 7-day trend
  const { data: weekData } = useQuery({
    queryKey: ['dashboard-week', storeId],
    queryFn: () => fetch(`/api/reports/summary?storeId=${storeId}&from=${daysAgo(6)}&to=${todayEnd()}`).then(r => r.json()),
  })

  // Recent orders
  const { data: recentOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders-recent', storeId],
    queryFn: () => fetch(`/api/orders?storeId=${storeId}&limit=8`).then(r => r.json()),
  })

  // Low stock
  const { data: lowStock = [], isLoading: stockLoading } = useQuery({
    queryKey: ['inventory-low', storeId],
    queryFn: () => fetch(`/api/inventory?storeId=${storeId}&lowStockOnly=true`).then(r => r.json()),
  })

  // Top products today

  // Top products today (from today's summary)
  const topProducts = (data as any)?.topProducts ?? []

  const stats = data ?? {}
  const yStats = yesterday ?? {}

  function pctChange(today: number, yest: number) {
    if (!yest) return undefined
    return ((today - yest) / yest) * 100
  }

  // Sparkline from weekly dailySales
  const sparkRevenue: number[] = Array.isArray((weekData as any)?.dailySales)
    ? (weekData as any).dailySales.map((d: any) => d.total ?? 0)
    : []

  const dateLabel = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 space-y-6 max-w-screen-xl mx-auto">

      {/* ── Greeting ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-widest capitalize">
              {dateLabel}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">
            {getGreeting()}{userName ? `, ${userName.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-stone-400 mt-0.5 text-sm">Ini ringkasan tokomu hari ini.</p>
        </div>
        <Link
          href="/dashboard/pos"
          className="shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3.5 py-2 rounded-xl font-semibold text-sm shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Catat Penjualan</span>
          <span className="sm:hidden">Jual</span>
        </Link>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatsCard
          icon={DollarSign}
          label="Omzet Hari Ini"
          value={formatCurrency(stats.totalRevenue ?? 0, currency)}
          color="green"
          change={pctChange(stats.totalRevenue ?? 0, yStats.totalRevenue ?? 0)}
          loading={isLoading}
          sub={sparkRevenue.length > 1 ? '7 hari terakhir ↗' : undefined}
        />
        <StatsCard
          icon={ShoppingCart}
          label="Pesanan"
          value={String(stats.totalOrders ?? 0)}
          color="blue"
          change={pctChange(stats.totalOrders ?? 0, yStats.totalOrders ?? 0)}
          loading={isLoading}
        />
        <StatsCard
          icon={TrendingUp}
          label="Rata-rata Pesanan"
          value={formatCurrency(stats.avgOrderValue ?? 0, currency)}
          color="purple"
          loading={isLoading}
        />
        <StatsCard
          icon={Users}
          label="Pelanggan Baru"
          value={String(stats.newCustomers ?? 0)}
          color="orange"
          change={pctChange(stats.newCustomers ?? 0, yStats.newCustomers ?? 0)}
          loading={isLoading}
        />
      </div>

      {/* ── 7-day revenue sparkline card ── */}
      {sparkRevenue.length > 1 && (
        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Tren 7 Hari</p>
              <p className="text-sm font-semibold text-stone-700 mt-0.5">Omzet minggu ini</p>
            </div>
            <Link href="/dashboard/reports" className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1 transition-colors">
              Detail <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-end gap-1 h-16">
            {sparkRevenue.map((v, i) => {
              const max = Math.max(...sparkRevenue, 1)
              const pct = (v / max) * 100
              const isToday = i === sparkRevenue.length - 1
              const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
              const d = new Date(); d.setDate(d.getDate() - (sparkRevenue.length - 1 - i))
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: 44 }}>
                    <div
                      className={`w-full rounded-t-md transition-all ${isToday ? 'bg-amber-500' : 'bg-amber-200'}`}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={formatCurrency(v, currency)}
                    />
                  </div>
                  <span className={`text-[9px] font-medium ${isToday ? 'text-amber-600' : 'text-stone-400'}`}>
                    {dayNames[d.getDay()]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Quick actions (mobile-friendly pill row) ── */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <Link href="/dashboard/pos" className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-3 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all hover:bg-amber-100 active:scale-95 text-center">
          <ShoppingBag className="h-4 w-4 shrink-0" />
          <span>Kasir</span>
        </Link>
        <Link href="/dashboard/products" className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 bg-stone-50 border border-stone-200 text-stone-600 px-3 py-3 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all hover:bg-stone-100 active:scale-95 text-center">
          <Package className="h-4 w-4 shrink-0" />
          <span>Produk</span>
        </Link>
        <Link href="/dashboard/orders" className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 bg-stone-50 border border-stone-200 text-stone-600 px-3 py-3 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all hover:bg-stone-100 active:scale-95 text-center">
          <ShoppingCart className="h-4 w-4 shrink-0" />
          <span>Pesanan</span>
        </Link>
        <Link href="/dashboard/customers" className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 bg-stone-50 border border-stone-200 text-stone-600 px-3 py-3 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all hover:bg-stone-100 active:scale-95 text-center">
          <Users className="h-4 w-4 shrink-0" />
          <span>Pelanggan</span>
        </Link>
        <Link href="/dashboard/inventory" className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 bg-stone-50 border border-stone-200 text-stone-600 px-3 py-3 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all hover:bg-stone-100 active:scale-95 text-center">
          <Boxes className="h-4 w-4 shrink-0" />
          <span>Stok</span>
        </Link>
        <Link href="/dashboard/reports" className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 bg-stone-50 border border-stone-200 text-stone-600 px-3 py-3 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all hover:bg-stone-100 active:scale-95 text-center">
          <BarChart3 className="h-4 w-4 shrink-0" />
          <span>Laporan</span>
        </Link>
      </div>

      {/* ── Main content grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent orders */}
        <div className="bg-white border border-stone-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-stone-100">
            <h2 className="font-semibold text-stone-800 text-sm">Pesanan Terbaru</h2>
            <Link href="/dashboard/orders" className="text-amber-600 hover:text-amber-700 text-xs flex items-center gap-1 transition-colors font-medium">
              Lihat semua <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {ordersLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-stone-50 animate-pulse rounded-xl" />)}
            </div>
          ) : (recentOrders as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
              <ShoppingCart className="h-8 w-8 text-stone-200" />
              <p className="text-sm text-stone-400">Belum ada pesanan hari ini</p>
              <Link href="/dashboard/pos" className="text-xs text-amber-600 font-medium hover:underline">Mulai catat penjualan →</Link>
            </div>
          ) : (
            <div className="divide-y divide-stone-50">
              {(recentOrders as any[]).slice(0, 7).map((order: any) => {
                const style = STATUS_STYLES[order.status] ?? STATUS_STYLES.PENDING
                return (
                  <div key={order.id} className="flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-700">#{order.number}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{formatDate(order.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-sm font-bold text-stone-800">{formatCurrency(order.total, currency)}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.pill}`}>
                        {style.icon}{style.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Low stock + top products stacked */}
        <div className="space-y-4">

          {/* Low stock alerts */}
          <div className="bg-white border border-stone-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-stone-100">
              <h2 className="font-semibold text-stone-800 text-sm flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Stok Menipis
                {(lowStock as any[]).length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-600 text-[10px] font-bold rounded-full">
                    {(lowStock as any[]).length}
                  </span>
                )}
              </h2>
              <Link href="/dashboard/inventory" className="text-amber-600 hover:text-amber-700 text-xs flex items-center gap-1 transition-colors font-medium">
                Kelola <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {stockLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-stone-50 animate-pulse rounded-xl" />)}
              </div>
            ) : (lowStock as any[]).length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-sm text-stone-500">Semua stok aman ✓</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {(lowStock as any[]).slice(0, 5).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-stone-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                        <Package className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <p className="text-sm text-stone-700 truncate">{p.name}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 ${
                      p.stock === 0 ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                    }`}>
                      {p.stock === 0 ? 'Habis' : `${p.stock} sisa`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top products today */}
          {(topProducts as any[]).length > 0 && (
            <div className="bg-white border border-stone-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-stone-100">
                <h2 className="font-semibold text-stone-800 text-sm flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                  Produk Terlaris Hari Ini
                </h2>
                <Link href="/dashboard/reports" className="text-amber-600 hover:text-amber-700 text-xs flex items-center gap-1 transition-colors font-medium">
                  Laporan <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-stone-50">
                {(topProducts as any[]).slice(0, 5).map((p: any, i: number) => (
                  <div key={p.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                    <span className="text-xs font-bold text-stone-300 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-700 truncate">{p.name}</p>
                      <p className="text-xs text-stone-400">{p.qty ?? 0}x terjual</p>
                    </div>
                    <p className="text-sm font-bold text-stone-800 shrink-0">{formatCurrency(p.revenue ?? 0, currency)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Bottom padding for mobile nav ── */}
      <div className="h-4 lg:h-0" />

    </div>
  )
}
