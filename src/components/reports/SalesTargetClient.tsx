'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Target,
  Trophy,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Save,
  Loader2,
  Medal,
  Users,
  Store,
  Tag,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcAchievementPct,
  calcPeriodBoundaries,
  rankByAchievement,
  isOverAchieved,
} from '@/lib/sales-targets'
import type { TargetType, TargetPeriod, AchievementWithTarget } from '@/lib/sales-targets'

// Re-export pure functions for unit tests
export {
  calcAchievementPct,
  calcPeriodBoundaries,
  rankByAchievement,
  isOverAchieved,
  dateRangesOverlap,
  getCurrentPeriodString,
  filterByPeriod,
} from '@/lib/sales-targets'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesTargetClientProps {
  storeId: string
  currency: string
}

interface SalesTargetRow {
  id: string
  storeId: string
  targetType: TargetType
  targetId: string
  period: TargetPeriod
  targetAmount: number
  startDate: string
  endDate: string
  createdAt: string
  // from achievements
  actualAmount?: number
  achievementPct?: number
  periodStr?: string
  isOverAchieved?: boolean
}

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  STORE: 'Toko',
  EMPLOYEE: 'Karyawan',
  PRODUCT_CATEGORY: 'Kategori Produk',
}

const PERIOD_LABELS: Record<TargetPeriod, string> = {
  DAILY: 'Harian',
  WEEKLY: 'Mingguan',
  MONTHLY: 'Bulanan',
}

const MEDAL_COLORS = ['text-yellow-400', 'text-gray-400', 'text-amber-600']

// ── Helper: progress bar colour ───────────────────────────────────────────────

