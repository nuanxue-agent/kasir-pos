'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import {
  Target,
  TrendingUp,
  ShoppingCart,
  Users,
  DollarSign,
  TrendingDown,
  Plus,
  Edit2,
  Save,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export const GOAL_TYPES = [
  'REVENUE',
  'ORDERS',
  'NEW_CUSTOMERS',
  'AVG_ORDER_VALUE',
  'GROSS_PROFIT',
] as const

export type GoalType = (typeof GOAL_TYPES)[number]

export const GOAL_PERIODS = ['MONTHLY', 'QUARTERLY'] as const
export type GoalPeriod = (typeof GOAL_PERIODS)[number]

export interface GoalEntry {
  id: string
  storeId: string
  type: GoalType
  period: GoalPeriod
  targetValue: number
  startDate: string
  endDate: string
}

export interface GoalProgress {
  goal: GoalEntry
  currentValue: number
  progressPct: number
  status: GoalStatus
}

export type GoalStatus = 'ON_TRACK' | 'ALMOST' | 'OVERDUE_LOW' | 'ACHIEVED'

// ── Pure utility functions (exported for unit tests) ─────────────────────────

/** Calculate progress percentage (current / target * 100), capped at 100 for display. */
export function calcGoalProgress(current: number, target: number): number {
  if (target <= 0) return current > 0 ? 100 : 0
  return (current / target) * 100
}

/** Returns the start and end dates for a period given a reference date. */
export function getPeriodDateRange(
  period: GoalPeriod,
  refDate: Date = new Date(),
): { startDate: Date; endDate: Date } {
  const year = refDate.getFullYear()
  const month = refDate.getMonth() // 0-indexed

  if (period === 'MONTHLY') {
    const startDate = new Date(year, month, 1)
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999)
    return { startDate, endDate }
  }

  // QUARTERLY: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
  const quarter = Math.floor(month / 3)
  const startDate = new Date(year, quarter * 3, 1)
  const endDate = new Date(year, quarter * 3 + 3, 0, 23, 59, 59, 999)
  return { startDate, endDate }
}

/** Classify a goal's status based on progress and whether it's overdue. */
export function classifyGoalStatus(
  progressPct: number,
  isOverdue: boolean,
): GoalStatus {
  if (progressPct >= 100) return 'ACHIEVED'
  if (isOverdue && progressPct < 50) return 'OVERDUE_LOW'
  if (progressPct >= 90) return 'ALMOST'
  return 'ON_TRACK'
}

/** Returns true if a goal's endDate is in the past. */
export function isGoalOverdue(endDate: string): boolean {
  return new Date(endDate) < new Date()
}

/** Aggregate KPI values from an array of daily summaries. */
export function aggregateKPI(
  rows: Array<{ revenue: number; orders: number; newCustomers: number }>,
): { revenue: number; orders: number; newCustomers: number } {
  return rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + (r.revenue ?? 0),
      orders: acc.orders + (r.orders ?? 0),
      newCustomers: acc.newCustomers + (r.newCustomers ?? 0),
    }),
    { revenue: 0, orders: 0, newCustomers: 0 },
  )
}

/** Returns the notification threshold state for a goal. */
export function getGoalNotification(
  progressPct: number,
  isOverdue: boolean,
): 'CONFETTI' | 'ALMOST' | 'ALERT' | null {
  if (progressPct >= 100) return 'CONFETTI'
  if (progressPct >= 90) return 'ALMOST'
  if (isOverdue && progressPct < 50) return 'ALERT'
  return null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  REVENUE: 'Omzet',
  ORDERS: 'Pesanan',
  NEW_CUSTOMERS: 'Pelanggan Baru',
  AVG_ORDER_VALUE: 'Rata-rata Pesanan',
  GROSS_PROFIT: 'Laba Kotor',
}

const GOAL_TYPE_ICONS: Record<GoalType, React.ReactNode> = {
  REVENUE: <DollarSign className="h-4 w-4" />,
  ORDERS: <ShoppingCart className="h-4 w-4" />,
  NEW_CUSTOMERS: <Users className="h-4 w-4" />,
  AVG_ORDER_VALUE: <TrendingUp className="h-4 w-4" />,
  GROSS_PROFIT: <TrendingDown className="h-4 w-4" />,
}

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  MONTHLY: 'Bulanan',
  QUARTERLY: 'Kuartalan',
}

// ── Confetti (pure CSS) ────────────────────────────────────────────────────────

