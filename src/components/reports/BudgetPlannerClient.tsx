'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Edit2, Save, X } from 'lucide-react'

// Dynamic recharts imports
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), {
  ssr: false,
})

// ── Types ─────────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'OPERASIONAL',
  'GAJI',
  'SEWA',
  'UTILITAS',
  'BAHAN_BAKU',
  'LAINNYA',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface BudgetRow {
  id?: string
  storeId: string
  month: number
  year: number
  category: ExpenseCategory
  budgetAmount: number
  actualAmount?: number
}

export interface CashFlowProjection {
  month: string
  projectedIncome: number
  projectedExpenses: number
  projectedNet: number
}

// ── Pure utility functions (exported for unit tests) ─────────────────────────

/** Calculate budget variance (actual - budget). Negative = under budget. */
export function calcVariance(budget: number, actual: number): number {
  return actual - budget
}

/** Calculate utilization percentage (actual / budget * 100). */
export function calcUtilization(budget: number, actual: number): number {
  if (budget <= 0) return actual > 0 ? 100 : 0
  return (actual / budget) * 100
}

/** Returns true if actual exceeds budget */
export function isOverBudget(budget: number, actual: number): boolean {
  return actual > budget
}

/** Calculate 3-month average from an array of monthly values */
export function calcMonthlyAverage(values: number[]): number {
  if (values.length === 0) return 0
  const slice = values.slice(-3)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

/** Project cash flow for next N months */
export function projectCashFlow(
  avgRevenue: number,
  avgExpenses: number,
  months: number,
): CashFlowProjection[] {
  const now = new Date()
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1)
    const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
    return {
      month: label,
      projectedIncome: Math.max(0, avgRevenue),
      projectedExpenses: Math.max(0, avgExpenses),
      projectedNet: avgRevenue - avgExpenses,
    }
  })
}

