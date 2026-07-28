'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Users, Award, Download, RefreshCw, Calendar,
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcGrowthRate,
  calcGrossMarginPct,
  calcAvgOrderValue,
  calcLTV,
  calcCAC,
  topNProducts,
  topNCustomers,
  toPeriodString,
  prevPeriod,
  periodBoundaries,
  calcGrossProfit,
  calcGrowthRates,
} from '@/lib/executive-summary'

export {
  calcGrowthRate,
  calcGrossMarginPct,
  calcAvgOrderValue,
  calcLTV,
  calcCAC,
  topNProducts,
  topNCustomers,
  toPeriodString,
  prevPeriod,
  periodBoundaries,
  calcGrossProfit,
  calcGrowthRates,
}

// Dynamic recharts imports
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

interface Props {
  storeId: string
  currency: string
}

interface ExecSummaryData {
  period: string
  generatedAt: string
  current: {
    revenue: number; cost: number; grossProfit: number; grossMarginPct: number
    orders: number; totalCustomers: number; newCustomers: number; avgOrderValue: number
  }
  lastMonth: {
    revenue: number; cost: number; grossProfit: number; grossMarginPct: number
    orders: number; totalCustomers: number; newCustomers: number; avgOrderValue: number
  }
  yearAgo: {
    revenue: number; cost: number; grossProfit: number; grossMarginPct: number
    orders: number; totalCustomers: number; newCustomers: number; avgOrderValue: number
  }
  growth: {
    revenueGrowthMoM: number; revenueGrowthYoY: number
    ordersGrowthMoM: number; grossProfitGrowthMoM: number
  }
  ltv: number
  cac: number
  topProducts: { productId: string; name: string; revenue: number; unitsSold: number }[]
  topCustomers: { customerId: string; name: string; totalSpend: number; orderCount: number }[]
}

function GrowthBadge({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
      positive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
    )}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {positive ? '+' : ''}{value}%
    </span>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  growth,
  highlight,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  sub?: string
  growth?: number
  highlight?: boolean
}) {
  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-2',
      highlight
        ? 'border-[var(--primary)] bg-[var(--primary)]/5'
        : 'border-[var(--border)] bg-[var(--bg-card)]'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--text-2)] text-sm">
          <Icon size={14} />
          {label}
        </div>
        {growth !== undefined && <GrowthBadge value={growth} />}
      </div>
      <p className="text-2xl font-bold text-[var(--text-1)]">{value}</p>
      {sub && <p className="text-xs text-[var(--text-3)]">{sub}</p>}
    </div>
  )
}

function PeriodCompareRow({
  label,
  current,
  lastMonth,
  yearAgo,
  format,
}: {
  label: string
  current: number
  lastMonth: number
  yearAgo: number
  format: (v: number) => string
}) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-2 pr-4 text-sm text-[var(--text-2)]">{label}</td>
      <td className="py-2 pr-4 text-sm font-medium text-[var(--text-1)] text-right">{format(current)}</td>
      <td className="py-2 pr-4 text-sm text-[var(--text-2)] text-right">{format(lastMonth)}</td>
      <td className="py-2 text-sm text-[var(--text-2)] text-right">{format(yearAgo)}</td>
    </tr>
  )
}