function ConfettiAnimation() {
  const colors = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#f97316']
  const pieces = Array.from({ length: 20 }, (_, i) => i)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden>
      {pieces.map(i => (
        <span
          key={i}
          className="absolute block h-2 w-2 rounded-sm opacity-0"
          style={{
            left: `${5 + (i % 10) * 9.5}%`,
            top: '-8px',
            backgroundColor: colors[i % colors.length],
            animation: `confetti-fall ${0.8 + (i % 5) * 0.3}s ease-in ${(i % 7) * 0.1}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120px) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ── Progress Gauge ─────────────────────────────────────────────────────────────

function GoalGauge({ pct }: { pct: number }) {
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
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">Progress</span>
        <span className={`text-xs font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 90 ? 'text-amber-600' : 'text-foreground'}`}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

// ── Goal Card ──────────────────────────────────────────────────────────────────

function GoalCard({
  progress,
  currency,
  onEdit,
}: {
  progress: GoalProgress
  currency: string
  onEdit: (g: GoalEntry) => void
}) {
  const { goal, currentValue, progressPct, status } = progress
  const overdue = isGoalOverdue(goal.endDate)
  const notification = getGoalNotification(progressPct, overdue)
  const isCurrency = ['REVENUE', 'AVG_ORDER_VALUE', 'GROSS_PROFIT'].includes(goal.type)
  const fmt = (v: number) => (isCurrency ? formatCurrency(v, currency) : String(v))

  return (
    <div className="relative rounded-xl border border-border bg-card p-4 shadow-sm overflow-hidden">
      {notification === 'CONFETTI' && <ConfettiAnimation />}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {GOAL_TYPE_ICONS[goal.type]}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{GOAL_TYPE_LABELS[goal.type]}</p>
            <p className="text-xs text-muted-foreground">{PERIOD_LABELS[goal.period]}</p>
          </div>
        </div>
        <button
          onClick={() => onEdit(goal)}
          className="rounded p-1 hover:bg-muted text-muted-foreground"
          title="Edit target"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Values */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Saat ini</p>
          <p className="text-lg font-bold text-foreground">{fmt(currentValue)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Target</p>
          <p className="text-sm font-semibold text-muted-foreground">{fmt(goal.targetValue)}</p>
        </div>
      </div>

      {/* Gauge */}
      <GoalGauge pct={progressPct} />

      {/* Notification badge */}
      {notification === 'ALMOST' && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-700">
          <Target className="h-3.5 w-3.5 shrink-0" />
          Hampir tercapai!
        </div>
      )}
      {notification === 'ALERT' && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Periode berakhir, target belum tercapai
        </div>
      )}
      {notification === 'CONFETTI' && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Target tercapai! 🎉
        </div>
      )}

      {/* Period dates */}
      <p className="mt-2 text-[10px] text-muted-foreground">
        {new Date(goal.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
        {' – '}
        {new Date(goal.endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  )
}

// ── Add / Edit Modal ───────────────────────────────────────────────────────────

interface GoalFormState {
  type: GoalType
  period: GoalPeriod
  targetValue: string
}

function GoalFormModal({
  editing,
  storeId,
  onClose,
}: {
  editing: GoalEntry | null
  storeId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const now = new Date()
  const [form, setForm] = useState<GoalFormState>({
    type: editing?.type ?? 'REVENUE',
    period: editing?.period ?? 'MONTHLY',
    targetValue: editing ? String(editing.targetValue) : '',
  })

  const { startDate, endDate } = getPeriodDateRange(form.period as GoalPeriod, now)

  const mutation = useMutation({
    mutationFn: async (data: GoalFormState) => {
      const body = {
        type: data.type,
        period: data.period,
        targetValue: parseFloat(data.targetValue),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      }
      if (editing) {
        const res = await fetch(`/api/goals/${editing.id}?storeId=${storeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to update goal')
        return res.json()
      } else {
        const res = await fetch(`/api/goals?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to create goal')
        return res.json()
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals', storeId] })
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = parseFloat(form.targetValue)
    if (isNaN(v) || v <= 0) return
    mutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-semibold text-foreground">
            {editing ? 'Edit Target' : 'Tambah Target Baru'}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Jenis Target
            </label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as GoalType }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {GOAL_TYPES.map(t => (
                <option key={t} value={t}>
                  {GOAL_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Periode</label>
            <select
              value={form.period}
              onChange={e => setForm(f => ({ ...f, period: e.target.value as GoalPeriod }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {GOAL_PERIODS.map(p => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Nilai Target
            </label>
            <input
              type="number"
              min={1}
              step="any"
              value={form.targetValue}
              onChange={e => setForm(f => ({ ...f, targetValue: e.target.value }))}
              placeholder="contoh: 50000000"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Periode:{' '}
            {startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
            {' – '}
            {endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>

          <div className="flex justify-end gap-2 pt-2">
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

// ── Main Component ─────────────────────────────────────────────────────────────

interface GoalTrackerClientProps {
  storeId: string
  currency: string
}

export function GoalTrackerClient({ storeId, currency }: GoalTrackerClientProps) {
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GoalEntry | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<GoalPeriod>('MONTHLY')

  // Fetch goals with current KPI progress
  const { data: progressList = [], isLoading } = useQuery<GoalProgress[]>({
    queryKey: ['goals', storeId, selectedPeriod],
    queryFn: async () => {
      const res = await fetch(
        `/api/goals?storeId=${storeId}&period=${selectedPeriod}`,
      )
      if (!res.ok) throw new Error('Failed to fetch goals')
      return res.json()
    },
    staleTime: 30_000,
  })

  const handleEdit = useCallback((goal: GoalEntry) => {
    setEditingGoal(goal)
    setShowModal(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setShowModal(false)
    setEditingGoal(null)
  }, [])

  const achieved = progressList.filter(p => p.progressPct >= 100).length
  const atRisk = progressList.filter(
    p => isGoalOverdue(p.goal.endDate) && p.progressPct < 50,
  ).length

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Target & KPI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pantau progress target bisnis per periode
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value as GoalPeriod)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {GOAL_PERIODS.map(p => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
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

      {/* ── Summary bar ── */}
      {progressList.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{progressList.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Target</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{achieved}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Tercapai</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{atRisk}</p>
            <p className="text-xs text-red-600 mt-0.5">Berisiko</p>
          </div>
        </div>
      )}

      {/* ── Goals Grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : progressList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Target className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium text-foreground">Belum ada target</p>
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
          {progressList.map(p => (
            <GoalCard
              key={p.goal.id}
              progress={p}
              currency={currency}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <GoalFormModal
          editing={editingGoal}
          storeId={storeId}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}
