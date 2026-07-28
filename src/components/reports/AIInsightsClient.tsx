'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Star,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Info,
} from 'lucide-react'
import type { Insight, InsightType, InsightSeverity } from '@/app/api/insights/route'

// Re-export types for consumers
export type { Insight, InsightType, InsightSeverity }

// ── Visual config ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  InsightType,
  { icon: React.ReactNode; label: string; badgeClass: string }
> = {
  TREND: {
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    label: 'Trend',
    badgeClass: 'bg-blue-50 text-blue-600 border border-blue-200',
  },
  ANOMALY: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    label: 'Anomaly',
    badgeClass: 'bg-orange-50 text-orange-600 border border-orange-200',
  },
  RECOMMENDATION: {
    icon: <Star className="h-3.5 w-3.5" />,
    label: 'Rekomendasi',
    badgeClass: 'bg-amber-50 text-amber-600 border border-amber-200',
  },
  OPPORTUNITY: {
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    label: 'Peluang',
    badgeClass: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  },
}

const SEVERITY_CONFIG: Record<
  InsightSeverity,
  { border: string; bg: string; iconColor: string; dot: string }
> = {
  INFO: {
    border: 'border-blue-100',
    bg: 'bg-blue-50/40',
    iconColor: 'text-blue-500',
    dot: 'bg-blue-400',
  },
  WARNING: {
    border: 'border-amber-200',
    bg: 'bg-amber-50/40',
    iconColor: 'text-amber-500',
    dot: 'bg-amber-400',
  },
  CRITICAL: {
    border: 'border-red-200',
    bg: 'bg-red-50/40',
    iconColor: 'text-red-500',
    dot: 'bg-red-500',
  },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const typeConf = TYPE_CONFIG[insight.type]
  const sevConf = SEVERITY_CONFIG[insight.severity]

  return (
    <div
      className={`rounded-xl border p-4 transition-all hover:shadow-sm ${sevConf.border} ${sevConf.bg}`}
    >
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <div className="mt-1.5 flex shrink-0 items-center">
          <span className={`h-2 w-2 rounded-full ${sevConf.dot}`} />
        </div>

        <div className="min-w-0 flex-1">
          {/* Type badge */}
          <span
            className={`mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeConf.badgeClass}`}
          >
            {typeConf.icon}
            {typeConf.label}
          </span>

          {/* Title & description */}
          <p className="text-sm font-semibold text-[var(--text-1)]">{insight.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-2)]">
            {insight.description}
          </p>

          {/* Action button */}
          <Link
            href={insight.actionHref}
            className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition-all hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 active:scale-95"
          >
            {insight.actionLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: InsightSeverity }) {
  const labels: Record<InsightSeverity, string> = {
    INFO: 'Info',
    WARNING: 'Perhatian',
    CRITICAL: 'Kritis',
  }
  const classes: Record<InsightSeverity, string> = {
    INFO: 'bg-blue-50 text-blue-600 border border-blue-200',
    WARNING: 'bg-amber-50 text-amber-600 border border-amber-200',
    CRITICAL: 'bg-red-50 text-red-600 border border-red-200',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${classes[severity]}`}>
      {labels[severity]}
    </span>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function InsightSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
      ))}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
        <Sparkles className="h-6 w-6 text-emerald-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text-1)]">Semua berjalan lancar</p>
        <p className="mt-0.5 text-xs text-[var(--text-3)]">
          Tidak ada insight yang perlu diperhatikan saat ini.
        </p>
      </div>
    </div>
  )
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterTab = 'ALL' | InsightType | InsightSeverity

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'CRITICAL', label: '🔴 Kritis' },
  { key: 'WARNING', label: '🟡 Perhatian' },
  { key: 'RECOMMENDATION', label: '⭐ Rekomendasi' },
  { key: 'OPPORTUNITY', label: '💡 Peluang' },
]

function filterInsights(insights: Insight[], tab: FilterTab): Insight[] {
  if (tab === 'ALL') return insights
  if (tab === 'CRITICAL' || tab === 'WARNING' || tab === 'INFO') {
    return insights.filter(i => i.severity === tab)
  }
  return insights.filter(i => i.type === tab)
}

// ── Main component ────────────────────────────────────────────────────────────

interface AIInsightsClientProps {
  storeId: string
  /** If true, render the full page panel; if false render compact widget mode */
  compact?: boolean
}

export function AIInsightsClient({ storeId, compact = false }: AIInsightsClientProps) {
  const [activeFilter, setActiveFilter] = React.useState<FilterTab>('ALL')

  const { data: insights, isLoading, error, refetch, isFetching } = useQuery<Insight[]>({
    queryKey: ['insights', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/insights?storeId=${encodeURIComponent(storeId)}`)
      if (!res.ok) throw new Error('Failed to load insights')
      return res.json()
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const filtered = insights ? filterInsights(insights, activeFilter) : []

  const criticalCount = insights?.filter(i => i.severity === 'CRITICAL').length ?? 0
  const warningCount = insights?.filter(i => i.severity === 'WARNING').length ?? 0

  if (compact) {
    // ── Compact widget for dashboard ──────────────────────────────────────────
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Smart Insights
            {criticalCount > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                {criticalCount}
              </span>
            )}
          </h2>
          <Link
            href="/dashboard/insights"
            className="flex items-center gap-1 text-xs font-medium text-amber-600 transition-colors hover:text-amber-700"
          >
            Lihat semua <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 px-4 py-4 text-xs text-[var(--text-3)]">
            <Info className="h-3.5 w-3.5" />
            Gagal memuat insights
          </div>
        ) : !insights?.length ? (
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
              <Sparkles className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-sm text-[var(--text-2)]">Tidak ada insight saat ini ✓</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            {insights.slice(0, 3).map(insight => {
              const typeConf = TYPE_CONFIG[insight.type]
              const sevConf = SEVERITY_CONFIG[insight.severity]
              return (
                <div
                  key={insight.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${sevConf.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${typeConf.badgeClass}`}
                      >
                        {typeConf.icon}
                        {typeConf.label}
                      </span>
                      <SeverityBadge severity={insight.severity} />
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium text-[var(--text-1)]">
                      {insight.title}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Full page panel ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--text-1)]">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Smart Insights
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Rekomendasi otomatis berdasarkan data toko Anda
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-subtle)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary pills */}
      {insights && insights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1 text-xs font-medium text-[var(--text-2)]">
            {insights.length} insight total
          </span>
          {criticalCount > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
              {criticalCount} kritis
            </span>
          )}
          {warningCount > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
              {warningCount} perlu perhatian
            </span>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
              activeFilter === tab.key
                ? 'bg-amber-500 text-white shadow-sm'
                : 'border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-muted)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <InsightSkeleton />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-red-600">Gagal memuat insights</p>
          <p className="mt-1 text-xs text-red-400">Coba refresh halaman ini</p>
          <button
            onClick={() => refetch()}
            className="mt-3 rounded-xl bg-red-100 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-200"
          >
            Coba lagi
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {filtered.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      {/* Footer note */}
      <p className="text-center text-[10px] text-[var(--text-3)]">
        Insights diperbarui otomatis setiap 60 detik · Dihasilkan dari data real-time toko Anda
      </p>
    </div>
  )
}

// Need React import for useState
import React from 'react'

export default AIInsightsClient
