'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { AlertTriangle, Users, TrendingDown, MessageCircle, CheckCircle } from 'lucide-react'

// Dynamic recharts imports — keep heavy chart components out of initial bundle
const PieChart = dynamic(() => import('recharts').then(m => m.PieChart), { ssr: false })
const Pie = dynamic(() => import('recharts').then(m => m.Pie), { ssr: false })
const Cell = dynamic(() => import('recharts').then(m => m.Cell), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), {
  ssr: false,
})

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface ChurnCustomer {
  id: string
  name: string
  phone: string | null
  email: string | null
  churn_score: number
  risk_level: RiskLevel
  days_since_purchase: number
  purchase_count: number
  last_purchase_at: string | null
  recommended_action: string
}

// ── Pure churn utilities (also exported for unit tests) ────────────────────────

/** Compute churn score 0-100 from component metrics */
export function calcChurnScore(
  recency_days: number,
  frequency_trend: number,
  value_trend_negative: number,
): number {
  const recencyComponent = Math.min(1, recency_days / 90) * 40
  const frequencyComponent = (1 - Math.min(1, Math.max(0, frequency_trend))) * 30
  const valueComponent = Math.min(1, Math.max(0, value_trend_negative)) * 30
  return Math.min(100, Math.round(recencyComponent + frequencyComponent + valueComponent))
}

/** Map churn score to risk level */
export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 70) return 'HIGH'
  if (score >= 40) return 'MEDIUM'
  return 'LOW'
}

/** Detect frequency trend: ratio of recent orders to older orders (0-1, higher = more active) */
export function calcFrequencyTrend(
  recentOrderCount: number,
  olderOrderCount: number,
  recentDays: number = 30,
  olderDays: number = 60,
): number {
  // Normalize by window length to get orders/day ratio
  const recentRate = recentOrderCount / Math.max(1, recentDays)
  const olderRate = olderOrderCount / Math.max(1, olderDays)
  if (olderRate === 0) return recentRate > 0 ? 1 : 0.5
  return Math.min(1, recentRate / olderRate)
}

/** Detect value trend negative: how much avg order value has dropped (0-1, 1 = fully dropped) */
export function calcValueTrendNegative(
  recentAvgValue: number,
  olderAvgValue: number,
): number {
  if (olderAvgValue <= 0) return 0
  const drop = (olderAvgValue - recentAvgValue) / olderAvgValue
  return Math.min(1, Math.max(0, drop))
}

/** Build a WhatsApp re-engagement message for a customer */
export function buildReEngagementMessage(name: string): string {
  return `Halo ${name}, kami kangen kamu! Ada promo spesial untuk kamu...`
}

/** Derive recommended action from risk level */
export function recommendedAction(risk: RiskLevel, daysSince: number): string {
  if (risk === 'HIGH') {
    if (daysSince > 60) return 'Kirim penawaran eksklusif segera'
    return 'Hubungi via WhatsApp dengan promo khusus'
  }
  if (risk === 'MEDIUM') return 'Ingatkan dengan diskon atau loyalitas poin'
  return 'Pertahankan dengan program loyalitas'
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] ${className}`}
    />
  )
}

const RISK_COLORS: Record<RiskLevel, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#10b981',
}

const RISK_BADGE: Record<RiskLevel, string> = {
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  LOW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_BADGE[level]}`}
    >
      {level}
    </span>
  )
}

type Tab = 'all' | 'at-risk'

