'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Target, DollarSign, ShoppingCart, Users, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface KpiGoalData {
  revenue: { current: number; target: number; pct: number }
  orders: { current: number; target: number; pct: number }
  newCustomers: { current: number; target: number; pct: number }
}

interface KpiGoalRowProps {
  storeId: string
  currency: string
}

function KpiBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const color =
    pct >= 100
      ? 'bg-emerald-500'
      : pct >= 90
        ? 'bg-amber-500'
        : pct >= 50
          ? 'bg-blue-500'
          : 'bg-rose-400'
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export function KpiGoalRow({ storeId, currency }: KpiGoalRowProps) {
  const { data, isLoading } = useQuery<KpiGoalData>({
    queryKey: ['kpi-goals', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/kpi?storeId=${storeId}&period=MONTHLY`)
      if (!res.ok) throw new Error('Failed to fetch KPI')
      return res.json()
    },
    staleTime: 60_000,
  })

  // Don't render anything if there are no goals set
  if (!isLoading && !data) return null
  if (
    !isLoading &&
    data &&
    data.revenue.target === 0 &&
    data.orders.target === 0 &&
    data.newCustomers.target === 0
  )
    return null

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold tracking-widest text-[var(--text-3)] uppercase">
            Progress Target Bulan Ini
          </p>
        </div>
        <Link
          href="/dashboard/reports/goals"
          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
        >
          Detail <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="h-3 w-16 animate-pulse rounded bg-muted mb-2" />
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-1.5 w-full animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
          {/* Revenue */}
          {data.revenue.target > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="h-3 w-3 text-[var(--text-3)]" />
                <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase truncate">
                  Omzet
                </p>
              </div>
              <p className="text-sm font-bold text-[var(--text-1)] truncate">
                {formatCurrency(data.revenue.current, currency)}
              </p>
              <p className="text-[10px] text-[var(--text-3)]">
                dari {formatCurrency(data.revenue.target, currency)}
              </p>
              <KpiBar pct={data.revenue.pct} />
              <p
                className={`mt-1 text-[10px] font-semibold ${
                  data.revenue.pct >= 100
                    ? 'text-emerald-600'
                    : data.revenue.pct >= 90
                      ? 'text-amber-600'
                      : 'text-[var(--text-3)]'
                }`}
              >
                {data.revenue.pct.toFixed(1)}%
              </p>
            </div>
          )}

          {/* Orders */}
          {data.orders.target > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ShoppingCart className="h-3 w-3 text-[var(--text-3)]" />
                <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase truncate">
                  Pesanan
                </p>
              </div>
              <p className="text-sm font-bold text-[var(--text-1)]">
                {data.orders.current}
              </p>
              <p className="text-[10px] text-[var(--text-3)]">
                dari {data.orders.target}
              </p>
              <KpiBar pct={data.orders.pct} />
              <p
                className={`mt-1 text-[10px] font-semibold ${
                  data.orders.pct >= 100
                    ? 'text-emerald-600'
                    : data.orders.pct >= 90
                      ? 'text-amber-600'
                      : 'text-[var(--text-3)]'
                }`}
              >
                {data.orders.pct.toFixed(1)}%
              </p>
            </div>
          )}

          {/* New customers */}
          {data.newCustomers.target > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="h-3 w-3 text-[var(--text-3)]" />
                <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase truncate">
                  Pelanggan Baru
                </p>
              </div>
              <p className="text-sm font-bold text-[var(--text-1)]">
                {data.newCustomers.current}
              </p>
              <p className="text-[10px] text-[var(--text-3)]">
                dari {data.newCustomers.target}
              </p>
              <KpiBar pct={data.newCustomers.pct} />
              <p
                className={`mt-1 text-[10px] font-semibold ${
                  data.newCustomers.pct >= 100
                    ? 'text-emerald-600'
                    : data.newCustomers.pct >= 90
                      ? 'text-amber-600'
                      : 'text-[var(--text-3)]'
                }`}
              >
                {data.newCustomers.pct.toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
