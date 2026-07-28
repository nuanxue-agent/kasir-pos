'use client'

import Link from 'next/link'
import {
  ShoppingCart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Minus,
  Star,
  ChevronRight,
} from 'lucide-react'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { KpiGoalRow } from '@/components/dashboard/KpiGoalRow'
import { formatCurrency } from '@/lib/utils'

interface DashboardStatsProps {
  storeId: string
  currency: string
  stats: Record<string, any>
  yStats: Record<string, any>
  isLoading: boolean
  topProducts: any[]
  sparkRevenue: number[]
  npsData?: { avgNps: number | null; totalResponses: number }
}

function pctChange(today: number, yest: number): number | undefined {
  if (!yest) return undefined
  return ((today - yest) / yest) * 100
}

export function DashboardStats({
  storeId,
  currency,
  stats,
  yStats,
  isLoading,
  topProducts,
  sparkRevenue,
  npsData,
}: DashboardStatsProps) {
  const score = npsData?.avgNps ?? null
  const responses = npsData?.totalResponses ?? 0

  const scoreColor =
    score === null
      ? 'text-[var(--text-3)]'
      : score < 6
        ? 'text-red-500'
        : score < 9
          ? 'text-indigo-500'
          : 'text-emerald-500'
  const bgColor =
    score === null
      ? 'bg-[var(--bg-subtle)]'
      : score < 6
        ? 'bg-red-50'
        : score < 9
          ? 'bg-[var(--bg-subtle)]'
          : 'bg-emerald-50'
  const borderColor =
    score === null
      ? 'border-[var(--border)]'
      : score < 6
        ? 'border-red-200'
        : score < 9
          ? 'border-indigo-200'
          : 'border-emerald-200'
  const scoreLabel =
    score === null ? '—' : score < 6 ? 'Detractor' : score < 9 ? 'Passive' : 'Promoter'

  return (
    <>
      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Link
          href="/dashboard/reports"
          className="block transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
        >
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
        <Link
          href="/dashboard/orders"
          className="block transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
        >
          <StatsCard
            icon={ShoppingCart}
            label={`Pesanan${stats.totalOrders ? ` — ${stats.totalOrders} transaksi hari ini` : ''}`}
            value={String(stats.totalOrders ?? 0)}
            color="blue"
            change={pctChange(stats.totalOrders ?? 0, yStats.totalOrders ?? 0)}
            loading={isLoading}
          />
        </Link>
        <Link
          href="/dashboard/reports"
          className="block transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
        >
          <StatsCard
            icon={TrendingUp}
            label="Rata-rata Pesanan"
            value={formatCurrency(stats.avgOrderValue ?? 0, currency)}
            color="purple"
            loading={isLoading}
          />
        </Link>
        <Link
          href="/dashboard/customers"
          className="block transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
        >
          <StatsCard
            icon={Users}
            label="Pelanggan Baru"
            value={String(stats.newCustomers ?? 0)}
            color="blue"
            change={pctChange(stats.newCustomers ?? 0, yStats.newCustomers ?? 0)}
            loading={isLoading}
          />
        </Link>
      </div>

      {/* ── KPI Goal Row ── */}
      <KpiGoalRow storeId={storeId} currency={currency} />

      {/* ── NPS Score Card ── */}
      <Link href="/dashboard/crm/feedback" className="block">
        <div
          className={`flex items-center justify-between rounded-xl border ${borderColor} ${bgColor} px-5 py-4 shadow-sm transition-shadow hover:shadow-md`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${score === null ? 'bg-[var(--bg-muted)]' : score < 6 ? 'bg-red-100' : score < 9 ? 'bg-indigo-100' : 'bg-emerald-100'}`}
            >
              <Star
                className={`h-5 w-5 ${score === null ? 'text-[var(--text-3)]' : score < 6 ? 'text-red-500' : score < 9 ? 'text-indigo-500' : 'text-emerald-500'}`}
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
                NPS Bulan Ini
              </p>
              <p className={`mt-0.5 text-xl font-bold ${scoreColor}`}>
                {score !== null ? score.toFixed(1) : '—'}
                <span className="ml-1.5 text-xs font-medium opacity-70">{scoreLabel}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-[var(--text-1)]">{responses}</p>
            <p className="text-xs text-[var(--text-3)]">respons survei</p>
            <p className="mt-1 flex items-center justify-end gap-0.5 text-[10px] font-medium text-[var(--text-3)] hover:text-indigo-600">
              Lihat detail <ChevronRight className="h-3 w-3" />
            </p>
          </div>
        </div>
      </Link>

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
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                        <Star className="h-3 w-3 fill-indigo-400 text-indigo-400" />
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
    </>
  )
}