interface ChurnPredictionClientProps {
  storeId: string
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ChurnPredictionClient({ storeId }: ChurnPredictionClientProps) {
  const [tab, setTab] = useState<Tab>('all')
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({})

  const { data, isLoading, isError } = useQuery<ChurnCustomer[]>({
    queryKey: ['reports-churn', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/churn?${new URLSearchParams({ storeId })}`)
      if (!res.ok) throw new Error('Failed to fetch churn data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Derived lists
  const allCustomers = data ?? []
  const atRisk = allCustomers.filter(c => c.risk_level === 'HIGH')
  const displayed = tab === 'at-risk' ? atRisk : allCustomers

  // Pie chart data
  const high = allCustomers.filter(c => c.risk_level === 'HIGH').length
  const medium = allCustomers.filter(c => c.risk_level === 'MEDIUM').length
  const low = allCustomers.filter(c => c.risk_level === 'LOW').length
  const pieData = [
    { name: 'High', value: high, color: RISK_COLORS.HIGH },
    { name: 'Medium', value: medium, color: RISK_COLORS.MEDIUM },
    { name: 'Low', value: low, color: RISK_COLORS.LOW },
  ].filter(d => d.value > 0)

  function handleSendReEngagement(customer: ChurnCustomer) {
    const message = buildReEngagementMessage(customer.name)
    const phone = customer.phone?.replace(/\D/g, '') ?? ''
    const whatsappUrl = `https://wa.me/${phone ? (phone.startsWith('0') ? '62' + phone.slice(1) : phone) : ''}?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')

    // Log outreach by firing audit endpoint (best-effort, no await in UI)
    fetch('/api/reports/churn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, customerId: customer.id, customerName: customer.name }),
    }).catch(() => {/* silent */})

    setSentMap(prev => ({ ...prev, [customer.id]: true }))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">
          Customer Retention &amp; Churn Prediction
        </h1>
        <p className="mt-0.5 text-sm text-[var(--text-3)]">
          Churn risk based on recency, purchase frequency trend, and order value trend
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900 dark:bg-red-950/40">
              <div className="mb-1 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <p className="text-xs font-medium text-red-600 dark:text-red-400">High Risk</p>
              </div>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{high}</p>
              <p className="text-xs text-red-400">customers need attention</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/40">
              <div className="mb-1 flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-amber-500" />
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Medium Risk</p>
              </div>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{medium}</p>
              <p className="text-xs text-amber-400">customers at moderate risk</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-500" />
                <p className="text-xs font-medium text-[var(--text-3)]">Total Customers</p>
              </div>
              <p className="text-2xl font-bold text-[var(--text-1)]">{allCustomers.length}</p>
              <p className="text-xs text-[var(--text-3)]">{low} low risk</p>
            </div>
          </>
        )}
      </div>

      {/* Pie chart */}
      {!isLoading && pieData.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-1)]">
            Churn Risk Distribution
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) =>
   `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
 }
 labelLine={false}
 >
 {pieData.map((entry, index) => (
   <Cell key={`cell-${index}`} fill={entry.color} />
 ))}
 </Pie>
 <Tooltip
 formatter={(value, name) => [value, `${name} Risk`]}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e7e5e4',
                  fontSize: 12,
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                }}
              />
              <Legend iconSize={8} formatter={value => (
                <span className="text-xs text-[var(--text-2)]">{value} Risk</span>
              )} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1 w-fit">
        {(['all', 'at-risk'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
            }`}
          >
            {t === 'all' ? 'All Customers' : `At Risk (${atRisk.length})`}
          </button>
        ))}
      </div>

      {/* At Risk helper text */}
      {tab === 'at-risk' && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            These customers haven&apos;t purchased recently or show declining purchase patterns.
            Send a re-engagement message to bring them back.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4" />
            Failed to load churn data
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-[var(--text-3)]">
            {tab === 'at-risk' ? 'No high-risk customers — great retention!' : 'No customer data available'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)]">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)]">
                    Last Purchase
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-3)]">
                    Orders
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-3)]">
                    Score
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-3)]">
                    Risk
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-3)]">
                    Recommended Action
                  </th>
                  {tab === 'at-risk' && (
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-3)]">
                      Re-engage
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayed.map(customer => (
                  <tr
                    key={customer.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-subtle)]"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text-1)]">{customer.name}</p>
                      {customer.phone && (
                        <p className="text-xs text-[var(--text-3)]">{customer.phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">
                      {customer.last_purchase_at
                        ? new Date(customer.last_purchase_at).toLocaleDateString('id-ID')
                        : '—'}
                      {customer.days_since_purchase > 0 && (
                        <p className="text-xs text-[var(--text-3)]">
                          {customer.days_since_purchase}d ago
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--text-1)]">
                      {customer.purchase_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="font-bold tabular-nums"
                        style={{ color: RISK_COLORS[customer.risk_level] }}
                      >
                        {customer.churn_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <RiskBadge level={customer.risk_level} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-2)]">
                      {customer.recommended_action}
                    </td>
                    {tab === 'at-risk' && (
                      <td className="px-4 py-3 text-center">
                        {sentMap[customer.id] ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Sent
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSendReEngagement(customer)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:scale-95"
                            aria-label={`Send re-engagement to ${customer.name}`}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            WhatsApp
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
