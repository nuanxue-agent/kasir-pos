'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import {
  Target,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Users,
  DollarSign,
  BarChart2,
  RepeatIcon,
  Plus,
  Edit2,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Bell,
  Minus,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export const KPI_METRICS = [
  'REVENUE',
  'ORDERS',
  'CUSTOMERS',
  'AVG_ORDER',
  'REPEAT_RATE',
] as const
export type KpiMetric = (typeof KPI_METRICS)[number]

export const KPI_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const
export type KpiPeriod = (typeof KPI_PERIODS)[number]

export type GoalStatus = 'ON_TRACK' | 'AT_RISK' | 'ACHIEVED' | 'MISSED'

export interface KpiGoal {
  id: string
  storeId: string
  metric: KpiMetric
  period: KpiPeriod
  target: number
  actual: number
  year: number
  month: number | null
  quarter: number | null
  createdAt: string
}

export interface KpiGoalWithStatus extends KpiGoal {
  achievementPct: number
  status: GoalStatus
  trend: number | null // % change vs previous period
}

// ── Pure utility functions (exported for unit tests) ──────────────────────────

/** Calculate achievement percentage (actual / target * 100). */
export function calcAchievementPct(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0
  return (actual / target) * 100
}

/** Determine goal status based on achievement % and whether period has passed. */
export function calcGoalStatus(
  achievementPct: number,
  periodEndDate: Date,
  now: Date = new Date(),
): GoalStatus {
  if (achievementPct >= 100) return 'ACHIEVED'
  const periodEnded = now > periodEndDate
  if (periodEnded) return 'MISSED'
  if (achievementPct >= 70) return 'ON_TRACK'
  return 'AT_RISK'
}

/** Compute trend percentage vs previous period value. */
export function calcTrend(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

/** Validate that a target value is positive. */
export function validateTarget(target: number): boolean {
  return Number.isFinite(target) && target > 0
}

/** Get start/end dates for a given period spec. */
export function getPeriodDateRange(
  period: KpiPeriod,
  year: number,
  month: number | null,
  quarter: number | null,
): { startDate: Date; endDate: Date } {
  if (period === 'MONTHLY' && month !== null) {
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)
    return { startDate, endDate }
  }
  if (period === 'QUARTERLY' && quarter !== null) {
    const startMonth = (quarter - 1) * 3
    const startDate = new Date(year, startMonth, 1)
    const endDate = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)
    return { startDate, endDate }
  }
  // YEARLY
  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31, 23, 59, 59, 999)
  return { startDate, endDate }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<KpiMetric, string> = {
  REVENUE: 'Pendapatan',
  ORDERS: 'Jumlah Pesanan',
  CUSTOMERS: 'Pelanggan Baru',
  AVG_ORDER: 'Rata-rata Pesanan',
  REPEAT_RATE: 'Tingkat Repeat',
}

const PERIOD_LABELS: Record<KpiPeriod, string> = {
  MONTHLY: 'Bulanan',
  QUARTERLY: 'Kuartalan',
  YEARLY: 'Tahunan',
}

const METRIC_ICONS: Record<KpiMetric, React.ReactNode> = {
  REVENUE: <DollarSign className="h-4 w-4" />,
  ORDERS: <ShoppingCart className="h-4 w-4" />,
  CUSTOMERS: <Users className="h-4 w-4" />,
  AVG_ORDER: <BarChart2 className="h-4 w-4" />,
  REPEAT_RATE: <RepeatIcon className="h-4 w-4" />,
}

const STATUS_CONFIG: Record<GoalStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ACHIEVED: {
    label: 'Tercapai',
    color: 'text-emerald-600',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  },
  ON_TRACK: {
    label: 'Sesuai Target',
    color: 'text-blue-600',
    icon: <TrendingUp className="h-4 w-4 text-blue-500" />,
  },
  AT_RISK: {
    label: 'Berisiko',
    color: 'text-amber-600',
    icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  },
  MISSED: {
    label: 'Tidak Tercapai',
    color: 'text-red-600',
    icon: <X className="h-4 w-4 text-red-500" />,
  },
}

function isPercentMetric(metric: KpiMetric) {
  return metric === 'REPEAT_RATE'
}

