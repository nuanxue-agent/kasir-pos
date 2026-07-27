'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, ShoppingCart, TrendingUp, Users } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { formatCurrency } from '@/lib/utils'
import { SalesChart } from './SalesChart'
import { TopProductsChart } from './TopProductsChart'
import { PaymentBreakdown } from './PaymentBreakdown'

interface ReportsPageClientProps {
  storeId: string
  currency: string
  taxRate: number
}

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

interface ReportData {
  summary: {
    totalRevenue: number
    totalOrders: number
    avgOrderValue: number
    newCustomers: number
  }
  topProducts: Array<{
    productId: string
    name: string
    _sum: { subtotal: number; qty: number }
  }>
  dailySales: Array<{ date: string; total: number; orders: number }>
  paymentBreakdown: Array<{
    method: string
    _sum: { amount: number }
    _count: { id: number }
  }>
}

function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  switch (range) {
    case 'today':
      return {
        from: today.toISOString(),
        to: now.toISOString(),
      }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayEnd = new Date(yesterday)
      yesterdayEnd.setHours(23, 59, 59, 999)
      return {
        from: yesterday.toISOString(),
        to: yesterdayEnd.toISOString(),
      }
    }
    case 'week': {
      const weekStart = new Date(today)
      weekStart.setDate(weekStart.getDate() - 7)
      return {
        from: weekStart.toISOString(),
        to: now.toISOString(),
      }
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      return {
        from: monthStart.toISOString(),
        to: now.toISOString(),
      }
    }
    default:
      return {
        from: today.toISOString(),
        to: now.toISOString(),
      }
  }
}

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

  const rangeButtons: Array<{ value: DateRange; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'custom', label: 'Custom' },
  ]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Reports</h1>
        <p className="text-stone-500 mt-1">Sales analytics and performance metrics</p>
      </div>

      {/* Date Range Selector */}
      <div className="bg-stone-100 rounded-lg p-4 border border-stone-200">
        <div className="flex flex-wrap items-center gap-2">
          {rangeButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setDateRange(btn.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === btn.value
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-700 text-stone-600 hover:bg-slate-600'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {dateRange === 'custom' && (
          <div className="flex gap-4 mt-4">
            <div>
              <label className="block text-sm text-stone-500 mb-1">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm text-stone-500 mb-1">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-stone-100 rounded-lg h-32 animate-pulse border border-stone-200" />
            ))}
          </>
        ) : (
          <>
            <div className="bg-stone-100 rounded-lg border border-stone-200 p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-lg p-2.5 bg-emerald-500/10 shrink-0">
                  <DollarSign className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-500">Total Revenue</p>
                  <p className="text-2xl font-semibold text-white mt-0.5">
                    {formatCurrency(data?.summary.totalRevenue ?? 0, currency)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-stone-100 rounded-lg border border-stone-200 p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-lg p-2.5 bg-blue-500/10 shrink-0">
                  <ShoppingCart className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-500">Total Orders</p>
                  <p className="text-2xl font-semibold text-white mt-0.5">
                    {data?.summary.totalOrders ?? 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-stone-100 rounded-lg border border-stone-200 p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-lg p-2.5 bg-purple-500/10 shrink-0">
                  <TrendingUp className="h-5 w-5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-500">Avg Order Value</p>
                  <p className="text-2xl font-semibold text-white mt-0.5">
                    {formatCurrency(data?.summary.avgOrderValue ?? 0, currency)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-stone-100 rounded-lg border border-stone-200 p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-lg p-2.5 bg-orange-500/10 shrink-0">
                  <Users className="h-5 w-5 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-500">New Customers</p>
                  <p className="text-2xl font-semibold text-white mt-0.5">
                    {data?.summary.newCustomers ?? 0}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="bg-stone-100 rounded-lg border border-stone-200 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Revenue Trend</h3>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-600 border-t-indigo-500" />
            </div>
          ) : (
            <SalesChart data={data?.dailySales ?? []} currency={currency} />
          )}
        </div>

        {/* Top Products Chart */}
        <div className="bg-stone-100 rounded-lg border border-stone-200 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Top 5 Products</h3>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-600 border-t-indigo-500" />
            </div>
          ) : (
            <TopProductsChart data={data?.topProducts.slice(0, 5) ?? []} currency={currency} />
          )}
        </div>
      </div>

      {/* Bottom Row: Payment Breakdown & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Breakdown */}
        <div className="bg-stone-100 rounded-lg border border-stone-200 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Payment Methods</h3>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-600 border-t-indigo-500" />
            </div>
          ) : (
            <PaymentBreakdown data={data?.paymentBreakdown ?? []} currency={currency} />
          )}
        </div>

        {/* Recent Orders Table */}
        <div className="bg-stone-100 rounded-lg border border-stone-200 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Orders</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-slate-700 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-stone-500 border-b border-stone-200">
                    <th className="text-left py-2 px-2">Order #</th>
                    <th className="text-left py-2 px-2">Time</th>
                    <th className="text-right py-2 px-2">Total</th>
                    <th className="text-left py-2 px-2">Method</th>
                  </tr>
                </thead>
                <tbody className="text-stone-600">
                  {data?.dailySales.slice(0, 5).map((sale, idx) => (
                    <tr key={idx} className="border-b border-stone-200/50">
                      <td className="py-3 px-2">#{idx + 1}</td>
                      <td className="py-3 px-2">{new Date(sale.date).toLocaleDateString()}</td>
                      <td className="py-3 px-2 text-right font-medium">
                        {formatCurrency(sale.total, currency)}
                      </td>
                      <td className="py-3 px-2">-</td>
                    </tr>
                  )) ?? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-stone-500">
                        No orders found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
