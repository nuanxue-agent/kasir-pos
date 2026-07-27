'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, Download, TrendingUp, TrendingDown, Star, AlertTriangle, UserPlus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { RFMSegment } from '@/lib/rfm'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RFMCustomerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  recency: number
  frequency: number
  monetary: number
  scores: { recencyScore: number; frequencyScore: number; monetaryScore: number }
  segment: RFMSegment
}

interface CustomerSegmentationClientProps {
  storeId: string
  currency: string
}

// ─── Segment config ───────────────────────────────────────────────────────────

const SEGMENT_CONFIG: Record<
  RFMSegment,
  { label: string; color: string; badgeCls: string; icon: React.ReactNode; description: string }
> = {
  Champions: {
    label: 'Champions',
    color: '#10b981',
    badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: <Star className="w-3.5 h-3.5" />,
    description: 'Beli sering, baru-baru ini, belanja banyak',
  },
  Loyal: {
    label: 'Loyal',
    color: '#3b82f6',
    badgeCls: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    description: 'Pelanggan setia dengan pembelian konsisten',
  },
  New: {
    label: 'Baru',
    color: '#8b5cf6',
    badgeCls: 'bg-violet-100 text-violet-700 border-violet-200',
    icon: <UserPlus className="w-3.5 h-3.5" />,
    description: 'Pembeli baru, belum sering',
  },
  AtRisk: {
    label: 'Berisiko',
    color: '#f59e0b',
    badgeCls: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    description: 'Dulu sering beli, sekarang mulai jarang',
  },
  Lost: {
    label: 'Hilang',
    color: '#ef4444',
    badgeCls: 'bg-red-100 text-red-700 border-red-200',
    icon: <TrendingDown className="w-3.5 h-3.5" />,
    description: 'Tidak aktif dalam waktu lama',
  },
}

const ALL_SEGMENTS: RFMSegment[] = ['Champions', 'Loyal', 'New', 'AtRisk', 'Lost']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ScoreDot({ score }: { score: number }) {
  const filled = Math.round(score)
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            i <= filled ? 'bg-amber-500' : 'bg-[var(--border)]',
          )}
        />
      ))}
    </span>
  )
}

function exportCSV(rows: RFMCustomerRow[], segment: RFMSegment | 'All', currency: string) {
  const header = ['Nama', 'Telepon', 'Email', 'Recency (hari)', 'Frekuensi', 'Monetary', 'Segmen']
  const data = rows.map((r) => [
    r.name,
    r.phone ?? '',
    r.email ?? '',
    r.recency,
    r.frequency,
    r.monetary,
    SEGMENT_CONFIG[r.segment].label,
  ])
  const csv = [header, ...data].map((row) => row.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rfm-${segment}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerSegmentationClient({
  storeId,
  currency,
}: CustomerSegmentationClientProps) {
  const [activeSegment, setActiveSegment] = useState<RFMSegment | 'All'>('All')

  const { data, isLoading, isError } = useQuery<RFMCustomerRow[]>({
    queryKey: ['rfm', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/rfm?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to load RFM data')
      const json = await res.json() as { data?: unknown }
      return (json.data ?? json) as RFMCustomerRow[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const customers = data ?? []

  const segmentCounts = useMemo(() => {
    const counts: Record<string, number> = { All: customers.length }
    for (const seg of ALL_SEGMENTS) {
      counts[seg] = customers.filter((c) => c.segment === seg).length
    }
    return counts
  }, [customers])

  const filtered = useMemo(
    () => (activeSegment === 'All' ? customers : customers.filter((c) => c.segment === activeSegment)),
    [customers, activeSegment],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-2)]">
        <div className="animate-spin w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full mr-2" />
        Memuat data segmentasi...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        Gagal memuat data RFM. Coba lagi nanti.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Segmentasi Pelanggan (RFM)</h2>
        </div>
        <button
          onClick={() => exportCSV(filtered, activeSegment, currency)}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors disabled:opacity-40"
          aria-label="Ekspor CSV"
        >
          <Download className="w-4 h-4" />
          Ekspor CSV
        </button>
      </div>

      {/* Segment summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ALL_SEGMENTS.map((seg) => {
          const cfg = SEGMENT_CONFIG[seg]
          return (
            <button
              key={seg}
              onClick={() => setActiveSegment(seg)}
              className={cn(
                'p-3 rounded-xl border text-left transition-all',
                activeSegment === seg
                  ? 'border-amber-400 bg-amber-50 shadow-sm'
                  : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-amber-300',
              )}
              aria-pressed={activeSegment === seg}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span style={{ color: cfg.color }}>{cfg.icon}</span>
                <span className="text-xs font-medium text-[var(--text-2)]">{cfg.label}</span>
              </div>
              <div className="text-2xl font-bold text-[var(--text-1)]">{segmentCounts[seg] ?? 0}</div>
              <div className="text-xs text-[var(--text-3)] mt-0.5 line-clamp-2">{cfg.description}</div>
            </button>
          )
        })}
      </div>

      {/* Segment filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['All', ...ALL_SEGMENTS] as const).map((seg) => (
          <button
            key={seg}
            onClick={() => setActiveSegment(seg)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors',
              activeSegment === seg
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-2)] hover:border-amber-400',
            )}
          >
            {seg === 'All' ? 'Semua' : SEGMENT_CONFIG[seg].label}{' '}
            <span className="opacity-70">({segmentCounts[seg] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-3)]">
          Tidak ada pelanggan di segmen ini.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-muted)] text-[var(--text-2)] text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Pelanggan</th>
                <th className="text-center px-4 py-3">Recency</th>
                <th className="text-center px-4 py-3">Frekuensi</th>
                <th className="text-right px-4 py-3">Monetary</th>
                <th className="text-center px-4 py-3">R/F/M</th>
                <th className="text-center px-4 py-3">Segmen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((c) => {
                const cfg = SEGMENT_CONFIG[c.segment]
                return (
                  <tr key={c.id} className="bg-[var(--bg-card)] hover:bg-[var(--bg-muted)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-1)]">{c.name}</div>
                      {(c.phone || c.email) && (
                        <div className="text-xs text-[var(--text-3)]">{c.phone ?? c.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-[var(--text-2)]">
                      {c.recency === 0 ? 'Hari ini' : `${c.recency}h lalu`}
                    </td>
                    <td className="px-4 py-3 text-center text-[var(--text-2)]">{c.frequency}x</td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--text-1)]">
                      {formatCurrency(c.monetary, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center gap-1 text-xs text-[var(--text-3)]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3">R</span>
                          <ScoreDot score={c.scores.recencyScore} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3">F</span>
                          <ScoreDot score={c.scores.frequencyScore} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3">M</span>
                          <ScoreDot score={c.scores.monetaryScore} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium',
                          cfg.badgeCls,
                        )}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