export default function ExecutiveSummaryClient({ storeId, currency }: Props) {
  const now = new Date()
  const [period, setPeriod] = useState(toPeriodString(now))
  const [saving, setSaving] = useState(false)

  const { data, isLoading, refetch } = useQuery<ExecSummaryData>({
    queryKey: ['exec-summary', storeId, period],
    queryFn: async () => {
      const res = await fetch(`/api/reports/executive-summary?storeId=${storeId}&period=${period}`)
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
  })

  const fmt = (v: number) => formatCurrency(v, currency)
  const fmtPct = (v: number) => `${v.toFixed(1)}%`
  const fmtNum = (v: number) => v.toLocaleString('id-ID')

  const handleSaveSnapshot = async () => {
    if (!data) return
    setSaving(true)
    try {
      const res = await fetch(`/api/reports/executive-summary/snapshots?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: data.period, generatedAt: data.generatedAt, data }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Snapshot saved')
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = () => window.print()

  // Build trend chart data from current/lastMonth/yearAgo
  const trendData = data ? [
    { month: prevPeriod(period, 2), revenue: 0 },
    { month: prevPeriod(period, 1), revenue: data.lastMonth.revenue, grossProfit: data.lastMonth.grossProfit },
    { month: period, revenue: data.current.revenue, grossProfit: data.current.grossProfit },
  ] : []

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; color: black; }
          .print-break { page-break-before: always; }
        }
      `}</style>

      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 no-print">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">Executive Summary</h1>
            <p className="text-sm text-[var(--text-3)] mt-1">One-page business intelligence overview</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2 bg-[var(--bg-1)]">
              <Calendar size={14} className="text-[var(--text-3)]" />
              <input
                type="month"
                value={period}
                onChange={e => setPeriod(e.target.value)}
                className="bg-transparent text-sm text-[var(--text-1)] outline-none"
              />
            </div>
            <button
              onClick={() => refetch()}
              className="no-print flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              onClick={handleSaveSnapshot}
              disabled={saving || isLoading}
              className="no-print flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors disabled:opacity-50"
            >
              <Download size={14} />
              Save Snapshot
            </button>
            <button
              onClick={handlePrint}
              className="no-print flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Export PDF
            </button>
          </div>
        </div>

        {/* Print header (hidden on screen) */}
        <div className="hidden print:block mb-6">
          <h1 className="text-3xl font-bold">Executive Summary — {period}</h1>
          <p className="text-sm text-gray-500">Generated {data?.generatedAt ? new Date(data.generatedAt).toLocaleString('id-ID') : ''}</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24 text-[var(--text-3)]">
            <RefreshCw size={20} className="animate-spin mr-2" /> Loading report…
          </div>
        )}

        {data && (
          <>
            {/* KPI Cards */}
            <section>
              <h2 className="text-sm font-semibold text-[var(--text-3)] uppercase tracking-wider mb-3">Key Metrics — {period}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  icon={DollarSign}
                  label="Revenue"
                  value={fmt(data.current.revenue)}
                  sub={`Last month: ${fmt(data.lastMonth.revenue)}`}
                  growth={data.growth.revenueGrowthMoM}
                  highlight
                />
                <MetricCard
                  icon={TrendingUp}
                  label="Gross Profit"
                  value={fmt(data.current.grossProfit)}
                  sub={`Margin: ${fmtPct(data.current.grossMarginPct)}`}
                  growth={data.growth.grossProfitGrowthMoM}
                />
                <MetricCard
                  icon={ShoppingCart}
                  label="Orders"
                  value={fmtNum(data.current.orders)}
                  sub={`AOV: ${fmt(data.current.avgOrderValue)}`}
                  growth={data.growth.ordersGrowthMoM}
                />
                <MetricCard
                  icon={Users}
                  label="Customers"
                  value={fmtNum(data.current.totalCustomers)}
                  sub={`${fmtNum(data.current.newCustomers)} new this month`}
                />
              </div>
            </section>

            {/* LTV & CAC row */}
            <section>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MetricCard
                  icon={Award}
                  label="Customer LTV (est.)"
                  value={fmt(data.ltv)}
                  sub="Based on avg order × freq × 12 months"
                />
                <MetricCard
                  icon={Users}
                  label="YoY Revenue Growth"
                  value={`${data.growth.revenueGrowthYoY >= 0 ? '+' : ''}${data.growth.revenueGrowthYoY}%`}
                  sub={`vs ${prevPeriod(period, 12)}: ${fmt(data.yearAgo.revenue)}`}
                />
                <MetricCard
                  icon={DollarSign}
                  label="Avg Order Value"
                  value={fmt(data.current.avgOrderValue)}
                  sub={`Last month: ${fmt(data.lastMonth.avgOrderValue)}`}
                />
              </div>
            </section>

            {/* Revenue Trend Chart */}
            <section>
              <h2 className="text-sm font-semibold text-[var(--text-3)] uppercase tracking-wider mb-3">Revenue Trend</h2>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: any) => fmt(v)} width={90} />
                      <Tooltip formatter={(v: any) => fmt(v)} />
                      <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} name="Revenue" />
                      <Line type="monotone" dataKey="grossProfit" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} name="Gross Profit" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Period Comparison Table */}
            <section>
              <h2 className="text-sm font-semibold text-[var(--text-3)] uppercase tracking-wider mb-3">Period Comparison</h2>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-1)]">
                      <th className="text-left py-2 px-4 text-[var(--text-3)] font-medium">Metric</th>
                      <th className="text-right py-2 px-4 text-[var(--text-1)] font-semibold">{period}</th>
                      <th className="text-right py-2 px-4 text-[var(--text-3)] font-medium">{prevPeriod(period, 1)}</th>
                      <th className="text-right py-2 px-4 text-[var(--text-3)] font-medium">{prevPeriod(period, 12)}</th>
                    </tr>
                  </thead>
                  <tbody className="px-4">
                    <tr className="border-b border-[var(--border)]">
                      <td className="py-2 px-4 text-[var(--text-2)]">Revenue</td>
                      <td className="py-2 px-4 text-right font-medium text-[var(--text-1)]">{fmt(data.current.revenue)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmt(data.lastMonth.revenue)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmt(data.yearAgo.revenue)}</td>
                    </tr>
                    <tr className="border-b border-[var(--border)]">
                      <td className="py-2 px-4 text-[var(--text-2)]">Gross Profit</td>
                      <td className="py-2 px-4 text-right font-medium text-[var(--text-1)]">{fmt(data.current.grossProfit)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmt(data.lastMonth.grossProfit)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmt(data.yearAgo.grossProfit)}</td>
                    </tr>
                    <tr className="border-b border-[var(--border)]">
                      <td className="py-2 px-4 text-[var(--text-2)]">Gross Margin %</td>
                      <td className="py-2 px-4 text-right font-medium text-[var(--text-1)]">{fmtPct(data.current.grossMarginPct)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmtPct(data.lastMonth.grossMarginPct)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmtPct(data.yearAgo.grossMarginPct)}</td>
                    </tr>
                    <tr className="border-b border-[var(--border)]">
                      <td className="py-2 px-4 text-[var(--text-2)]">Orders</td>
                      <td className="py-2 px-4 text-right font-medium text-[var(--text-1)]">{fmtNum(data.current.orders)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmtNum(data.lastMonth.orders)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmtNum(data.yearAgo.orders)}</td>
                    </tr>
                    <tr className="border-b border-[var(--border)]">
                      <td className="py-2 px-4 text-[var(--text-2)]">Avg Order Value</td>
                      <td className="py-2 px-4 text-right font-medium text-[var(--text-1)]">{fmt(data.current.avgOrderValue)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmt(data.lastMonth.avgOrderValue)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmt(data.yearAgo.avgOrderValue)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 text-[var(--text-2)]">New Customers</td>
                      <td className="py-2 px-4 text-right font-medium text-[var(--text-1)]">{fmtNum(data.current.newCustomers)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmtNum(data.lastMonth.newCustomers)}</td>
                      <td className="py-2 px-4 text-right text-[var(--text-2)]">{fmtNum(data.yearAgo.newCustomers)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Top Products & Customers */}
            <section className="grid md:grid-cols-2 gap-6">
              {/* Top 5 Products */}
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-3)] uppercase tracking-wider mb-3">Top 5 Products</h2>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                  <div style={{ height: 200 }} className="p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.topProducts} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: any) => fmt(v)} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip formatter={(v: any) => fmt(v)} />
                        <Bar dataKey="revenue" fill="var(--primary)" name="Revenue" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="w-full text-xs border-t border-[var(--border)]">
                    <thead>
                      <tr className="bg-[var(--bg-1)]">
                        <th className="text-left py-2 px-3 text-[var(--text-3)]">Product</th>
                        <th className="text-right py-2 px-3 text-[var(--text-3)]">Revenue</th>
                        <th className="text-right py-2 px-3 text-[var(--text-3)]">Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((p, i) => (
                        <tr key={p.productId} className="border-t border-[var(--border)]">
                          <td className="py-1.5 px-3 text-[var(--text-2)]">
                            <span className="text-[var(--text-3)] mr-1">#{i + 1}</span>{p.name}
                          </td>
                          <td className="py-1.5 px-3 text-right text-[var(--text-1)] font-medium">{fmt(p.revenue)}</td>
                          <td className="py-1.5 px-3 text-right text-[var(--text-2)]">{fmtNum(p.unitsSold)}</td>
                        </tr>
                      ))}
                      {data.topProducts.length === 0 && (
                        <tr><td colSpan={3} className="py-4 px-3 text-center text-[var(--text-3)]">No data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top 5 Customers */}
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-3)] uppercase tracking-wider mb-3">Top 5 Customers</h2>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                  <div style={{ height: 200 }} className="p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.topCustomers} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: any) => fmt(v)} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip formatter={(v: any) => fmt(v)} />
                        <Bar dataKey="totalSpend" fill="#22c55e" name="Total Spend" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="w-full text-xs border-t border-[var(--border)]">
                    <thead>
                      <tr className="bg-[var(--bg-1)]">
                        <th className="text-left py-2 px-3 text-[var(--text-3)]">Customer</th>
                        <th className="text-right py-2 px-3 text-[var(--text-3)]">Spend</th>
                        <th className="text-right py-2 px-3 text-[var(--text-3)]">Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topCustomers.map((c, i) => (
                        <tr key={c.customerId} className="border-t border-[var(--border)]">
                          <td className="py-1.5 px-3 text-[var(--text-2)]">
                            <span className="text-[var(--text-3)] mr-1">#{i + 1}</span>{c.name}
                          </td>
                          <td className="py-1.5 px-3 text-right text-[var(--text-1)] font-medium">{fmt(c.totalSpend)}</td>
                          <td className="py-1.5 px-3 text-right text-[var(--text-2)]">{fmtNum(c.orderCount)}</td>
                        </tr>
                      ))}
                      {data.topCustomers.length === 0 && (
                        <tr><td colSpan={3} className="py-4 px-3 text-center text-[var(--text-3)]">No data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Operational Highlights */}
            <section>
              <h2 className="text-sm font-semibold text-[var(--text-3)] uppercase tracking-wider mb-3">Operational Highlights</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-1">
                  <p className="text-xs text-[var(--text-3)]">Revenue MoM</p>
                  <p className={cn(
                    'text-xl font-bold',
                    data.growth.revenueGrowthMoM >= 0 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {data.growth.revenueGrowthMoM >= 0 ? '+' : ''}{data.growth.revenueGrowthMoM}%
                  </p>
                  <p className="text-xs text-[var(--text-3)]">vs last month</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-1">
                  <p className="text-xs text-[var(--text-3)]">Revenue YoY</p>
                  <p className={cn(
                    'text-xl font-bold',
                    data.growth.revenueGrowthYoY >= 0 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {data.growth.revenueGrowthYoY >= 0 ? '+' : ''}{data.growth.revenueGrowthYoY}%
                  </p>
                  <p className="text-xs text-[var(--text-3)]">vs same month last year</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-1">
                  <p className="text-xs text-[var(--text-3)]">Estimated LTV</p>
                  <p className="text-xl font-bold text-[var(--text-1)]">{fmt(data.ltv)}</p>
                  <p className="text-xs text-[var(--text-3)]">12-month projection per customer</p>
                </div>
              </div>
            </section>

            {/* Print footer */}
            <div className="hidden print:block mt-8 pt-4 border-t text-xs text-gray-400 text-center">
              Executive Summary — {period} — Generated {new Date(data.generatedAt).toLocaleString('id-ID')}
            </div>
          </>
        )}
      </div>
    </>
  )
}