/** Get utilization color class */
export function utilizationColor(pct: number): string {
  if (pct > 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-amber-500'
  return 'bg-green-500'
}

/** Get utilization text color class */
export function utilizationTextColor(pct: number): string {
  if (pct > 100) return 'text-red-600'
  if (pct >= 80) return 'text-amber-600'
  return 'text-green-600'
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  OPERASIONAL: 'Operasional',
  GAJI: 'Gaji',
  SEWA: 'Sewa',
  UTILITAS: 'Utilitas',
  BAHAN_BAKU: 'Bahan Baku',
  LAINNYA: 'Lainnya',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BudgetPlannerClientProps {
  storeId: string
  currency: string
}

export function BudgetPlannerClient({ storeId, currency }: BudgetPlannerClientProps) {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [editValue, setEditValue] = useState('')
  const queryClient = useQueryClient()

  // ── Fetch budgets ────────────────────────────────────────────────────────
  const { data: budgets = [], isLoading: loadingBudgets } = useQuery<BudgetRow[]>({
    queryKey: ['budgets', storeId, selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await fetch(
        `/api/budgets?storeId=${storeId}&month=${selectedMonth}&year=${selectedYear}`,
      )
      if (!res.ok) throw new Error('Failed to fetch budgets')
      return res.json()
    },
    staleTime: 30_000,
  })

  // ── Fetch cash flow ───────────────────────────────────────────────────────
  const { data: cashflow, isLoading: loadingCashflow } = useQuery<{
    projections: CashFlowProjection[]
    avgRevenue: number
    avgExpenses: number
  }>({
    queryKey: ['cashflow', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/cashflow?storeId=${storeId}&months=3`)
      if (!res.ok) throw new Error('Failed to fetch cashflow')
      return res.json()
    },
    staleTime: 60_000,
  })

  // ── Save / update budget ─────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({
      category,
      amount,
      existingId,
    }: {
      category: ExpenseCategory
      amount: number
      existingId?: string
    }) => {
      if (existingId) {
        const res = await fetch(`/api/budgets/${existingId}?storeId=${storeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budgetAmount: amount }),
        })
        if (!res.ok) throw new Error('Failed to update budget')
        return res.json()
      } else {
        const res = await fetch(`/api/budgets?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            budgetAmount: amount,
            month: selectedMonth,
            year: selectedYear,
          }),
        })
        if (!res.ok) throw new Error('Failed to create budget')
        return res.json()
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', storeId, selectedMonth, selectedYear] })
      setEditingCategory(null)
      setEditValue('')
    },
  })

  const handleEdit = useCallback((cat: ExpenseCategory, currentAmount: number) => {
    setEditingCategory(cat)
    setEditValue(String(currentAmount))
  }, [])

  const handleSave = useCallback(
    (cat: ExpenseCategory) => {
      const amount = parseFloat(editValue)
      if (isNaN(amount) || amount < 0) return
      const existing = budgets.find(b => b.category === cat)
      saveMutation.mutate({ category: cat, amount, existingId: existing?.id })
    },
    [editValue, budgets, saveMutation],
  )

  const handleCancel = useCallback(() => {
    setEditingCategory(null)
    setEditValue('')
  }, [])

  // Build lookup: category -> budget row
  const budgetMap = new Map<ExpenseCategory, BudgetRow>()
  for (const b of budgets) {
    budgetMap.set(b.category as ExpenseCategory, b)
  }

  const totalBudget = budgets.reduce((s, b) => s + b.budgetAmount, 0)
  const totalActual = budgets.reduce((s, b) => s + (b.actualAmount ?? 0), 0)

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ]
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Perencanaan Anggaran</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Atur anggaran bulanan dan pantau realisasi pengeluaran
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {monthNames.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {years.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Anggaran</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(totalBudget, currency)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Realisasi</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(totalActual, currency)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Selisih</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              totalActual > totalBudget ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {totalActual > totalBudget ? '+' : ''}
            {formatCurrency(calcVariance(totalBudget, totalActual), currency)}
          </p>
        </div>
      </div>

      {/* ── Budget vs Actual Table ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-foreground">Anggaran vs Realisasi</h2>
        </div>
        {loadingBudgets ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Memuat data...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kategori</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Anggaran</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Realisasi</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Selisih</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">%</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Utilisasi</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {EXPENSE_CATEGORIES.map(cat => {
                  const row = budgetMap.get(cat)
                  const budget = row?.budgetAmount ?? 0
                  const actual = row?.actualAmount ?? 0
                  const variance = calcVariance(budget, actual)
                  const utilPct = calcUtilization(budget, actual)
                  const over = isOverBudget(budget, actual)
                  const isEditing = editingCategory === cat

                  return (
                    <tr key={cat} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {over && budget > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                          ) : budget > 0 ? (
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          ) : null}
                          {CATEGORY_LABELS[cat]}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            className="w-32 rounded border border-input bg-background px-2 py-1 text-right text-sm"
                            autoFocus
                          />
                        ) : (
                          formatCurrency(budget, currency)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(actual, currency)}</td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          variance > 0 ? 'text-red-600' : variance < 0 ? 'text-green-600' : ''
                        }`}
                      >
                        {variance > 0 ? '+' : ''}
                        {formatCurrency(variance, currency)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${utilizationTextColor(utilPct)}`}>
                        {budget > 0 ? `${utilPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {budget > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden min-w-[80px]">
                              <div
                                className={`h-full rounded-full transition-all ${utilizationColor(utilPct)}`}
                                style={{ width: `${Math.min(100, utilPct)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Belum diatur</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleSave(cat)}
                              disabled={saveMutation.isPending}
                              className="rounded p-1 hover:bg-green-100 text-green-600 disabled:opacity-50"
                              title="Simpan"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button
                              onClick={handleCancel}
                              className="rounded p-1 hover:bg-muted text-muted-foreground"
                              title="Batal"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEdit(cat, budget)}
                            className="rounded p-1 hover:bg-muted text-muted-foreground"
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
              <tfoot>
                <tr className="bg-muted/30 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalBudget, currency)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalActual, currency)}</td>
                  <td
                    className={`px-4 py-3 text-right ${
                      totalActual > totalBudget ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {calcVariance(totalBudget, totalActual) > 0 ? '+' : ''}
                    {formatCurrency(calcVariance(totalBudget, totalActual), currency)}
                  </td>
                  <td className={`px-4 py-3 text-right ${utilizationTextColor(calcUtilization(totalBudget, totalActual))}`}>
                    {totalBudget > 0 ? `${calcUtilization(totalBudget, totalActual).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {totalBudget > 0 && (
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${utilizationColor(calcUtilization(totalBudget, totalActual))}`}
                          style={{ width: `${Math.min(100, calcUtilization(totalBudget, totalActual))}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Arus Kas / Cash Flow Forecast ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Proyeksi Arus Kas (3 Bulan)</h2>
        </div>
        {loadingCashflow ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Memuat proyeksi...
          </div>
        ) : cashflow ? (
          <div className="p-4 space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Rata-rata Pendapatan/Bulan</p>
                <p className="mt-1 text-lg font-semibold text-green-600">
                  {formatCurrency(cashflow.avgRevenue, currency)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Rata-rata Pengeluaran/Bulan</p>
                <p className="mt-1 text-lg font-semibold text-red-600">
                  {formatCurrency(cashflow.avgExpenses, currency)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Proyeksi Arus Kas Bersih</p>
                <p
                  className={`mt-1 text-lg font-semibold ${
                    cashflow.avgRevenue - cashflow.avgExpenses >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {cashflow.avgRevenue - cashflow.avgExpenses >= 0 ? (
                    <TrendingUp className="inline h-4 w-4 mr-1" />
                  ) : (
                    <TrendingDown className="inline h-4 w-4 mr-1" />
                  )}
                  {formatCurrency(cashflow.avgRevenue - cashflow.avgExpenses, currency)}
                </p>
              </div>
            </div>

            {/* Bar chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cashflow.projections}
                  margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                >
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
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
                      name === 'projectedIncome' ? 'Pendapatan' : 'Pengeluaran',
                    ]}
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === 'projectedIncome' ? 'Pendapatan' : 'Pengeluaran'
                    }
                  />
                  <Bar dataKey="projectedIncome" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="projectedExpenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly breakdown table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left text-muted-foreground font-medium">Bulan</th>
                    <th className="py-2 text-right text-muted-foreground font-medium">Proyeksi Pendapatan</th>
                    <th className="py-2 text-right text-muted-foreground font-medium">Proyeksi Pengeluaran</th>
                    <th className="py-2 text-right text-muted-foreground font-medium">Arus Kas Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflow.projections.map((p, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2 font-medium">{p.month}</td>
                      <td className="py-2 text-right text-green-600">
                        {formatCurrency(p.projectedIncome, currency)}
                      </td>
                      <td className="py-2 text-right text-red-600">
                        {formatCurrency(p.projectedExpenses, currency)}
                      </td>
                      <td
                        className={`py-2 text-right font-semibold ${
                          p.projectedNet >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {p.projectedNet >= 0 ? '+' : ''}
                        {formatCurrency(p.projectedNet, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Tidak ada data proyeksi tersedia
          </div>
        )}
      </div>
    </div>
  )
}
