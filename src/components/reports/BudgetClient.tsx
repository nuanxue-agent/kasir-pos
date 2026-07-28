'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { formatCurrency } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Copy,
  Edit2,
  Save,
  X,
  Bell,
  BellOff,
} from 'lucide-react'

// Dynamic recharts imports
const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false })
const Legend = dynamic(() => import('recharts').then((m) => m.Legend), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), {
  ssr: false,
})
const ReferenceLine = dynamic(() => import('recharts').then((m) => m.ReferenceLine), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────────

export const BUDGET_CATEGORIES = [
  'COGS',
  'PAYROLL',
  'RENT',
  'UTILITIES',
  'MARKETING',
  'OTHER',
] as const

export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number]

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  COGS: 'Harga Pokok Penjualan',
  PAYROLL: 'Penggajian',
  RENT: 'Sewa',
  UTILITIES: 'Utilitas',
  MARKETING: 'Pemasaran',
  OTHER: 'Lainnya',
}

export interface BudgetEntry {
  id: string
  storeId: string
  category: BudgetCategory
  period: string // YYYY-MM
  budgetAmount: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface BudgetVsActual {
  category: BudgetCategory
  budgetAmount: number
  actualAmount: number
  variance: number
  utilizationPct: number
  status: TrafficLight
  budgetId?: string
  notes?: string
}

export interface BudgetAlert {
  id: string
  storeId: string
  category: BudgetCategory
  period: string
  threshold: 80 | 100
  alertedAt: string
}

export type TrafficLight = 'green' | 'amber' | 'red'

// ── Pure utility functions (exported for unit tests) ──────────────────────────

/** Calculate budget utilization percentage (actual / budget * 100). */
export function calcBudgetUtilization(budget: number, actual: number): number {
  if (budget <= 0) return actual > 0 ? 100 : 0
  return (actual / budget) * 100
}

/** Calculate budget variance (actual - budget). Negative = under budget. */
export function calcBudgetVariance(budget: number, actual: number): number {
  return actual - budget
}

/** Classify utilization into traffic-light status. */
export function classifyTrafficLight(utilizationPct: number): TrafficLight {
  if (utilizationPct > 100) return 'red'
  if (utilizationPct >= 80) return 'amber'
  return 'green'
}

/** Returns true if threshold alert should fire. */
export function shouldAlert(
  utilizationPct: number,
  threshold: 80 | 100,
): boolean {
  return utilizationPct >= threshold
}

/** Parse YYYY-MM period string into { year, month }. */
export function parsePeriod(period: string): { year: number; month: number } {
  const [y, m] = period.split('-').map(Number)
  return { year: y, month: m }
}

/** Format a Date as YYYY-MM period string. */
export function formatPeriod(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Returns the previous period as a YYYY-MM string. */
export function prevPeriod(period: string): string {
  const { year, month } = parsePeriod(period)
  const d = new Date(year, month - 2, 1) // month-1 (0-indexed) then -1 more
  return formatPeriod(d)
}

/** Aggregate actuals by category from a flat array. */
export function aggregateByCategory(
  rows: Array<{ category: string; amount: number }>,
): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + row.amount
    return acc
  }, {})
}

/** Get traffic-light CSS bg class. */
export function trafficLightBg(status: TrafficLight): string {
  if (status === 'red') return 'bg-red-500'
  if (status === 'amber') return 'bg-amber-500'
  return 'bg-green-500'
}

