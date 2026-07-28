'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Trophy,
  Package,
  RefreshCw,
  CheckCheck,
  Sparkles,
  Info,
  BarChart2,
} from 'lucide-react'
import type { BusinessInsightType, InsightSeverity } from '@/lib/insights-detection'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BusinessInsight {
  id: string
  storeId: string
  type: BusinessInsightType
  title: string
  description: string
  severity: InsightSeverity
  data: Record<string, unknown>
  createdAt: string
  read: boolean
}

// ─── Visual config ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  BusinessInsightType,
  { icon: React.ReactNode; label: string; badgeClass: string }
> = {
  SPIKE: {
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    label: 'Lonjakan',
    badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  DIP: {
    icon: <TrendingDown className="h-3.5 w-3.5" />,
    label: 'Penurunan',
    badgeClass: 'bg-red-50 text-red-700 border border-red-200',
  },
  TREND: {
    icon: <BarChart2 className="h-3.5 w-3.5" />,
    label: 'Tren',
    badgeClass: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  MILESTONE: {
    icon: <Trophy className="h-3.5 w-3.5" />,
    label: 'Milestone',
    badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  LOW_STOCK: {
    icon: <Package className="h-3.5 w-3.5" />,
    label: 'Stok Rendah',
    badgeClass: 'bg-orange-50 text-orange-700 border border-orange-200',
  },
}

const SEVERITY_CONFIG: Record<
  InsightSeverity,
  { border: string; bg: string; dot: string; badge: string }
> = {
  INFO: {
    border: 'border-blue-100',
    bg: 'bg-blue-50/30',
    dot: 'bg-blue-400',
    badge: 'bg-blue-50 text-blue-600 border border-blue-200',
  },
  WARNING: {
    border: 'border-amber-200',
    bg: 'bg-amber-50/30',
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-600 border border-amber-200',
  },
  CRITICAL: {
    border: 'border-red-200',
    bg: 'bg-red-50/30',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-600 border border-red-200',
  },
}

const SEVERITY_LABELS: Record<InsightSeverity, string> = {
  INFO: 'Info',
  WARNING: 'Perhatian',
  CRITICAL: 'Kritis',
}

// ─── Sparkline stub ───────────────────────────────────────────────────────────

function SparklineStub({ type, severity }: { type: BusinessInsightType; severity: InsightSeverity }) {
  const color =
    severity === 'CRITICAL'
      ? '#ef4444'
      : severity === 'WARNING'
        ? '#f59e0b'
        : type === 'SPIKE'
          ? '#10b981'
          : type === 'DIP'
            ? '#ef4444'
            : '#3b82f6'

  // Simple SVG sparkline stub — 5 bars representing relative trend
  const bars =
    type === 'SPIKE'
      ? [30, 35, 32, 38, 80]
      : type === 'DIP'
        ? [60, 55, 58, 52, 20]
        : type === 'TREND'
          ? [30, 40, 38, 50, 60]
          : type === 'LOW_STOCK'
            ? [80, 60, 40, 20, 10]
            : [40, 45, 48, 50, 55]

  const maxVal = Math.max(...bars)

  return (
    <svg
      width="48"
      height="24"
      viewBox="0 0 48 24"
      aria-hidden="true"
      className="shrink-0 opacity-60"
    >
      {bars.map((v, i) => {
        const barH = Math.round((v / maxVal) * 20)
        const x = i * 10 + 1
        const y = 24 - barH - 1
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width="7"
            height={barH}
            rx="1.5"
            fill={color}
            fillOpacity={0.7 + i * 0.06}
          />
        )
      })}
    </svg>
  )
}

// ─── Insight card ─────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  onMarkRead,
  isMarkingRead,
}: {
  insight: BusinessInsight
  onMarkRead: (id: string) => void
  isMarkingRead: boolean
}) {
  const typeConf = TYPE_CONFIG[insight.type]
  const sevConf = SEVERITY_CONFIG[insight.severity]

  return (
    <div
      className={`rounded-xl border p-4 transition-all hover:shadow-sm ${sevConf.border} ${sevConf.bg} ${insight.read ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <div className="mt-1.5 shrink-0">
          <span className={`block h-2 w-2 rounded-full ${sevConf.dot}`} />
        </div>

        <div className="min-w-0 flex-1">
          {/* Badges row */}
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeConf.badgeClass}`}
            >
              {typeConf.icon}
              {typeConf.label}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sevConf.badge}`}
            >
              {SEVERITY_LABELS[insight.severity]}
            </span>
            {insight.read && (
              <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-3)]">
                Dibaca
              </span>
            )}
          </div>

          {/* Title & description */}
          <p className="text-sm font-semibold text-[var(--text-1)]">{insight.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-2)]">
            {insight.description}
          </p>

          {/* Footer row */}
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <time className="text-[10px] text-[var(--text-3)]">
              {new Date(insight.createdAt).toLocaleString('id-ID', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            {!insight.read && (
              <button
                onClick={() => onMarkRead(insight.id)}
                disabled={isMarkingRead}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 disabled:opacity-50"
              >
                <CheckCheck className="h-3 w-3" />
                Tandai dibaca
              </button>
            )}
          </div>
        </div>

        {/* Sparkline */}
        <div className="shrink-0 self-center">
          <SparklineStub type={insight.type} severity={insight.severity} />
        </div>
      </div>
    </div>
  )
}

// ─── Skeletons & empty state ──────────────────────────────────────────────────

function InsightSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
      ))}
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
        <Sparkles className="h-6 w-6 text-emerald-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text-1)]">
          {filtered ? 'Tidak ada insight untuk filter ini' : 'Belum ada insight'}
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-3)]">
          {filtered
            ? 'Coba filter lain atau generate insights baru.'
            : 'Klik "Generate" untuk menjalankan deteksi anomali terbaru.'}
        </p>
      </div>
    </div>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

type SeverityFilter = 'ALL' | InsightSeverity

const SEVERITY_FILTERS: Array<{ key: SeverityFilter; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'CRITICAL', label: '🔴 Kritis' },
  { key: 'WARNING', label: '🟡 Perhatian' },
  { key: 'INFO', label: '🔵 Info' },
]

// ─── Main component ───────────────────────────────────────────────────────────

interface InsightsClientProps {
  storeId: string
}

export function InsightsClient({ storeId }: InsightsClientProps) {
  const qc = useQueryClient()
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [unreadOnly, setUnreadOnly] = useState(false)

  // Build query params
  const queryParams = new URLSearchParams({ storeId })
  if (unreadOnly) queryParams.set('unreadOnly', 'true')
  if (severityFilter !== 'ALL') queryParams.set('severity', severityFilter)

  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<{ insights: BusinessInsight[]; total: number }>({
    queryKey: ['business-insights', storeId, severityFilter, unreadOnly],
    queryFn: async () => {
      const res = await fetch(`/api/business-insights?${queryParams}`)
      if (!res.ok) throw new Error('Failed to load insights')
      return res.json()
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/business-insights/generate?storeId=${encodeURIComponent(storeId)}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Generation failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-insights', storeId] })
    },
  })

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/business-insights/${id}/read?storeId=${encodeURIComponent(storeId)}`,
        { method: 'PATCH' },
      )
      if (!res.ok) throw new Error('Mark read failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-insights', storeId] })
    },
  })

  const insights = data?.insights ?? []
  const unreadCount = insights.filter(i => !i.read).length
  const criticalCount = insights.filter(i => i.severity === 'CRITICAL').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--text-1)]">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Business Insights
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Deteksi anomali dan tren otomatis dari data 30 hari terakhir
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-subtle)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50"
          >
            <Sparkles className={`h-3.5 w-3.5 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            {generateMutation.isPending ? 'Mendeteksi…' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Generate result toast */}
      {generateMutation.isSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCheck className="h-4 w-4 shrink-0" />
          {(generateMutation.data as any)?.inserted > 0
            ? `${(generateMutation.data as any).inserted} insight baru ditemukan.`
            : 'Tidak ada anomali baru ditemukan saat ini.'}
        </div>
      )}

      {/* Summary pills */}
      {insights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1 text-xs font-medium text-[var(--text-2)]">
            {insights.length} insight
          </span>
          {unreadCount > 0 && (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
              {unreadCount} belum dibaca
            </span>
          )}
          {criticalCount > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
              {criticalCount} kritis
            </span>
          )}
        </div>
      )}

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Severity filter tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {SEVERITY_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setSeverityFilter(f.key)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                severityFilter === f.key
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-muted)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Unread toggle */}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={e => setUnreadOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-amber-500"
          />
          Belum dibaca saja
        </label>
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
      ) : insights.length === 0 ? (
        <EmptyState filtered={severityFilter !== 'ALL' || unreadOnly} />
      ) : (
        <div className="space-y-3">
          {insights.map(insight => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onMarkRead={id => markReadMutation.mutate(id)}
              isMarkingRead={markReadMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-[10px] text-[var(--text-3)]">
        Insights dihasilkan dari data toko 30 hari terakhir · Klik Generate untuk memperbarui
      </p>
    </div>
  )
}

export default InsightsClient
