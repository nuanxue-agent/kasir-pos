'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ShoppingCart, DollarSign, TrendingUp, Users, Plus, Package, BarChart3, AlertTriangle, ArrowRight } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { formatCurrency, formatDate } from '@/lib/utils'

interface DashboardClientPageProps {
  storeId: string
  session: any
}

export default function DashboardClientPage({ storeId, session }: DashboardClientPageProps) {
  const currency = session?.user?.stores?.[0]?.currency ?? 'IDR'

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', storeId],
    queryFn: () => fetch(`/api/reports/summary?storeId=${storeId}&from=${todayStart()}&to=${todayEnd()}`).then(r => r.json()),
  })

  const { data: recentOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders-recent', storeId],
    queryFn: () => fetch(`/api/orders?storeId=${storeId}&limit=10`).then(r => r.json()),
  })

  const { data: lowStock = [], isLoading: stockLoading } = useQuery({
    queryKey: ['inventory-low', storeId],
    queryFn: () => fetch(`/api/inventory?storeId=${storeId}&lowStockOnly=true`).then(r => r.json()),
  })

  const stats = data ?? {}

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1 text-sm">Welcome back, {session?.user?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={DollarSign}
          label="Today's Revenue"
          value={formatCurrency(stats.totalRevenue ?? 0, currency)}
          color="green"
          loading={isLoading}
        />
        <StatsCard
          icon={ShoppingCart}
          label="Today's Orders"
          value={String(stats.totalOrders ?? 0)}
          color="blue"
          loading={isLoading}
        />
        <StatsCard
          icon={TrendingUp}
          label="Avg Order"
          value={formatCurrency(stats.avgOrderValue ?? 0, currency)}
          color="purple"
          loading={isLoading}
        />
        <StatsCard
          icon={Users}
          label="New Customers"
          value={String(stats.newCustomers ?? 0)}
          color="orange"
          loading={isLoading}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/dashboard/pos" className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-xl font-medium text-sm transition-colors">
          <Plus size={18} /> New Sale
        </Link>
        <Link href="/dashboard/products" className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl font-medium text-sm transition-colors border border-slate-700">
          <Package size={18} /> Add Product
        </Link>
        <Link href="/dashboard/reports" className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl font-medium text-sm transition-colors border border-slate-700">
          <BarChart3 size={18} /> View Reports
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <h2 className="font-semibold text-white">Recent Orders</h2>
            <Link href="/dashboard/orders" className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-700">
            {ordersLoading ? (
              [...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-700/50 animate-pulse m-3 rounded-lg" />)
            ) : recentOrders.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">No orders yet</p>
            ) : recentOrders.slice(0, 8).map((order: any) => (
              <div key={order.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-700/50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-white">#{order.number}</p>
                  <p className="text-xs text-slate-400">{formatDate(order.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-white">{formatCurrency(order.total, currency)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    order.status === 'PAID' ? 'bg-green-900/50 text-green-400' :
                    order.status === 'VOIDED' ? 'bg-red-900/50 text-red-400' :
                    'bg-slate-700 text-slate-400'
                  }`}>{order.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" /> Low Stock
            </h2>
            <Link href="/dashboard/inventory" className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-700">
            {stockLoading ? (
              [...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-700/50 animate-pulse m-3 rounded-lg" />)
            ) : lowStock.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">All products well stocked ✓</p>
            ) : lowStock.slice(0, 8).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm text-white">{p.name}</p>
                <span className={`text-xs font-mono px-2 py-1 rounded-lg ${
                  p.stock === 0 ? 'bg-red-900/50 text-red-400' : 'bg-amber-900/50 text-amber-400'
                }`}>
                  {p.stock} left
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
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