/** Get traffic-light CSS text class. */
export function trafficLightText(status: TrafficLight): string {
  if (status === 'red') return 'text-red-600'
  if (status === 'amber') return 'text-amber-600'
  return 'text-green-600'
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BudgetClientProps {
  storeId: string
  currency: string
}

export function BudgetClient({ storeId, currency }: BudgetClientProps) {
  const now = new Date()
  const [period, setPeriod] = useState(formatPeriod(now))
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const queryClient = useQueryClient()

  // ── Fetch budget vs actual ───────────────────────────────────────────────
  const { data: bva = [], isLoading: loadingBva } = useQuery<BudgetVsActual[]>({
    queryKey: ['budget-vs-actual', storeId, period],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/budget-vs-actual?storeId=${storeId}&period=${period}`,
      )
      if (!res.ok) throw new Error('Failed to fetch budget vs actual')
      return res.json()
    },
    staleTime: 30_000,
  })

  // ── Fetch budget alerts ──────────────────────────────────────────────────
  const { data: alerts = [] } = useQuery<BudgetAlert[]>({
    queryKey: ['budget-alerts', storeId, period],
    queryFn: async () => {
      const res = await fetch(`/api/reports/budget-alerts?storeId=${storeId}&period=${period}`)
      if (!res.ok) throw new Error('Failed to fetch budget alerts')
      return res.json()
    },
    staleTime: 30_000,
  })

  // ── Save / update budget ─────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({
      category,
      amount,
      notes,
      existingId,
    }: {
      category: BudgetCategory
      amount: number
      notes?: string
      existingId?: string
    }) => {
      if (existingId) {
        const res = await fetch(`/api/budgets/${existingId}?storeId=${storeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budgetAmount: amount, notes }),
        })
        if (!res.ok) throw new Error('Failed to update budget')
        return res.json()
      } else {
        const res = await fetch(`/api/budgets?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, budgetAmount: amount, period, notes }),
        })
        if (!res.ok) throw new Error('Failed to create budget')
        return res.json()
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-vs-actual', storeId, period] })
      queryClient.invalidateQueries({ queryKey: ['budget-alerts', storeId, period] })
      setEditingCategory(null)
      setEditAmount('')
      setEditNotes('')
    },
  })

  // ── Copy last month ──────────────────────────────────────────────────────
  const copyLastMonthMutation = useMutation({
    mutationFn: async () => {
      const last = prevPeriod(period)
      const res = await fetch(
        `/api/reports/budget-vs-actual?storeId=${storeId}&period=${last}`,
      )
      if (!res.ok) throw new Error('Failed to fetch last month')
      const lastBva: BudgetVsActual[] = await res.json()

      // For each category that had a budget last month, create/update for current period
      await Promise.all(
        lastBva
          .filter((row) => row.budgetAmount > 0)
          .map((row) => {
            const existing = bva.find((b) => b.category === row.category)
            if (existing?.budgetId) {
              return fetch(`/api/budgets/${existing.budgetId}?storeId=${storeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ budgetAmount: row.budgetAmount, notes: row.notes }),
              })
            } else {
              return fetch(`/api/budgets?storeId=${storeId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  category: row.category,
                  budgetAmount: row.budgetAmount,
                  period,
                  notes: row.notes,
                }),
              })
            }
          }),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-vs-actual', storeId, period] })
      queryClient.invalidateQueries({ queryKey: ['budget-alerts', storeId, period] })
    },
  })

  const handleEdit = useCallback(
    (row: BudgetVsActual) => {
      setEditingCategory(row.category)
      setEditAmount(row.budgetAmount > 0 ? String(row.budgetAmount) : '')
      setEditNotes(row.notes ?? '')
    },
    [],
  )

  const handleSave = useCallback(
    (category: BudgetCategory) => {
      const amount = parseFloat(editAmount.replace(/[^0-9.]/g, ''))
      if (isNaN(amount) || amount < 0) return
      const row = bva.find((b) => b.category === category)
      saveMutation.mutate({
        category,
        amount,
        notes: editNotes,
        existingId: row?.budgetId,
      })
    },
    [editAmount, editNotes, bva, saveMutation],
  )

  // ── Chart data ───────────────────────────────────────────────────────────
  const chartData = BUDGET_CATEGORIES.map((cat) => {
    const row = bva.find((b) => b.category === cat)
    return {
      name: BUDGET_CATEGORY_LABELS[cat],
      Anggaran: row?.budgetAmount ?? 0,
      Aktual: row?.actualAmount ?? 0,
    }
  })

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalBudget = bva.reduce((s, r) => s + r.budgetAmount, 0)
  const totalActual = bva.reduce((s, r) => s + r.actualAmount, 0)
  const totalUtil = calcBudgetUtilization(totalBudget, totalActual)
  const totalStatus = classifyTrafficLight(totalUtil)

  // ── Period selector helpers ──────────────────────────────────────────────
  const periodOptions: string[] = []
  for (let i = -11; i <= 1; i++) {
    periodOptions.push(formatPeriod(new Date(now.getFullYear(), now.getMonth() + i, 1)))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Manajemen Anggaran</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pantau anggaran vs aktual per kategori
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {periodOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={() => copyLastMonthMutation.mutate()}
            disabled={copyLastMonthMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" />
            Salin Bulan Lalu
          </button>
        </div>
      </div>

      {/* Alerts banner */}
      {alerts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4">
          <div className="flex items-start gap-2">
            <Bell className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {alerts.length} peringatan anggaran aktif
              </p>
              <ul className="mt-1 space-y-0.5">
                {alerts.map((a) => (
                  <li key={a.id} className="text-xs text-amber-700 dark:text-amber-300">
                    {BUDGET_CATEGORY_LABELS[a.category]} telah mencapai {a.threshold}% anggaran
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Anggaran</p>
          <p className="mt-1 text-lg font-semibold">{formatCurrency(totalBudget, currency)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Aktual</p>
          <p className={`mt-1 text-lg font-semibold ${trafficLightText(totalStatus)}`}>
            {formatCurrency(totalActual, currency)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Utilisasi</p>
          <p className={`mt-1 text-lg font-semibold ${trafficLightText(totalStatus)}`}>
            {totalUtil.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Budget table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Anggaran per Kategori</h3>
        </div>
        {loadingBva ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Memuat data...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Kategori
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    Anggaran
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    Aktual
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    Selisih
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">
                    Utilisasi
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {BUDGET_CATEGORIES.map((cat) => {
                  const row = bva.find((b) => b.category === cat)
                  const budgetAmt = row?.budgetAmount ?? 0
                  const actualAmt = row?.actualAmount ?? 0
                  const util = calcBudgetUtilization(budgetAmt, actualAmt)
                  const variance = calcBudgetVariance(budgetAmt, actualAmt)
                  const status = classifyTrafficLight(util)
                  const isEditing = editingCategory === cat

                  return (
                    <tr key={cat} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        {BUDGET_CATEGORY_LABELS[cat]}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="w-32 rounded border border-input bg-background px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder="0"
                            autoFocus
                          />
                        ) : (
                          <span>{formatCurrency(budgetAmt, currency)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrency(actualAmt, currency)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          variance > 0
                            ? 'text-red-600'
                            : variance < 0
                              ? 'text-green-600'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {variance > 0 ? '+' : ''}
                        {formatCurrency(variance, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${trafficLightBg(status)}`}
                              style={{ width: `${Math.min(100, util)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium w-10 text-right ${trafficLightText(status)}`}>
                            {util.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {status === 'green' && (
                          <CheckCircle className="h-4 w-4 text-green-500 inline" />
                        )}
                        {status === 'amber' && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 inline" />
                        )}
                        {status === 'red' && (
                          <XCircle className="h-4 w-4 text-red-500 inline" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleSave(cat)}
                              disabled={saveMutation.isPending}
                              className="p-1 rounded hover:bg-green-100 text-green-600 disabled:opacity-50"
                              title="Simpan"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingCategory(null)
                                setEditAmount('')
                                setEditNotes('')
                              }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground"
                              title="Batal"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              handleEdit(
                                row ?? {
                                  category: cat,
                                  budgetAmount: 0,
                                  actualAmount: 0,
                                  variance: 0,
                                  utilizationPct: 0,
                                  status: 'green',
                                },
                              )
                            }
                            className="p-1 rounded hover:bg-muted text-muted-foreground"
                            title="Edit anggaran"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Variance bar chart */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium mb-4">Anggaran vs Aktual</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tickFormatter={(v: number) =>
                  v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1_000
                      ? `${(v / 1_000).toFixed(0)}K`
                      : String(v)
                }
                tick={{ fontSize: 11 }}
                width={56}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(value as number, currency),
                  name === 'Anggaran' ? 'Anggaran' : 'Aktual',
                ]}
              />
              <Legend />
              <Bar dataKey="Anggaran" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.7} />
              <Bar dataKey="Aktual" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
