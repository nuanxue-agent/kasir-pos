'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  DollarSign, ShoppingCart, Users, TrendingUp,
  BarChart2, Clock, Calendar, Repeat,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ExportButton } from '@/components/ExportButton'
import type { ExportColumn } from '@/lib/export'

interface SalesAnalyticsClientProps {
  storeId: string
  currency: string
}

type DateRange = 'today' | 'week' | 'month' | 'quarter' | 'custom'

interface AnalyticsData {
  hourlyData: Array<{ hour: number; revenue: number; orders: number }>
  dayOfWeekData: Array<{ day: string; revenue: number; orders: number }>
  categoryBreakdown: Array<{ category: string; revenue: number; pct: number }>
  customerStats: { newCustomers: number; returningCustomers: number; retentionRate: number }
  paymentMethods: Array<{ method: string; total: number; count: number }>
}

interface SummaryData {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  newCustomers: number
}

function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case 'today':
      return { from: today.toISOString(), to: now.toISOString() }
    case 'week': {
      const w = new Date(today); w.setDate(w.getDate() - 7)
      return { from: w.toISOString(), to: now.toISOString() }
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: m.toISOString(), to: now.toISOString() }
    }
    case 'quarter': {
      const q = new Date(today); q.setDate(q.getDate() - 90)
      return { from: q.toISOString(), to: now.toISOString() }
    }
    default:
      return { from: today.toISOString(), to: now.toISOString() }
  }
}

const RANGE_BTNS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'Last 3 Months' },
  { value: 'custom', label: 'Custom' },
]

const PIE_COLORS = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#d97706', '#b45309']

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Transfer',
  QRIS: 'QRIS',
  OTHER: 'Other',
}

const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'hour', label: 'Hour' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'orders', label: 'Orders' },
]