function formatMetricValue(value: number, metric: KpiMetric, currency: string) {
  if (isPercentMetric(metric)) return `${value.toFixed(1)}%`
  if (metric === 'ORDERS' || metric === 'CUSTOMERS') return value.toLocaleString('id-ID')
  return formatCurrency(value, currency)
}

// ── Achievement Notification Stub ─────────────────────────────────────────────

function triggerAchievementAlert(goal: KpiGoal) {
  // Stub: in production wire to toast/push notification
  console.info(`[KPI Achievement] ${METRIC_LABELS[goal.metric]} target reached!`, goal)
}

// ── Goal Card ─────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: KpiGoalWithStatus
  currency: string
  onEdit: (goal: KpiGoal) => void
}

function GoalCard({ goal, currency, onEdit }: GoalCardProps) {
  const clampedPct = Math.min(goal.achievementPct, 100)
  const statusConf = STATUS_CONFIG[goal.status]

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 relative">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {METRIC_ICONS[goal.metric]}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{METRIC_LABELS[goal.metric]}</p>
            <p className="text-xs text-muted-foreground">{PERIOD_LABELS[goal.period]}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {statusConf.icon}
          <span className={`text-xs font-medium ${statusConf.color}`}>{statusConf.label}</span>
          <button
            onClick={() => onEdit(goal)}
            className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Edit goal"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Values */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Aktual</p>
          <p className="font-semibold text-foreground">
            {formatMetricValue(goal.actual, goal.metric, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Target</p>
          <p className="font-semibold text-foreground">
            {formatMetricValue(goal.target, goal.metric, currency)}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className={`font-semibold ${goal.achievementPct >= 100 ? 'text-emerald-600' : 'text-foreground'}`}>
            {goal.achievementPct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              goal.achievementPct >= 100
                ? 'bg-emerald-500'
                : goal.achievementPct >= 70
                  ? 'bg-blue-500'
                  : goal.achievementPct >= 40
                    ? 'bg-amber-500'
                    : 'bg-red-500'
            }`}
            style={{ width: `${clampedPct}%` }}
          />
        </div>
      </div>

      {/* Trend */}
      {goal.trend !== null && (
        <div className="flex items-center gap-1 text-xs">
          {goal.trend > 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          ) : goal.trend < 0 ? (
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span
            className={
              goal.trend > 0
                ? 'text-emerald-600'
                : goal.trend < 0
                  ? 'text-red-600'
                  : 'text-muted-foreground'
            }
          >
            {goal.trend > 0 ? '+' : ''}
            {goal.trend.toFixed(1)}% vs periode sebelumnya
          </span>
        </div>
      )}

      {/* Achievement notification badge */}
      {goal.status === 'ACHIEVED' && (
        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700 border border-emerald-200">
          <Bell className="h-3.5 w-3.5" />
          Target tercapai!
        </div>
      )}
    </div>
  )
}

// ── Goal Form Modal ───────────────────────────────────────────────────────────

interface GoalFormModalProps {
  editing: KpiGoal | null
  storeId: string
  onClose: () => void
}

function GoalFormModal({ editing, storeId, onClose }: GoalFormModalProps) {
  const queryClient = useQueryClient()
  const now = new Date()

  const [form, setForm] = useState({
    metric: editing?.metric ?? ('REVENUE' as KpiMetric),
    period: editing?.period ?? ('MONTHLY' as KpiPeriod),
    target: editing?.target ? String(editing.target) : '',
    year: editing?.year ?? now.getFullYear(),
    month: editing?.month ?? now.getMonth() + 1,
    quarter: editing?.quarter ?? Math.ceil((now.getMonth() + 1) / 3),
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const targetNum = Number(form.target)
      if (!validateTarget(targetNum)) throw new Error('Target harus lebih dari 0')

      const body = {
        storeId,
        metric: form.metric,
        period: form.period,
        target: targetNum,
        year: form.year,
        month: form.period === 'MONTHLY' ? form.month : null,
        quarter: form.period === 'QUARTERLY' ? form.quarter : null,
      }

      if (editing) {
        const res = await fetch(`/api/kpi-goals/${editing.id}?storeId=${storeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error((await res.json() as any).error ?? 'Gagal update')
      } else {
        const res = await fetch('/api/kpi-goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error((await res.json() as any).error ?? 'Gagal simpan')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-goals'] })
      queryClient.invalidateQueries({ queryKey: ['kpi-goals-progress'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  const currentYear = now.getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">
            {editing ? 'Edit Target KPI' : 'Tambah Target KPI'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200">
              {error}
            </p>
          )}

          {/* Metric */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Metrik KPI</label>
            <select
              value={form.metric}
              onChange={e => setForm(f => ({ ...f, metric: e.target.value as KpiMetric }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {KPI_METRICS.map(m => (
                <option key={m} value={m}>{METRIC_LABELS[m]}</option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Periode</label>
            <select
              value={form.period}
              onChange={e => setForm(f => ({ ...f, period: e.target.value as KpiPeriod }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {KPI_PERIODS.map(p => (
                <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Tahun</label>
            <select
              value={form.year}
              onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Month (only for MONTHLY) */}
          {form.period === 'MONTHLY' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Bulan</label>
              <select
                value={form.month}
                onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString('id-ID', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quarter (only for QUARTERLY) */}
          {form.period === 'QUARTERLY' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Kuartal</label>
              <select
                value={form.quarter}
                onChange={e => setForm(f => ({ ...f, quarter: Number(e.target.value) }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {[1, 2, 3, 4].map(q => (
                  <option key={q} value={q}>Q{q}</option>
                ))}
              </select>
            </div>
          )}

          {/* Target value */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Nilai Target{isPercentMetric(form.metric) ? ' (%)' : ''}
            </label>
            <input
              type="number"
              min={0.01}
              step="any"
              value={form.target}
              onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
              placeholder={isPercentMetric(form.metric) ? 'contoh: 30' : 'contoh: 50000000'}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface KpiGoalsClientProps {
  storeId: string
  currency: string
}

export function KpiGoalsClient({ storeId, currency }: KpiGoalsClientProps) {
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<KpiGoal | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<KpiPeriod>('MONTHLY')

  const { data: goals = [], isLoading } = useQuery<KpiGoalWithStatus[]>({
    queryKey: ['kpi-goals-progress', storeId, selectedPeriod],
    queryFn: async () => {
      const res = await fetch(
        `/api/kpi-goals/progress?storeId=${storeId}&period=${selectedPeriod}`,
      )
      if (!res.ok) throw new Error('Failed to fetch KPI goals')
      const data = await res.json() as KpiGoalWithStatus[]
      // Trigger achievement alerts for newly-achieved goals
      data.forEach(g => {
        if (g.status === 'ACHIEVED') triggerAchievementAlert(g)
      })
      return data
    },
    staleTime: 30_000,
  })

  const handleEdit = useCallback((goal: KpiGoal) => {
    setEditingGoal(goal)
    setShowModal(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setShowModal(false)
    setEditingGoal(null)
  }, [])

  const achieved = goals.filter(g => g.status === 'ACHIEVED').length
  const atRisk = goals.filter(g => g.status === 'AT_RISK' || g.status === 'MISSED').length

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Target KPI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pantau progress target KPI per periode
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value as KpiPeriod)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {KPI_PERIODS.map(p => (
              <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
            ))}
          </select>
          <button
            onClick={() => { setEditingGoal(null); setShowModal(true) }}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Tambah Target
          </button>
        </div>
      </div>

      {/* Summary */}
      {goals.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{goals.length}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Total Target</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{achieved}</p>
            <p className="mt-0.5 text-xs text-emerald-600">Tercapai</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{atRisk}</p>
            <p className="mt-0.5 text-xs text-red-600">Berisiko</p>
          </div>
        </div>
      )}

      {/* Goals grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Target className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">Belum ada target KPI</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tambahkan target untuk memantau progress bisnis Anda
          </p>
          <button
            onClick={() => { setEditingGoal(null); setShowModal(true) }}
            className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Tambah Target Pertama
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map(g => (
            <GoalCard key={g.id} goal={g} currency={currency} onEdit={handleEdit} />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <GoalFormModal editing={editingGoal} storeId={storeId} onClose={handleCloseModal} />
      )}
    </div>
  )
}
