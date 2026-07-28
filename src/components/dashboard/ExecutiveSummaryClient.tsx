'use client'

import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Users,
  Package,
  FileText,
  AlertTriangle,
  AlertCircle,
  Info,
  BarChart2,
  ShoppingCart,
  UserCheck,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import type { AlertSeverity, ExecutiveAlert } from '@/app/api/executive-summary/alerts/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPIs {
  revenue: number
  revenueGrowth: number
  profitMargin: number
  customerCount: number
  totalCustomers: number
  inventoryValue: number
  outstandingAR: number
  outstandingAP: number
}

interface RankingItem {
  id: string
  name: string
  revenue: number
  unitsSold?: number
  orderCount?: number
}

interface DailyTrend {
  date: string
  revenue: number
  transactions: number
  avgOrderValue: number
}

interface TrendSummary {
  totalRevenue: number
  totalTransactions: number
  avgDailyRevenue: number
  trendDirection: 'up' | 'down' | 'flat'
  days: number
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, color = '#6366f1' }: { data: number[]; color?: string }) {
  if (!data.length) return <div className="h-8 w-full" />
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80
  const h = 32
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  })
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  delta?: number
  loading?: boolean
  sparkData?: number[]
  sparkColor?: string
  iconBg: string
  iconText: string
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  delta,
  loading,
  sparkData,
  sparkColor,
  iconBg,
  iconText,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl p-4 animate-pulse shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-stone-100 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 bg-stone-100 rounded w-2/3" />
            <div className="h-6 bg-stone-100 rounded w-1/2" />
          </div>
        </div>
      </div>
    )
  }

  const isUp = delta !== undefined && delta > 0
  const isDown = delta !== undefined && delta < 0

  return (
    <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-stone-200 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className={cn('rounded-xl p-2 shrink-0', iconBg)}>
          <span className={iconText}>{icon}</span>
        </div>
        {delta !== undefined && (
          <div
            className={cn(
              'flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0',
              isUp && 'bg-emerald-50 text-emerald-600',
              isDown && 'bg-red-50 text-red-500',
              !isUp && !isDown && 'bg-stone-100 text-stone-400',
            )}
          >
            {isUp && <TrendingUp className="h-2.5 w-2.5" />}
            {isDown && <TrendingDown className="h-2.5 w-2.5" />}
            {!isUp && !isDown && <Minus className="h-2.5 w-2.5" />}
            {delta === 0 ? '0%' : `${isUp ? '+' : ''}${delta.toFixed(1)}%`}
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium text-stone-400 truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-stone-800 mt-0.5 leading-none truncate">
          {value}
        </p>
        {sub && <p className="text-xs text-stone-400 mt-1.5">{sub}</p>}
      </div>
      {sparkData && sparkData.length > 0 && (
        <div className="mt-3 opacity-70">
          <Sparkline data={sparkData} color={sparkColor} />
        </div>
      )}
    </div>
  )
}

// ─── Alert Icon ───────────────────────────────────────────────────────────────

function AlertIcon({ severity }: { severity: AlertSeverity }) {
  if (severity === 'critical')
    return <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
  if (severity === 'warning')
    return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
  return <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
}

const ALERT_PILL: Record<AlertSeverity, string> = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
}

// ─── Top-N Table ──────────────────────────────────────────────────────────────