function SummaryCard({
  icon: Icon,
  label,
  value,
  iconBg,
  iconColor,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  iconBg: string
  iconColor: string
}) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <p className="text-xs font-medium text-[var(--text-3)]">{label}</p>
      </div>
      <p className="text-xl font-bold text-[var(--text-1)]">{value}</p>
    </div>
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-[var(--bg-subtle)] animate-pulse rounded-xl border border-[var(--border)] ${className}`} />
}

export function SalesAnalyticsClient({ storeId, currency }: SalesAnalyticsClientProps) {
  const [dateRange, setDateRange] = useState<DateRange>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } =
    dateRange === 'custom' && customFrom && customTo
      ? { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() }
      : getDateRange(dateRange)

  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryData>({
    queryKey: ['reports-summary', storeId, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/reports/summary?${new URLSearchParams({ storeId, from, to })}`)
      if (!res.ok) throw new Error('Failed to fetch summary')
      return res.json()
    },
  })

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ['reports-analytics', storeId, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/reports/analytics?${new URLSearchParams({ storeId, from, to })}`)
      if (!res.ok) throw new Error('Failed to fetch analytics')
      return res.json()
    },
  })

  const isLoading = summaryLoading || analyticsLoading

  const exportRows = (analytics?.hourlyData ?? []).map((h) => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    revenue: h.revenue,
    orders: h.orders,
  }))

  // Day-of-week heatmap colour scale
  const maxDayRevenue = Math.max(1, ...(analytics?.dayOfWeekData ?? []).map((d) => d.revenue))

  const totalPayments = (analytics?.paymentMethods ?? []).reduce((s, p) => s + p.total, 0)

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Sales Analytics</h1>
          <p className="text-[var(--text-3)] text-sm mt-0.5">Deep-dive into your store performance</p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            type="pdf"
            label="Export PDF"
            data={exportRows}
            columns={EXPORT_COLUMNS}
            filename={`analytics-${from.slice(0, 10)}-${to.slice(0, 10)}`}
            title="Sales Analytics Report"
            currency={currency}
          />
          <ExportButton
            type="excel"
            label="Export Excel"
            data={exportRows}
            columns={EXPORT_COLUMNS}
            filename={`analytics-${from.slice(0, 10)}-${to.slice(0, 10)}`}
            title="Sales Analytics Report"
            currency={currency}
          />
        </div>
      </div>

      {/* Date range selector */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          {RANGE_BTNS.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setDateRange(btn.value)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                dateRange === btn.value
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-muted)] border border-[var(--border)]'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2">
              <span className="text-xs text-[var(--text-3)]">From</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-sm text-[var(--text-1)] bg-transparent focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2">
              <span className="text-xs text-[var(--text-3)]">To</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-sm text-[var(--text-1)] bg-transparent focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <SummaryCard
              icon={DollarSign}
              label="Total Revenue"
              value={formatCurrency(summary?.totalRevenue ?? 0, currency)}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
            <SummaryCard
              icon={ShoppingCart}
              label="Total Orders"
              value={summary?.totalOrders ?? 0}
              iconBg="bg-amber-50"
              iconColor="text-amber-500"
            />
            <SummaryCard
              icon={TrendingUp}
              label="Avg Order Value"
              value={formatCurrency(summary?.avgOrderValue ?? 0, currency)}
              iconBg="bg-blue-50"
              iconColor="text-blue-500"
            />
            <SummaryCard
              icon={Users}
              label="Unique Customers"
              value={
                (analytics?.customerStats?.newCustomers ?? 0) +
                (analytics?.customerStats?.returningCustomers ?? 0)
              }
              iconBg="bg-orange-50"
              iconColor="text-orange-400"
            />
          </>
        )}
      </div>

      {/* Hourly sales chart */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Sales by Hour of Day</h3>
        </div>
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={(analytics?.hourlyData ?? []).map((h) => ({
                ...h,
                label: `${String(h.hour).padStart(2, '0')}:00`,
              }))}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#a8a29e' }}
                tickLine={false}
                axisLine={false}
                interval={3}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#a8a29e' }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(v) =>
                  v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1000
                    ? `${(v / 1000).toFixed(0)}K`
                    : String(v)
                }
              />
              <Tooltip
                formatter={(value: any) => [formatCurrency(Number(value), currency), 'Revenue']}
                labelStyle={{ color: '#44403c', fontSize: 12 }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e7e5e4',
                  fontSize: 12,
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                }}
              />
              <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Day-of-week heatmap + Category breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Day-of-week heatmap */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Day-of-Week Performance</h3>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (analytics?.dayOfWeekData ?? []).length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[var(--text-3)] text-sm">
              No data for this period
            </div>
          ) : (
            <div className="space-y-2">
              {(analytics?.dayOfWeekData ?? []).map((d) => {
                const pct = (d.revenue / maxDayRevenue) * 100
                return (
                  <div key={d.day} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[var(--text-2)] w-8 shrink-0">{d.day}</span>
                    <div className="flex-1 bg-[var(--bg-muted)] rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      >
                        {pct > 20 && (
                          <span className="text-[10px] font-bold text-white">
                            {formatCurrency(d.revenue, currency)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--text-3)] w-8 text-right shrink-0">{d.orders}×</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Category breakdown pie chart */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Category Breakdown</h3>
          </div>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : (analytics?.categoryBreakdown ?? []).length === 0 ? (
            <div className="flex items-center justify-center h-48 text-[var(--text-3)] text-sm">
              No data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={analytics?.categoryBreakdown ?? []}
                  dataKey="revenue"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={40}
                  paddingAngle={2}
                >
                  {(analytics?.categoryBreakdown ?? []).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, _name: any, entry: any) => [
                    `${formatCurrency(Number(value), currency)} (${entry.payload.pct.toFixed(1)}%)`,
                    entry.payload.category,
                  ]}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e7e5e4',
                    fontSize: 12,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-[var(--text-2)]">{value}</span>
                  )}
                  iconSize={10}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Customer retention + Payment methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Customer retention */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Repeat className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Customer Retention</h3>
          </div>
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-4">
              {/* Retention rate ring */}
              <div className="flex items-center gap-6">
                <div className="relative w-20 h-20 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle
                      cx="18" cy="18" r="15.9"
                      fill="none" stroke="#e7e5e4" strokeWidth="3"
                    />
                    <circle
                      cx="18" cy="18" r="15.9"
                      fill="none" stroke="#f59e0b" strokeWidth="3"
                      strokeDasharray={`${analytics?.customerStats?.retentionRate ?? 0} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-[var(--text-1)]">
                      {(analytics?.customerStats?.retentionRate ?? 0).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-3)] mb-1">Retention Rate</p>
                  <p className="text-2xl font-bold text-amber-500">
                    {(analytics?.customerStats?.retentionRate ?? 0).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--bg-subtle)] rounded-xl p-3">
                  <p className="text-xs text-[var(--text-3)] mb-1">New Customers</p>
                  <p className="text-lg font-bold text-[var(--text-1)]">
                    {analytics?.customerStats?.newCustomers ?? 0}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-xs text-[var(--text-3)] mb-1">Returning</p>
                  <p className="text-lg font-bold text-amber-600">
                    {analytics?.customerStats?.returningCustomers ?? 0}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Payment methods */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Payment Methods</h3>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : (analytics?.paymentMethods ?? []).length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[var(--text-3)] text-sm">
              No data for this period
            </div>
          ) : (
            <div className="space-y-2">
              {(analytics?.paymentMethods ?? []).map((p) => {
                const pct = totalPayments > 0 ? (p.total / totalPayments) * 100 : 0
                return (
                  <div key={p.method} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--bg-subtle)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[var(--text-1)]">
                          {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                        </span>
                        <span className="text-xs text-[var(--text-3)]">{p.count} txn</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-[var(--bg-muted)] rounded-full h-1.5">
                          <div
                            className="h-1.5 bg-amber-400 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-[var(--text-2)] w-10 text-right shrink-0">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[var(--text-1)] shrink-0 ml-2">
                      {formatCurrency(p.total, currency)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
