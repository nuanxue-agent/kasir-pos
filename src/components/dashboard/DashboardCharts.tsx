'use client'

import Link from 'next/link'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, ArrowRight, CheckCircle2, Package, Star, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface HourlySlot {
  hour: number
  revenue: number
  count: number
}

export interface PaymentSlice {
  method: string
  total: number
  count: number
}

// ─── Hourly Heatmap ───────────────────────────────────────────────────────────

const HOUR_LABELS = [
  '12a',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12p',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
]

function HourlyHeatmap({ data }: { data: HourlySlot[] }) {
  if (!data.length) return null
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1)
  return (
    <div>
      <div className="flex gap-0.5">
        {data.map(slot => {
          const intensity = slot.revenue / maxRevenue
          const opacity = slot.revenue === 0 ? 0.07 : 0.15 + intensity * 0.85
          return (
            <div
              key={slot.hour}
              className="group relative flex-1"
              title={`${HOUR_LABELS[slot.hour]}:00 — ${slot.count} order(s)`}
            >
              <div
                className="h-8 rounded-sm transition-opacity"
                style={{ backgroundColor: `rgba(99, 102, 241, ${opacity})` }}
              />
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-stone-800 px-1.5 py-0.5 text-[9px] whitespace-nowrap text-white group-hover:block">
                {HOUR_LABELS[slot.hour]}h · {slot.count}x
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-[var(--text-3)]">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>11p</span>
      </div>
    </div>
  )
}

// ─── Payment Method Donut ─────────────────────────────────────────────────────

const PAYMENT_COLORS: Record<string, string> = {
  CASH: '#10b981',
  CARD: '#6366f1',
  TRANSFER: '#f59e0b',
  QRIS: '#ec4899',
  OTHER: '#94a3b8',
}

function PaymentDonut({ data, currency }: { data: PaymentSlice[]; currency: string }) {
  if (!data.length) return <p className="py-4 text-center text-xs text-[var(--text-3)]">No data</p>
  const pieData = data.map(d => ({ name: d.method, value: d.total }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={42}
          outerRadius={64}
          paddingAngle={2}
          dataKey="value"
        >
          {pieData.map((entry, i) => (
            <Cell key={i} fill={PAYMENT_COLORS[entry.name] ?? '#94a3b8'} />
          ))}
        </Pie>
        <RechartsTooltip
          formatter={value => formatCurrency(value as number, currency)}
          contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e5e7eb' }}
        />
        <RechartsLegend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── Today vs Yesterday Sparkline ─────────────────────────────────────────────

function TodayVsYesterdaySparkline({
  today,
  yesterday,
  currency,
}: {
  today: HourlySlot[]
  yesterday: HourlySlot[]
  currency: string
}) {
  if (!today.length && !yesterday.length) return null
  const now = new Date().getHours()
  const points = Array.from({ length: now + 1 }, (_, h) => ({
    hour: h,
    today: today.find(s => s.hour === h)?.revenue ?? 0,
    yesterday: yesterday.find(s => s.hour === h)?.revenue ?? 0,
  }))
  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={points} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 9, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={h => (h % 6 === 0 ? `${h}h` : '')}
        />
        <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} hide />
        <RechartsTooltip
          formatter={value => formatCurrency(value as number, currency)}
          labelFormatter={h => `${h}:00`}
          contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e5e7eb' }}
        />
        <Line
          type="monotone"
          dataKey="today"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          name="Today"
        />
        <Line
          type="monotone"
          dataKey="yesterday"
          stroke="#d1d5db"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          name="Yesterday"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Main DashboardCharts export ──────────────────────────────────────────────

interface DashboardChartsProps {
  currency: string
  sparkRevenue: number[]
  hourlyToday: HourlySlot[]
  hourlyYesterday: HourlySlot[]
  paymentBreakdown: PaymentSlice[]
  topProducts: any[]
  recentOrders: any[]
  lowStock: any[]
  ordersLoading: boolean
  stockLoading: boolean
  statusStyles: Record<string, { icon: React.ReactNode; pill: string; label: string }>
  formatDate: (d: string) => string
}

export function DashboardCharts({
  currency,
  sparkRevenue,
  hourlyToday,
  hourlyYesterday,
  paymentBreakdown,
  topProducts,
  recentOrders,
  lowStock,
  ordersLoading,
  stockLoading,
  statusStyles,
  formatDate,
}: DashboardChartsProps) {
  return (
    <>
      {/* ── 7-day revenue sparkline card ── */}
      {sparkRevenue.length > 1 && (
        <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-subtle)] p-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-widest text-[var(--text-3)] uppercase">
                Tren 7 Hari
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--text-1)]">Omzet minggu ini</p>
            </div>
            <Link
              href="/dashboard/reports"
              className="flex items-center gap-1 text-xs text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400"
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
                      className={`w-full rounded-t-md transition-all ${isToday ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-900/50'}`}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={formatCurrency(v, currency)}
                    />
                  </div>
                  <span
                    className={`text-[9px] font-medium ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-[var(--text-3)]'}`}
                  >
                    {dayNames[d.getDay()]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Analytics row: Hourly Heatmap + Payment Donut + Today vs Yesterday ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Hourly heatmap */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl">
          <p className="mb-3 text-xs font-semibold tracking-widest text-[var(--text-3)] uppercase">
            Penjualan per Jam — Hari Ini
          </p>
          {hourlyToday.length > 0 ? (
            <HourlyHeatmap data={hourlyToday} />
          ) : (
            <div className="flex h-10 items-center justify-center text-xs text-[var(--text-3)]">
              Belum ada data hari ini
            </div>
          )}
        </div>

        {/* Payment method donut */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl">
          <p className="mb-1 text-xs font-semibold tracking-widest text-[var(--text-3)] uppercase">
            Metode Pembayaran
          </p>
          <PaymentDonut data={paymentBreakdown} currency={currency} />
        </div>

        {/* Today vs Yesterday sparkline */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-widest text-[var(--text-3)] uppercase">
              Hari Ini vs Kemarin
            </p>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-4 rounded-sm bg-indigo-500" />
                Hari Ini
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-px w-4 border border-dashed border-slate-400" />
                Kemarin
              </span>
            </div>
          </div>
          <TodayVsYesterdaySparkline
            today={hourlyToday}
            yesterday={hourlyYesterday}
            currency={currency}
          />
        </div>
      </div>

      {/* ── Main content grid: Recent orders + Low stock + Top products ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent orders */}
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-lg transition-all duration-200 hover:shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Pesanan Terbaru</h2>
            <Link
              href="/dashboard/orders"
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400"
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
              <Package className="h-8 w-8 text-slate-200" />
              <p className="text-sm text-[var(--text-3)]">Belum ada pesanan hari ini</p>
              <Link
                href="/dashboard/pos"
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Mulai catat penjualan →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {(recentOrders as any[]).slice(0, 7).map((order: any) => {
                const style = statusStyles[order.status] ?? statusStyles.PENDING
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
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-lg transition-all duration-200 hover:shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
                <AlertTriangle className="h-3.5 w-3.5 text-indigo-500" />
                Stok Menipis
                {(lowStock as any[]).length > 0 && (
                  <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                    {(lowStock as any[]).length}
                  </span>
                )}
              </h2>
              <Link
                href="/dashboard/inventory"
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400"
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
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-sm text-[var(--text-2)]">Semua stok aman ✓</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {(lowStock as any[]).slice(0, 5).map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] dark:bg-indigo-900/20">
                        <Package className="h-3.5 w-3.5 text-indigo-500" />
                      </div>
                      <p className="truncate text-sm text-[var(--text-1)]">{p.name}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold ${
                        p.stock === 0
                          ? 'border border-red-100 bg-red-50 text-red-500 dark:border-red-900/50 dark:bg-red-900/20'
                          : 'border border-[var(--border)] bg-[var(--bg-subtle)] text-indigo-600 dark:border-indigo-900/50 dark:bg-indigo-900/20'
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
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-lg transition-all duration-200 hover:shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
                  <Star className="h-3.5 w-3.5 fill-indigo-400 text-indigo-500" />
                  Produk Terlaris Hari Ini
                </h2>
                <Link
                  href="/dashboard/reports"
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400"
                >
                  Laporan <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {(topProducts as any[]).slice(0, 5).map((p: any, i: number) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <span className="w-4 shrink-0 text-xs font-bold text-[var(--text-3)]">
                      {i + 1}
                    </span>
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
    </>
  )
}