function TopNTable({
  title,
  icon,
  items,
  currency,
  loading,
}: {
  title: string
  icon: React.ReactNode
  items: RankingItem[]
  currency: string
  loading: boolean
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-stone-500">{icon}</span>
        <h3 className="text-sm font-semibold text-stone-700">{title}</h3>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-stone-100 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-stone-400 py-4 text-center">Belum ada data</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, idx) => (
            <li key={item.id} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-stone-400 w-4 shrink-0">{idx + 1}</span>
              <span className="flex-1 text-xs font-medium text-stone-700 truncate">{item.name}</span>
              <span className="text-xs font-semibold text-indigo-600 shrink-0">
                {formatCurrency(item.revenue, currency)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ExecutiveSummaryClientProps {
  storeId: string
  currency?: string
}

export default function ExecutiveSummaryClient({
  storeId,
  currency = 'IDR',
}: ExecutiveSummaryClientProps) {
  // KPIs + rankings
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['executive-summary', storeId],
    queryFn: () =>
      fetch(`/api/executive-summary?storeId=${storeId}`)
        .then(r => r.json())
        .then(d => d as { kpis: KPIs; rankings: { topProducts: RankingItem[]; topCustomers: RankingItem[]; topStaff: RankingItem[] } }),
    refetchInterval: 5 * 60_000,
  })

  // Alerts
  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ['executive-alerts', storeId],
    queryFn: () =>
      fetch(`/api/executive-summary/alerts?storeId=${storeId}`)
        .then(r => r.json())
        .then(d => d as { alerts: ExecutiveAlert[]; total: number }),
    refetchInterval: 5 * 60_000,
  })

  // 30-day trends
  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['executive-trends', storeId],
    queryFn: () =>
      fetch(`/api/executive-summary/trends?storeId=${storeId}&days=30`)
        .then(r => r.json())
        .then(d => d as { trends: DailyTrend[]; summary: TrendSummary }),
    refetchInterval: 10 * 60_000,
  })

  const kpis = summaryData?.kpis
  const rankings = summaryData?.rankings
  const alerts = alertsData?.alerts ?? []
  const trends = trendsData?.trends ?? []
  const trendSummary = trendsData?.summary

  const revenueSparkData = trends.map(t => t.revenue)
  const txSparkData = trends.map(t => t.transactions)

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const warningCount = alerts.filter(a => a.severity === 'warning').length

  function handleRefresh() {
    refetchSummary()
    refetchAlerts()
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="h-4 w-4 text-indigo-500" />
            <span className="text-[11px] font-semibold tracking-widest text-indigo-600 uppercase">
              Executive Summary
            </span>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">
            Ringkasan Bisnis
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            KPI, tren, dan peringatan untuk seluruh modul — bulan berjalan
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          aria-label="Refresh data"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Perbarui</span>
        </button>
      </div>

      {/* Alert banner if critical */}
      {!alertsLoading && criticalCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-700">
            {criticalCount} peringatan kritis memerlukan perhatian segera
            {warningCount > 0 && ` · ${warningCount} peringatan lainnya`}
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <section aria-label="KPI utama">
        <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">
          Indikator Kinerja Utama
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Pendapatan Bulan Ini"
            value={formatCurrency(kpis?.revenue ?? 0, currency)}
            delta={kpis?.revenueGrowth}
            sub="vs bulan lalu"
            loading={summaryLoading}
            sparkData={revenueSparkData}
            sparkColor="#6366f1"
            iconBg="bg-indigo-50"
            iconText="text-indigo-600"
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Margin Laba Kotor"
            value={`${(kpis?.profitMargin ?? 0).toFixed(1)}%`}
            loading={summaryLoading}
            iconBg="bg-emerald-50"
            iconText="text-emerald-600"
          />
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            label="Pelanggan Aktif (30 hr)"
            value={String(kpis?.customerCount ?? 0)}
            sub={`Total ${kpis?.totalCustomers ?? 0} pelanggan`}
            loading={summaryLoading}
            sparkData={txSparkData}
            sparkColor="#10b981"
            iconBg="bg-sky-50"
            iconText="text-sky-600"
          />
          <KpiCard
            icon={<Package className="h-4 w-4" />}
            label="Nilai Inventori"
            value={formatCurrency(kpis?.inventoryValue ?? 0, currency)}
            loading={summaryLoading}
            iconBg="bg-amber-50"
            iconText="text-amber-600"
          />
          <KpiCard
            icon={<FileText className="h-4 w-4" />}
            label="Piutang Usaha (AR)"
            value={formatCurrency(kpis?.outstandingAR ?? 0, currency)}
            sub="Belum terbayar"
            loading={summaryLoading}
            iconBg="bg-purple-50"
            iconText="text-purple-600"
          />
          <KpiCard
            icon={<FileText className="h-4 w-4" />}
            label="Hutang Usaha (AP)"
            value={formatCurrency(kpis?.outstandingAP ?? 0, currency)}
            sub="Belum terbayar"
            loading={summaryLoading}
            iconBg="bg-orange-50"
            iconText="text-orange-600"
          />
          {trendSummary && (
            <KpiCard
              icon={<BarChart2 className="h-4 w-4" />}
              label="Rata-rata Pendapatan Harian"
              value={formatCurrency(trendSummary.avgDailyRevenue, currency)}
              sub={`${trendSummary.totalTransactions} transaksi / 30 hari`}
              loading={trendsLoading}
              iconBg="bg-rose-50"
              iconText="text-rose-600"
            />
          )}
        </div>
      </section>

      {/* Trend Sparklines */}
      {!trendsLoading && trends.length > 0 && (
        <section aria-label="Tren 30 hari">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">
            Tren 30 Hari
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-stone-500">Pendapatan Harian</p>
                <span
                  className={cn(
                    'text-[10px] font-semibold rounded-full px-1.5 py-0.5',
                    trendSummary?.trendDirection === 'up' && 'bg-emerald-50 text-emerald-600',
                    trendSummary?.trendDirection === 'down' && 'bg-red-50 text-red-500',
                    trendSummary?.trendDirection === 'flat' && 'bg-stone-100 text-stone-400',
                  )}
                >
                  {trendSummary?.trendDirection === 'up' && '↑ Naik'}
                  {trendSummary?.trendDirection === 'down' && '↓ Turun'}
                  {trendSummary?.trendDirection === 'flat' && '→ Stabil'}
                </span>
              </div>
              <div className="w-full overflow-x-auto">
                <svg
                  width="100%"
                  height="48"
                  viewBox={`0 0 ${Math.max(trends.length - 1, 1) * 10} 48`}
                  preserveAspectRatio="none"
                  aria-label="Grafik pendapatan 30 hari"
                >
                  {(() => {
                    const vals = trends.map(t => t.revenue)
                    const max = Math.max(...vals, 1)
                    const min = Math.min(...vals)
                    const range = max - min || 1
                    const pts = vals.map((v, i) => {
                      const x = i * 10
                      const y = 48 - ((v - min) / range) * 44 - 2
                      return `${x},${y}`
                    })
                    return (
                      <polyline
                        points={pts.join(' ')}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )
                  })()}
                </svg>
              </div>
              <div className="flex justify-between text-[10px] text-stone-400 mt-1">
                <span>{trends[0]?.date}</span>
                <span>{trends[trends.length - 1]?.date}</span>
              </div>
            </div>

            <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-medium text-stone-500 mb-2">Jumlah Transaksi Harian</p>
              <div className="w-full overflow-x-auto">
                <svg
                  width="100%"
                  height="48"
                  viewBox={`0 0 ${Math.max(trends.length - 1, 1) * 10} 48`}
                  preserveAspectRatio="none"
                  aria-label="Grafik transaksi 30 hari"
                >
                  {(() => {
                    const vals = trends.map(t => t.transactions)
                    const max = Math.max(...vals, 1)
                    const min = Math.min(...vals)
                    const range = max - min || 1
                    const pts = vals.map((v, i) => {
                      const x = i * 10
                      const y = 48 - ((v - min) / range) * 44 - 2
                      return `${x},${y}`
                    })
                    return (
                      <polyline
                        points={pts.join(' ')}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )
                  })()}
                </svg>
              </div>
              <div className="flex justify-between text-[10px] text-stone-400 mt-1">
                <span>{trends[0]?.date}</span>
                <span>{trends[trends.length - 1]?.date}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Top 5 Rankings */}
      <section aria-label="Peringkat teratas">
        <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">
          Peringkat Teratas — Bulan Ini
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <TopNTable
            title="Produk Terlaris"
            icon={<ShoppingCart className="h-4 w-4" />}
            items={rankings?.topProducts ?? []}
            currency={currency}
            loading={summaryLoading}
          />
          <TopNTable
            title="Pelanggan Teratas"
            icon={<Users className="h-4 w-4" />}
            items={rankings?.topCustomers ?? []}
            currency={currency}
            loading={summaryLoading}
          />
          <TopNTable
            title="Staf Terbaik"
            icon={<UserCheck className="h-4 w-4" />}
            items={rankings?.topStaff ?? []}
            currency={currency}
            loading={summaryLoading}
          />
        </div>
      </section>

      {/* Alert Panel */}
      <section aria-label="Panel peringatan">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest">
            Peringatan Aktif
          </h2>
          {!alertsLoading && (
            <span className="text-[10px] font-semibold text-stone-400">
              {alertsData?.total ?? 0} total
            </span>
          )}
        </div>

        {alertsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-stone-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl p-6 text-center shadow-sm">
            <p className="text-sm text-stone-400">Tidak ada peringatan aktif</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 15).map(alert => (
              <div
                key={alert.id}
                className={cn(
                  'flex items-start gap-3 rounded-xl border px-4 py-3',
                  ALERT_PILL[alert.severity],
                )}
                role="alert"
                aria-live="polite"
              >
                <AlertIcon severity={alert.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold leading-snug">{alert.title}</p>
                  <p className="text-xs opacity-80 mt-0.5 truncate">{alert.message}</p>
                </div>
                {alert.amount !== undefined && alert.amount > 0 && (
                  <span className="text-xs font-semibold shrink-0">
                    {formatCurrency(alert.amount, currency)}
                  </span>
                )}
              </div>
            ))}
            {alerts.length > 15 && (
              <p className="text-xs text-center text-stone-400 pt-1">
                +{alerts.length - 15} peringatan lainnya
              </p>
            )}
          </div>
        )}
      </section>

      <div className="h-4 lg:h-0" />
    </div>
  )
}
