'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Users,
  Plus,
  Package,
  BarChart3,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  XCircle,
  Boxes,
  Sparkles,
  ShoppingBag,
  Star,
  ChevronRight,
  UserCheck,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { formatCurrency, formatDate } from '@/lib/utils'

interface DashboardClientPageProps {
  storeId: string
  session: any
  modules?: string[]
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Selamat pagi'
  if (h < 17) return 'Selamat siang'
  return 'Selamat malam'
}

function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
function todayEnd() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; pill: string; label: string }> = {
  PAID: {
    icon: <CheckCircle2 className="h-3 w-3" />,
    pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
    label: 'Lunas',
  },
  PENDING: {
    icon: <Clock className="h-3 w-3" />,
    pill: 'bg-amber-50 text-amber-600 border border-amber-200',
    label: 'Pending',
  },
  VOIDED: {
    icon: <XCircle className="h-3 w-3" />,
    pill: 'bg-red-50 text-red-500 border border-red-200',
    label: 'Batal',
  },
}

// Simple SVG sparkline
function Sparkline({ data, color = '#f59e0b' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80,
    h = 32,
    pad = 2
  const pts = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2)
      const y = h - pad - ((v - min) / range) * (h - pad * 2)
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="shrink-0">
      <polyline
        points={pts}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <polyline
        points={`${pts} ${w - pad},${h} ${pad},${h}`}
        stroke="none"
        fill={color}
        fillOpacity="0.1"
      />
    </svg>
  )
}

