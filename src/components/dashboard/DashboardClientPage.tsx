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
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function todayEnd() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; pill: string }> = {
  PAID:    { icon: <CheckCircle2 className="h-3 w-3" />, pill: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' },
  PENDING: { icon: <Clock        className="h-3 w-3" />, pill: 'bg-amber-500/15   text-amber-400   border border-amber-500/20' },
  VOIDED:  { icon: <XCircle      className="h-3 w-3" />, pill: 'bg-red-500/15     text-red-400     border border-red-500/20' },
}

export default function DashboardClientPage({ storeId, session }: DashboardClientPageProps) {
  const currency = session?.user?.stores?.[0]?.currency ?? 'IDR'
  const userName = session?.user?.name ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', storeId],
    queryFn: () =>
      fetch(`/api/reports/summary?storeId=${storeId}&from=${todayStart()}&to=${todayEnd()}`)
        .then((r) => r.json()),
  })

  const { data: recentOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders-recent', storeId],
    queryFn: () =>
      fetch(`/api/orders?storeId=${storeId}&limit=10`).then((r) => r.json()),
  })

  const { data: lowStock = [], isLoading: stockLoading } = useQuery({
    queryKey: ['inventory-low', storeId],
    queryFn: () =>
      fetch(`/api/inventory?storeId=${storeId}&lowStockOnly=true`).then((r) => r.json()),
  })

  const stats: {
    totalRevenue?: number
    totalOrders?: number
    avgOrderValue?: number
    newCustomers?: number
  } = data ?? {}

  return (
    <div className="p-6 space-y-8 max-w-screen-2xl mx-auto">

      {/* Greeting */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-600 uppercase tracking-widest">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-stone-800">
            {getGreeting()}{userName ? `, ${userName.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-stone-400 mt-1 text-sm">Ini ringkasan tokomu hari ini.</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={DollarSign}
          label="Omzet Hari Ini"
          value={formatCurrency(stats.totalRevenue ?? 0, currency)}
          color="green"
          loading={isLoading}
        />
        <StatsCard
          icon={ShoppingCart}
          label="Pesanan Hari Ini"
          value={String(stats.totalOrders ?? 0)}
          color="blue"
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
          loading={isLoading}
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/pos"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-indigo-500 hover:to-violet-500 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-amber-500/20 transition-all duration-150 active:scale-95"
        >
          <Plus size={16} />
          Catat Penjualan
        </Link>
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 text-stone-600 hover:text-stone-700 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150"
        >
          <Package size={16} />
          Tambah Produk
        </Link>
        <Link
          href="/dashboard/reports"
          className="inline-flex items-center gap-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 text-stone-600 hover:text-stone-700 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150"
        >
          <BarChart3 size={16} />
          Lihat Laporan
        </Link>
      </div>

      {/* Two-column: orders + stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent orders */}
        <div className="bg-stone-50 backdrop-blur border border-stone-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
            <h2 className="font-semibold text-stone-800 text-sm">Pesanan Terbaru</h2>
            <Link
              href="/dashboard/orders"
              className="text-amber-600 hover:text-amber-500 text-xs flex items-center gap-1 transition-colors"
            >
              Lihat semua <ArrowRight size={12} />
            </Link>
          </div>

          {ordersLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-stone-50 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (recentOrders as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <ShoppingCart className="h-8 w-8 text-stone-200" />
              <p className="text-sm text-stone-400">Belum ada pesanan hari ini</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {(recentOrders as any[]).slice(0, 8).map((order: any) => {
                const style = STATUS_STYLES[order.status] ?? STATUS_STYLES.PENDING
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between px-5 py-3 hover:bg-stone-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-stone-700">#{order.number}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{formatDate(order.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-stone-800">
                        {formatCurrency(order.total, currency)}
                      </p>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${style.pill}`}>
                        {style.icon}
                        {order.status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Low stock alerts */}
        <div className="bg-stone-50 backdrop-blur border border-stone-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
            <h2 className="font-semibold text-stone-800 text-sm flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400" />
              Stok Menipis
            </h2>
            <Link
              href="/dashboard/inventory"
              className="text-amber-600 hover:text-amber-500 text-xs flex items-center gap-1 transition-colors"
            >
              Lihat semua <ArrowRight size={12} />
            </Link>
          </div>

          {stockLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-stone-50 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (lowStock as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Boxes className="h-8 w-8 text-stone-200" />
              <p className="text-sm text-stone-400">All products well stocked ✓</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {(lowStock as any[]).slice(0, 8).map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-5 py-3 hover:bg-stone-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-center shrink-0">
                      <Package className="h-3.5 w-3.5 text-stone-400" />
                    </div>
                    <p className="text-sm text-stone-700 truncate">{p.name}</p>
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-lg shrink-0 ${
                      p.stock === 0
                        ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
