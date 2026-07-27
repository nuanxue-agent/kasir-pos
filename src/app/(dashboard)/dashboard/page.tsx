import { Suspense } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { OrderStatus } from '@prisma/client'
import { StatsCard } from '@/components/dashboard/StatsCard'
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
} from 'lucide-react'

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getDashboardData(storeIds: string[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000)

  const storeFilter = storeIds.length > 0 ? { storeId: { in: storeIds } } : {}

  const [
    todayOrders,
    yesterdayOrders,
    recentOrders,
    lowStockProducts,
    newCustomersToday,
    newCustomersYesterday,
  ] = await Promise.all([
    // Today's completed orders
    prisma.order.findMany({
      where: { ...storeFilter, createdAt: { gte: todayStart }, status: OrderStatus.PAID },
      select: { total: true },
    }),
    // Yesterday's completed orders
    prisma.order.findMany({
      where: {
        ...storeFilter,
        createdAt: { gte: yesterdayStart, lt: todayStart },
        status: OrderStatus.PAID,
      },
      select: { total: true },
    }),
    // Last 10 orders (any status)
    prisma.order.findMany({
      where: storeFilter,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        createdAt: true,
        customer: { select: { name: true } },
        store: { select: { name: true } },
      },
    }),
    // Low stock products
    prisma.product.findMany({
      where: {
        ...storeFilter,
        trackStock: true,
        // stock <= lowStock threshold
      },
      select: { id: true, name: true, stock: true, lowStock: true, store: { select: { name: true } } },
      orderBy: { stock: 'asc' },
      take: 5,
    }),
    // New customers today
    prisma.customer.count({
      where: { ...storeFilter, createdAt: { gte: todayStart } },
    }),
    // New customers yesterday
    prisma.customer.count({
      where: { ...storeFilter, createdAt: { gte: yesterdayStart, lt: todayStart } },
    }),
  ])

  // Filter low-stock in JS (stock <= lowStock threshold)
  const lowStock = lowStockProducts.filter((p) => p.stock <= p.lowStock)

  const todaySales   = todayOrders.reduce((sum, o) => sum + o.total, 0)
  const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + o.total, 0)
  const avgOrderValue = todayOrders.length > 0 ? todaySales / todayOrders.length : 0
  const yesterdayAvg  = yesterdayOrders.length > 0
    ? yesterdayOrders.reduce((s, o) => s + o.total, 0) / yesterdayOrders.length
    : 0

  function pctChange(today: number, yesterday: number) {
    if (yesterday === 0) return today > 0 ? 100 : 0
    return ((today - yesterday) / yesterday) * 100
  }

  return {
    stats: {
      totalSales:    { value: todaySales,          change: pctChange(todaySales, yesterdaySales) },
      ordersCount:   { value: todayOrders.length,  change: pctChange(todayOrders.length, yesterdayOrders.length) },
      avgOrderValue: { value: avgOrderValue,        change: pctChange(avgOrderValue, yesterdayAvg) },
      newCustomers:  { value: newCustomersToday,    change: pctChange(newCustomersToday, newCustomersYesterday) },
    },
    recentOrders,
    lowStock,
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  PAID:     'bg-emerald-100 text-emerald-700',
  PENDING:  'bg-yellow-100 text-yellow-700',
  VOIDED:   'bg-red-100 text-red-600',
  REFUNDED: 'bg-gray-100 text-gray-600',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const storeIds = (session.user.stores ?? []).map((s: { id: string }) => s.id)
  const { stats, recentOrders, lowStock } = await getDashboardData(storeIds)

  const currency = 'IDR'

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Good {getGreeting()}, {session.user.name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Here&apos;s what&apos;s happening in your stores today.
        </p>
      </div>

      {/* Stat cards */}
      <Suspense fallback={<StatsGridSkeleton />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard
            icon={DollarSign}
            label="Total Sales"
            value={formatCurrency(stats.totalSales.value, currency)}
            change={stats.totalSales.change}
            variant="green"
          />
          <StatsCard
            icon={ShoppingCart}
            label="Orders Today"
            value={String(stats.ordersCount.value)}
            change={stats.ordersCount.change}
            variant="blue"
          />
          <StatsCard
            icon={TrendingUp}
            label="Avg Order Value"
            value={formatCurrency(stats.avgOrderValue.value, currency)}
            change={stats.avgOrderValue.change}
            variant="purple"
          />
          <StatsCard
            icon={Users}
            label="New Customers"
            value={String(stats.newCustomers.value)}
            change={stats.newCustomers.change}
            variant="orange"
          />
        </div>
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders — spans 2 cols */}
        <section className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-800">Recent Orders</h2>
            <Link
              href="/dashboard/orders"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No orders yet today.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Total</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={`/dashboard/orders/${order.id}`}
                          className="font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          {order.number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {order.customer?.name ?? <span className="text-gray-400 italic">Walk-in</span>}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-gray-800">
                        {formatCurrency(order.total, currency)}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right column */}
        <div className="space-y-6">
          {/* Quick actions */}
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-3">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                href="/dashboard/pos"
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Sale
              </Link>
              <Link
                href="/dashboard/products/new"
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Package className="h-4 w-4 text-gray-400" />
                Add Product
              </Link>
              <Link
                href="/dashboard/reports"
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <BarChart3 className="h-4 w-4 text-gray-400" />
                View Reports
              </Link>
            </div>
          </section>

          {/* Low stock alerts */}
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                Low Stock
              </h2>
              <Link
                href="/dashboard/inventory"
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {lowStock.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">All stock levels OK.</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {lowStock.map((product) => (
                  <li key={product.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.store.name}</p>
                    </div>
                    <span
                      className={`shrink-0 ml-3 text-xs font-semibold px-2 py-0.5 rounded ${
                        product.stock === 0
                          ? 'bg-red-100 text-red-600'
                          : 'bg-orange-100 text-orange-600'
                      }`}
                    >
                      {product.stock} left
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function StatsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-lg bg-gray-100" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 bg-gray-100 rounded w-2/3" />
              <div className="h-6 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