export default function DashboardClientPage({
  storeId,
  session,
  modules,
}: DashboardClientPageProps) {
  // Use the active store's currency — find it by storeId first, fall back to first store
  const sessionStores: Array<{ id: string; name?: string; currency?: string }> =
    session?.user?.stores ?? []
  const activeSessionStore = sessionStores.find((s: any) => s.id === storeId) ?? sessionStores[0]
  const currency = activeSessionStore?.currency ?? 'IDR'
  const activeStoreName = activeSessionStore?.name ?? null
  const userName = session?.user?.name ?? ''
  const enabledModules = modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports']
  const hasPOS = enabledModules.includes('pos')
  const hasInventory = enabledModules.includes('inventory')
  const hasCustomers = enabledModules.includes('customers')

  // Active shift
  const {
    data: shiftData,
    isLoading: shiftLoading,
    refetch: refetchShift,
  } = useQuery({
    queryKey: ['shift-current', storeId],
    queryFn: () => fetch(`/api/shifts?storeId=${storeId}&active=true`).then(r => r.json()),
    refetchInterval: 30_000,
  })
  const activeShift = (shiftData as any) ?? null

  // Today's summary
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', storeId],
    queryFn: () =>
      fetch(`/api/reports/summary?storeId=${storeId}&from=${todayStart()}&to=${todayEnd()}`).then(
        r => r.json(),
      ),
  })

  // Yesterday for comparison
  const { data: yesterday } = useQuery({
    queryKey: ['dashboard-summary-yesterday', storeId],
    queryFn: () => {
      const y = new Date()
      y.setDate(y.getDate() - 1)
      const ys = new Date(y)
      ys.setHours(0, 0, 0, 0)
      const ye = new Date(y)
      ye.setHours(23, 59, 59, 999)
      return fetch(
        `/api/reports/summary?storeId=${storeId}&from=${ys.toISOString()}&to=${ye.toISOString()}`,
      ).then(r => r.json())
    },
  })

  // 7-day trend
  const { data: weekData } = useQuery({
    queryKey: ['dashboard-week', storeId],
    queryFn: () =>
      fetch(`/api/reports/summary?storeId=${storeId}&from=${daysAgo(6)}&to=${todayEnd()}`).then(r =>
        r.json(),
      ),
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

  const stats = (data as any) ?? {}
  const yStats = (yesterday as any) ?? {}

  function pctChange(today: number, yest: number) {
    if (!yest) return undefined
    return ((today - yest) / yest) * 100
  }

  // Sparkline from weekly dailySales
  const sparkRevenue: number[] = Array.isArray((weekData as any)?.dailySales)
    ? (weekData as any).dailySales.map((d: any) => d.total ?? 0)
    : []

  const dateLabel = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
      {/* ── Greeting ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[11px] font-semibold tracking-widest text-amber-600 capitalize uppercase">
              {dateLabel}
            </span>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">
            {getGreeting()}
            {userName ? `, ${userName.split(' ')[0]}` : ''} 👋
          </h1>
          {activeStoreName && (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              {activeStoreName}
            </p>
          )}
          <p className="mt-1 text-sm text-[var(--text-3)]">Ini ringkasan tokomu hari ini.</p>
        </div>
        <Link
          href="/dashboard/pos"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Catat Penjualan</span>
          <span className="sm:hidden">Jual</span>
        </Link>
      </div>

      {/* ── Shift status widget ── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        {shiftLoading ? (
          <div className="h-10 animate-pulse rounded-xl bg-amber-100" />
        ) : activeShift ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500">
                <UserCheck className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase">
                  Shift Aktif
                </p>
                <p className="mt-0.5 text-sm font-bold text-[var(--text-1)]">
                  {activeShift.userName ?? 'Kasir'}
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-6 text-center sm:flex">
              <div>
                <p className="text-[10px] tracking-widest text-[var(--text-3)] uppercase">Dibuka</p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-1)]">
                  {new Date(activeShift.openedAt).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div>
                <p className="text-[10px] tracking-widest text-[var(--text-3)] uppercase">
                  Kas Awal
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-1)]">
                  {formatCurrency(activeShift.openingCash ?? 0, currency)}
                </p>
              </div>
              <div>
                <p className="text-[10px] tracking-widest text-[var(--text-3)] uppercase">
                  Omzet Shift
                </p>
                <p className="mt-0.5 text-xs font-semibold text-amber-700">
                  {formatCurrency(stats.totalRevenue ?? 0, currency)}
                </p>
              </div>
            </div>
            <a
              href="/dashboard/shifts"
              className="shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 hover:text-amber-800"
            >
              Detail
            </a>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-200">
                <Clock className="h-4 w-4 text-[var(--text-3)]" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest text-[var(--text-2)] uppercase">
                  Tidak ada shift aktif
                </p>
                <p className="mt-0.5 text-sm text-[var(--text-3)]">
                  Buka shift untuk mulai mencatat penjualan
                </p>
              </div>
            </div>
            <a
              href="/dashboard/shifts"
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Buka Shift
            </a>
          </div>
        )}
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Link href="/dashboard/reports" className="block transition-transform active:scale-95">
          <StatsCard
            icon={DollarSign}
            label="Omzet Hari Ini"
            value={formatCurrency(stats.totalRevenue ?? 0, currency)}
            color="green"
            change={pctChange(stats.totalRevenue ?? 0, yStats.totalRevenue ?? 0)}
            loading={isLoading}
            sub={sparkRevenue.length > 1 ? '7 hari terakhir ↗' : undefined}
          />
        </Link>
        <Link href="/dashboard/orders" className="block transition-transform active:scale-95">
          <StatsCard
            icon={ShoppingCart}
            label={`Pesanan${stats.totalOrders ? ` — ${stats.totalOrders} transaksi hari ini` : ''}`}
            value={String(stats.totalOrders ?? 0)}
            color="blue"
            change={pctChange(stats.totalOrders ?? 0, yStats.totalOrders ?? 0)}
            loading={isLoading}
          />
        </Link>
        <Link href="/dashboard/reports" className="block transition-transform active:scale-95">
          <StatsCard
            icon={TrendingUp}
            label="Rata-rata Pesanan"
            value={formatCurrency(stats.avgOrderValue ?? 0, currency)}
            color="purple"
            loading={isLoading}
          />
        </Link>
        <Link href="/dashboard/customers" className="block transition-transform active:scale-95">
          <StatsCard
            icon={Users}
            label="Pelanggan Baru"
            value={String(stats.newCustomers ?? 0)}
            color="orange"
            change={pctChange(stats.newCustomers ?? 0, yStats.newCustomers ?? 0)}
            loading={isLoading}
          />
        </Link>
      </div>

      {/* ── Today's Performance summary bar ── */}
      {!isLoading && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-xs font-semibold tracking-widest text-[var(--text-3)] uppercase">
              Performa Hari Ini
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
            {/* Revenue vs yesterday */}
            {(() => {
              const today = stats.totalRevenue ?? 0
              const yest = yStats.totalRevenue ?? 0
              const pct = yest > 0 ? ((today - yest) / yest) * 100 : undefined
              const up = pct !== undefined && pct >= 0
              return (
                <div className="flex flex-col gap-1 px-4 py-3">
                  <p className="truncate text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
                    Omzet
                  </p>
                  <p className="truncate text-sm font-bold text-[var(--text-1)] sm:text-base">
                    {formatCurrency(today, currency)}
                  </p>
                  {pct !== undefined ? (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}
                    >
                      {up ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {Math.abs(pct).toFixed(1)}% vs kemarin
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px] text-stone-300">
                      <Minus className="h-3 w-3" /> belum ada data kemarin
                    </span>
                  )}
                </div>
              )
            })()}

            {/* Orders vs yesterday */}
            {(() => {
              const today = stats.totalOrders ?? 0
              const yest = yStats.totalOrders ?? 0
              const pct = yest > 0 ? ((today - yest) / yest) * 100 : undefined
              const up = pct !== undefined && pct >= 0
              return (
                <div className="flex flex-col gap-1 px-4 py-3">
                  <p className="truncate text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
                    Pesanan
                  </p>
                  <p className="text-sm font-bold text-[var(--text-1)] sm:text-base">{today}</p>
                  {pct !== undefined ? (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}
                    >
                      {up ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {Math.abs(pct).toFixed(1)}% vs kemarin
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px] text-stone-300">
                      <Minus className="h-3 w-3" /> belum ada data kemarin
                    </span>
                  )}
                </div>
              )
            })()}

            {/* Top selling product */}
            {(() => {
              const top = (topProducts as any[])[0]
              return (
                <div className="flex flex-col gap-1 px-4 py-3">
                  <p className="truncate text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
                    Produk Terlaris
                  </p>
                  {top ? (
                    <>
                      <p className="truncate text-sm font-bold text-[var(--text-1)]">{top.name}</p>
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {top.qty ?? 0}x terjual
                      </span>
                    </>
                  ) : (
                    <p className="text-sm text-stone-300">—</p>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── 7-day revenue sparkline card ── */}
      {sparkRevenue.length > 1 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-widest text-[var(--text-3)] uppercase">
                Tren 7 Hari
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--text-1)]">Omzet minggu ini</p>
            </div>
            <Link
              href="/dashboard/reports"
              className="flex items-center gap-1 text-xs text-amber-600 transition-colors hover:text-amber-700"
            >
              Detail <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex h-16 items-end gap-1">
            {sparkRevenue.map((v, i) => {
              const max = Math.max(...sparkRevenue, 1)
              const pct = (v / max) * 100
              const isToday = i === sparkRevenue.length - 1
              const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
              const d = new Date()
              d.setDate(d.getDate() - (sparkRevenue.length - 1 - i))
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-col justify-end" style={{ height: 44 }}>
                    <div
                      className={`w-full rounded-t-md transition-all ${isToday ? 'bg-amber-500' : 'bg-amber-200'}`}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={formatCurrency(v, currency)}
                    />
                  </div>
                  <span
                    className={`text-[9px] font-medium ${isToday ? 'text-amber-600' : 'text-[var(--text-3)]'}`}
                  >
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
        <Link
          href="/dashboard/pos"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-center text-xs font-medium text-amber-700 transition-all hover:bg-amber-100 active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          <ShoppingBag className="h-4 w-4 shrink-0" />
          <span>Kasir</span>
        </Link>
        <Link
          href="/dashboard/products"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          <Package className="h-4 w-4 shrink-0" />
          <span>Produk</span>
        </Link>
        <Link
          href="/dashboard/orders"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          <ShoppingCart className="h-4 w-4 shrink-0" />
          <span>Pesanan</span>
        </Link>
        <Link
          href="/dashboard/customers"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          <Users className="h-4 w-4 shrink-0" />
          <span>Pelanggan</span>
        </Link>
        <Link
          href="/dashboard/inventory"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          <Boxes className="h-4 w-4 shrink-0" />
          <span>Stok</span>
        </Link>
        <Link
          href="/dashboard/reports"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          <BarChart3 className="h-4 w-4 shrink-0" />
          <span>Laporan</span>
        </Link>
      </div>

      {/* ── Main content grid ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent orders */}
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Pesanan Terbaru</h2>
            <Link
              href="/dashboard/orders"
              className="flex items-center gap-1 text-xs font-medium text-amber-600 transition-colors hover:text-amber-700"
            >
              Lihat semua <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {ordersLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
              ))}
            </div>
          ) : (recentOrders as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <ShoppingCart className="h-8 w-8 text-stone-200" />
              <p className="text-sm text-[var(--text-3)]">Belum ada pesanan hari ini</p>
              <Link
                href="/dashboard/pos"
                className="text-xs font-medium text-amber-600 hover:underline"
              >
                Mulai catat penjualan →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-stone-50">
              {(recentOrders as any[]).slice(0, 7).map((order: any) => {
                const style = STATUS_STYLES[order.status] ?? STATUS_STYLES.PENDING
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-1)]">#{order.number}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-sm font-bold text-[var(--text-1)]">
                        {formatCurrency(order.total, currency)}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.pill}`}
                      >
                        {style.icon}
                        {style.label}
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
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Stok Menipis
                {(lowStock as any[]).length > 0 && (
                  <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                    {(lowStock as any[]).length}
                  </span>
                )}
              </h2>
              <Link
                href="/dashboard/inventory"
                className="flex items-center gap-1 text-xs font-medium text-amber-600 transition-colors hover:text-amber-700"
              >
                Kelola <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {stockLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
                ))}
              </div>
            ) : (lowStock as any[]).length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-sm text-[var(--text-2)]">Semua stok aman ✓</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {(lowStock as any[]).slice(0, 5).map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                        <Package className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <p className="truncate text-sm text-[var(--text-1)]">{p.name}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold ${
                        p.stock === 0
                          ? 'border border-red-100 bg-red-50 text-red-500'
                          : 'border border-amber-100 bg-amber-50 text-amber-600'
                      }`}
                    >
                      {p.stock === 0 ? 'Habis' : `${p.stock} sisa`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top products today */}
          {(topProducts as any[]).length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                  Produk Terlaris Hari Ini
                </h2>
                <Link
                  href="/dashboard/reports"
                  className="flex items-center gap-1 text-xs font-medium text-amber-600 transition-colors hover:text-amber-700"
                >
                  Laporan <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-stone-50">
                {(topProducts as any[]).slice(0, 5).map((p: any, i: number) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <span className="w-4 shrink-0 text-xs font-bold text-stone-300">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[var(--text-1)]">{p.name}</p>
                      <p className="text-xs text-[var(--text-3)]">{p.qty ?? 0}x terjual</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-[var(--text-1)]">
                      {formatCurrency(p.revenue ?? 0, currency)}
                    </p>
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