function progressColor(pct: number) {
  if (pct >= 100) return 'bg-green-500'
  if (pct >= 75) return 'bg-blue-500'
  if (pct >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

// ── Add Target Modal ──────────────────────────────────────────────────────────

interface AddTargetModalProps {
  storeId: string
  currency: string
  onClose: () => void
  onSaved: () => void
}

function AddTargetModal({ storeId, currency, onClose, onSaved }: AddTargetModalProps) {
  const [targetType, setTargetType] = useState<TargetType>('STORE')
  const [targetId, setTargetId] = useState(storeId)
  const [period, setPeriod] = useState<TargetPeriod>('MONTHLY')
  const [targetAmount, setTargetAmount] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-fill dates from period
  const boundaries = calcPeriodBoundaries(period)

  const [startDate, setStartDate] = useState(boundaries.startDate)
  const [endDate, setEndDate] = useState(boundaries.endDate)

  const handlePeriodChange = (p: TargetPeriod) => {
    setPeriod(p)
    const b = calcPeriodBoundaries(p)
    setStartDate(b.startDate)
    setEndDate(b.endDate)
  }

  const handleTargetTypeChange = (t: TargetType) => {
    setTargetType(t)
    setTargetId(t === 'STORE' ? storeId : '')
  }

  const handleSave = async () => {
    if (!targetAmount || Number(targetAmount) <= 0) {
      toast.error('Target amount harus lebih dari 0')
      return
    }
    if (!targetId.trim()) {
      toast.error('Target ID diperlukan')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/sales-targets?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          targetType,
          targetId: targetId.trim(),
          period,
          targetAmount: Number(targetAmount),
          startDate,
          endDate,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Target berhasil ditambahkan')
      onSaved()
      onClose()
    } catch {
      toast.error('Gagal menyimpan target')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-full max-w-md rounded-xl border p-6 shadow-xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
            Tambah Target Penjualan
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-black/10">
            <X size={18} style={{ color: 'var(--text-3)' }} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Target Type */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-2)' }}>
              Tipe Target
            </label>
            <select
              value={targetType}
              onChange={(e) => handleTargetTypeChange(e.target.value as TargetType)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              {Object.entries(TARGET_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>

          {/* Target ID */}
          {targetType !== 'STORE' && (
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                {targetType === 'EMPLOYEE' ? 'ID Karyawan' : 'Nama Kategori'}
              </label>
              <input
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={targetType === 'EMPLOYEE' ? 'emp_xxx' : 'Makanan & Minuman'}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
          )}

          {/* Period */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-2)' }}>
              Periode
            </label>
            <div className="flex gap-2">
              {(['DAILY', 'WEEKLY', 'MONTHLY'] as TargetPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={cn(
                    'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                    period === p ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : ''
                  )}
                  style={
                    period !== p
                      ? { borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--bg-1)' }
                      : {}
                  }
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                Tanggal Mulai
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                Tanggal Selesai
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-2)' }}>
              Target Amount ({currency})
            </label>
            <input
              type="number"
              min="0"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="5000000"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: 'var(--primary)' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simpan
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct, label, actual, target, currency }: {
  pct: number
  label: string
  actual: number
  target: number
  currency: string
}) {
  const clampedPct = Math.min(100, pct)
  const color = progressColor(pct)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span className={cn('font-semibold', pct >= 100 ? 'text-green-500' : '')}
              style={pct < 100 ? { color: 'var(--text-1)' } : {}}>
          {pct}%
          {pct >= 100 && ' 🎉'}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--bg-2)' }}
      >
        <div
          className={cn('h-2 rounded-full transition-all', color)}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-3)' }}>
        <span>{formatCurrency(actual, currency)}</span>
        <span>/ {formatCurrency(target, currency)}</span>
      </div>
    </div>
  )
}

// ── Leaderboard Card ──────────────────────────────────────────────────────────

function LeaderboardCard({ rows, currency }: { rows: SalesTargetRow[], currency: string }) {
  const ranked = rankByAchievement(
    rows.filter(r => r.targetType === 'EMPLOYEE') as unknown as AchievementWithTarget[]
  ) as unknown as SalesTargetRow[]

  if (ranked.length === 0) return null

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="mb-4 flex items-center gap-2">
        <Trophy size={18} style={{ color: 'var(--primary)' }} />
        <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>
          Leaderboard Karyawan
        </h2>
      </div>

      <div className="space-y-3">
        {ranked.map((row, i) => (
          <div
            key={row.id}
            className="flex items-center gap-3 rounded-lg p-3"
            style={{ background: 'var(--bg-1)' }}
          >
            <div className="flex h-8 w-8 items-center justify-center">
              {i < 3 ? (
                <Medal size={20} className={MEDAL_COLORS[i]} />
              ) : (
                <span className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>
                  #{i + 1}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                {row.targetId}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                {formatCurrency(row.actualAmount ?? 0, currency)} / {formatCurrency(row.targetAmount, currency)}
              </div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  'text-sm font-bold',
                  (row.achievementPct ?? 0) >= 100 ? 'text-green-500' : ''
                )}
                style={(row.achievementPct ?? 0) < 100 ? { color: 'var(--text-1)' } : {}}
              >
                {row.achievementPct ?? 0}%
              </div>
              {(row.achievementPct ?? 0) >= 100 && (
                <div className="text-xs text-green-500">Over target!</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SalesTargetClient({ storeId, currency }: SalesTargetClientProps) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [filterType, setFilterType] = useState<TargetType | 'ALL'>('ALL')
  const [filterPeriod, setFilterPeriod] = useState<TargetPeriod | 'ALL'>('ALL')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  // Fetch achievements (which includes computed actuals)
  const { data: rows = [], isLoading, refetch } = useQuery<SalesTargetRow[]>({
    queryKey: ['sales-target-achievements', storeId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sales-targets/achievements?storeId=${storeId}&recompute=1`
      )
      if (!res.ok) throw new Error('Failed to fetch')
      return (await res.json()) as any
    },
  })

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['sales-target-achievements', storeId] })
  }

  // Summary stats
  const totalTargets = rows.length
  const achieved = rows.filter(r => (r.achievementPct ?? 0) >= 100).length
  const avgPct = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + (r.achievementPct ?? 0), 0) / rows.length)
    : 0

  // Filtered + sorted rows
  const displayed = rows
    .filter(r => filterType === 'ALL' || r.targetType === filterType)
    .filter(r => filterPeriod === 'ALL' || r.period === filterPeriod)
    .sort((a, b) =>
      sortDir === 'desc'
        ? (b.achievementPct ?? 0) - (a.achievementPct ?? 0)
        : (a.achievementPct ?? 0) - (b.achievementPct ?? 0)
    )

  const typeIcon = (t: TargetType) => {
    if (t === 'STORE') return <Store size={14} />
    if (t === 'EMPLOYEE') return <Users size={14} />
    return <Tag size={14} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'var(--primary)', opacity: 0.9 }}
          >
            <Target size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
              Target Penjualan
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Pantau target dan kuota penjualan per karyawan &amp; toko
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          <Plus size={16} />
          Tambah Target
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: 'Total Target',
            value: totalTargets,
            icon: <Target size={20} />,
            color: 'var(--primary)',
            fmt: (v: number) => String(v),
          },
          {
            label: 'Target Tercapai',
            value: achieved,
            icon: <Trophy size={20} />,
            color: '#22c55e',
            fmt: (v: number) => `${v} / ${totalTargets}`,
          },
          {
            label: 'Rata-rata Pencapaian',
            value: avgPct,
            icon: <TrendingUp size={20} />,
            color: avgPct >= 80 ? '#22c55e' : avgPct >= 50 ? '#3b82f6' : '#ef4444',
            fmt: (v: number) => `${v}%`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border p-5"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="mb-3 flex items-center gap-2" style={{ color: card.color }}>
              {card.icon}
              <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                {card.label}
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color: card.color }}>
              {card.fmt(card.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-1)' }}>
          {(['ALL', 'STORE', 'EMPLOYEE', 'PRODUCT_CATEGORY'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                filterType === t ? 'text-white' : ''
              )}
              style={filterType === t
                ? { background: 'var(--primary)' }
                : { color: 'var(--text-3)' }}
            >
              {t === 'ALL' ? 'Semua' : TARGET_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-1)' }}>
          {(['ALL', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFilterPeriod(p)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                filterPeriod === p ? 'text-white' : ''
              )}
              style={filterPeriod === p
                ? { background: 'var(--primary)' }
                : { color: 'var(--text-3)' }}
            >
              {p === 'ALL' ? 'Semua' : PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1 rounded-lg border px-3 py-1 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--bg-1)' }}
        >
          {sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          Pencapaian
        </button>
      </div>

      {/* Leaderboard + Progress List */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Leaderboard */}
        <div className="lg:col-span-1">
          <LeaderboardCard rows={rows} currency={currency} />
        </div>

        {/* Progress bars list */}
        <div className="lg:col-span-2">
          <div
            className="rounded-xl border p-5"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>
                Progress Target
              </h2>
              <button
                onClick={handleRefresh}
                className="text-xs"
                style={{ color: 'var(--primary)' }}
              >
                Perbarui
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
              </div>
            ) : displayed.length === 0 ? (
              <div className="py-12 text-center" style={{ color: 'var(--text-3)' }}>
                <Target size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Belum ada target. Klik &quot;Tambah Target&quot; untuk mulai.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {displayed.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-lg border p-4"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-1)' }}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--primary)' }}>{typeIcon(row.targetType)}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}
                        >
                          {TARGET_TYPE_LABELS[row.targetType]}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{ background: 'var(--bg-2)', color: 'var(--text-3)' }}
                        >
                          {PERIOD_LABELS[row.period]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
                        {row.startDate} → {row.endDate}
                      </div>
                    </div>

                    <ProgressBar
                      pct={row.achievementPct ?? 0}
                      label={row.targetType === 'STORE'
                        ? 'Toko'
                        : row.targetId}
                      actual={row.actualAmount ?? 0}
                      target={row.targetAmount}
                      currency={currency}
                    />

                    {(row.achievementPct ?? 0) >= 100 && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-green-500">
                        <Trophy size={12} />
                        Over-achieved! +{formatCurrency((row.actualAmount ?? 0) - row.targetAmount, currency)}
                      </div>
                    )}
                    {(row.achievementPct ?? 0) < 50 && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-red-500">
                        <TrendingDown size={12} />
                        Di bawah target — perlu perhatian
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAdd && (
        <AddTargetModal
          storeId={storeId}
          currency={currency}
          onClose={() => setShowAdd(false)}
          onSaved={handleRefresh}
        />
      )}
    </div>
  )
}
