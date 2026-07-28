'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { TrendingUp, TrendingDown, Copy, BarChart3 } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

type BudgetCategory =
  | 'REVENUE'
  | 'COGS'
  | 'OPERATING_EXPENSE'
  | 'MARKETING'
  | 'SALARY'
  | 'RENT'
  | 'UTILITIES'
  | 'OTHER_EXPENSE'

interface BudgetRow {
  id: string
  storeId: string
  year: number
  category: BudgetCategory
  month: number
  budgetAmount: number
  actualAmount: number
  notes: string
  createdAt: string
  updatedAt: string
}

interface VarianceRow {
  category: BudgetCategory
  month: number
  budgetAmount: number
  actualAmount: number
  variance: number
  variancePct: number
  favorable: boolean
}

interface VarianceSummary {
  rows: VarianceRow[]
  totalBudget: number
  totalActual: number
  totalVariance: number
  totalVariancePct: number
}

interface BudgetClientProps {
  storeId: string
  currency: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  REVENUE: 'Pendapatan',
  COGS: 'HPP',
  OPERATING_EXPENSE: 'Beban Operasional',
  MARKETING: 'Pemasaran',
  SALARY: 'Gaji',
  RENT: 'Sewa',
  UTILITIES: 'Utilitas',
  OTHER_EXPENSE: 'Beban Lainnya',
}

const ALL_CATEGORIES: BudgetCategory[] = [
  'REVENUE', 'COGS', 'OPERATING_EXPENSE', 'MARKETING',
  'SALARY', 'RENT', 'UTILITIES', 'OTHER_EXPENSE',
]

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

const NAV_TABS = [
  { label: 'Ringkasan', href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal', href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo', href: '/dashboard/accounting/trial-balance' },
  { label: 'Faktur Supplier', href: '/dashboard/accounting/supplier-invoices' },
  { label: 'Aset Tetap', href: '/dashboard/accounting/fixed-assets' },
  { label: 'Anggaran', href: '/dashboard/accounting/budget' },
]

// ── Sub-navigation ─────────────────────────────────────────────────────────────

function SubNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {NAV_TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={cn(
              'whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              active
                ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                : 'bg-[var(--bg-subtle)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-muted)]'
            )}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

// ── Variance badge ─────────────────────────────────────────────────────────────

function VarianceBadge({ variance, favorable }: { variance: number; favorable: boolean }) {
  const color = favorable
    ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : 'text-rose-600 bg-rose-50 border-rose-200'
  const Icon = favorable ? TrendingUp : TrendingDown
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border', color)}>
      <Icon className="h-3 w-3" />
      {favorable ? 'Favorable' : 'Unfavorable'}
    </span>
  )
}

// ── Budget table cell (inline editable) ───────────────────────────────────────

function BudgetCell({
  row,
  storeId,
  onSaved,
}: {
  row: BudgetRow | undefined
  storeId: string
  year: number
  category: BudgetCategory
  month: number
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  const save = useMutation({
    mutationFn: async (amount: number) => {
      if (row) {
        const res = await fetch(`/api/budgets/${row.id}?storeId=${storeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budgetAmount: amount }),
        })
        const data = await res.json() as any
        if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan')
        return data
      }
    },
    onSuccess: () => { onSaved(); setEditing(false) },
    onError: (e: Error) => toast.error(e.message),
  })

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { if (val !== '') save.mutate(Number(val)); else setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter' && val !== '') save.mutate(Number(val))
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-full px-2 py-1 text-xs border border-amber-400 rounded bg-[var(--bg-subtle)] text-[var(--text-1)] text-right"
      />
    )
  }

  return (
    <button
      onClick={() => { setVal(String(row?.budgetAmount ?? '')); setEditing(true) }}
      className="w-full text-right text-xs text-[var(--text-1)] hover:text-amber-600 transition-colors"
      title="Klik untuk edit"
    >
      {row ? row.budgetAmount.toLocaleString('id-ID') : <span className="text-[var(--text-3)]">—</span>}
    </button>
  )
}

// ── Chart ──────────────────────────────────────────────────────────────────────

function BudgetChart({
  rows,
  currency,
  category,
}: {
  rows: VarianceRow[]
  currency: string
  category: BudgetCategory
}) {
  const data = MONTH_LABELS.map((label, i) => {
    const month = i + 1
    const r = rows.find(x => x.category === category && x.month === month)
    return {
      name: label,
      Anggaran: r?.budgetAmount ?? 0,
      Aktual: r?.actualAmount ?? 0,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-2)' }}
          tickFormatter={v => v === 0 ? '0' : `${(v / 1_000_000).toFixed(1)}jt`}
        />
        <Tooltip
          formatter={(value: any) => [formatCurrency(value, currency), undefined]}
          contentStyle={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Anggaran" fill="#f59e0b" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Aktual" fill="#3b82f6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BudgetClient({ storeId, currency }: BudgetClientProps) {
  const qc = useQueryClient()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [tab, setTab] = useState<'plan' | 'variance' | 'chart'>('plan')
  const [chartCategory, setChartCategory] = useState<BudgetCategory>('REVENUE')

  // ── Fetch budget rows ──────────────────────────────────────────────────────
  const { data: budgetRows = [], isLoading: loadingBudget } = useQuery({
    queryKey: ['budgets', storeId, year],
    queryFn: async () => {
      const res = await fetch(`/api/budgets?storeId=${storeId}&year=${year}`)
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal memuat anggaran')
      return data as BudgetRow[]
    },
  })

  // ── Fetch variance ─────────────────────────────────────────────────────────
  const { data: variance, isLoading: loadingVariance } = useQuery({
    queryKey: ['budgets-variance', storeId, year],
    queryFn: async () => {
      const res = await fetch(`/api/budgets/variance?storeId=${storeId}&year=${year}`)
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal memuat variansi')
      return data as VarianceSummary
    },
    enabled: tab === 'variance' || tab === 'chart',
  })

  // ── Copy last year ─────────────────────────────────────────────────────────
  const copyLastYear = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/budgets?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyFromYear: year - 1, toYear: year }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal menyalin anggaran')
      return data as { copied: number }
    },
    onSuccess: (data) => {
      toast.success(`${data.copied} baris disalin dari tahun ${year - 1}`)
      qc.invalidateQueries({ queryKey: ['budgets', storeId, year] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Budget map for O(1) lookup ─────────────────────────────────────────────
  const budgetMap = useMemo(() => {
    const m = new Map<string, BudgetRow>()
    for (const r of budgetRows) {
      m.set(`${r.category}-${r.month}`, r)
    }
    return m
  }, [budgetRows])

  // ── YTD totals ─────────────────────────────────────────────────────────────
  const ytdBudget = useMemo(() => budgetRows.reduce((s, r) => s + r.budgetAmount, 0), [budgetRows])
  const ytdActual = useMemo(() => budgetRows.reduce((s, r) => s + r.actualAmount, 0), [budgetRows])
  const ytdVariance = ytdActual - ytdBudget

  // ── Inline save callback ───────────────────────────────────────────────────
  function handleSaved() {
    qc.invalidateQueries({ queryKey: ['budgets', storeId, year] })
    qc.invalidateQueries({ queryKey: ['budgets-variance', storeId, year] })
  }

  // ── Upsert a new row when cell edited on non-existing row ──────────────────
  const upsertRow = useMutation({
    mutationFn: async ({
      category,
      month,
      budgetAmount,
    }: {
      category: BudgetCategory
      month: number
      budgetAmount: number
    }) => {
      const res = await fetch(`/api/budgets?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, category, month, budgetAmount }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan')
      return data
    },
    onSuccess: handleSaved,
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full">
      {/* Sub-nav */}
      <SubNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">Anggaran Tahunan</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">
            Rencanakan & pantau anggaran per kategori setiap bulan
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Year picker */}
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)] text-sm"
          >
            {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Copy last year */}
          <button
            onClick={() => copyLastYear.mutate()}
            disabled={copyLastYear.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-2)] text-sm hover:bg-[var(--bg-muted)] transition-colors disabled:opacity-50"
            title={`Salin anggaran dari ${year - 1}`}
          >
            <Copy className="h-4 w-4" />
            Salin dari {year - 1}
          </button>
        </div>
      </div>

      {/* YTD summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Anggaran', value: ytdBudget, color: 'text-amber-600' },
          { label: 'Total Aktual', value: ytdActual, color: 'text-blue-600' },
          {
            label: 'Variansi YTD',
            value: ytdVariance,
            color: ytdVariance >= 0 ? 'text-emerald-600' : 'text-rose-600',
          },
        ].map(card => (
          <div
            key={card.label}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4"
          >
            <p className="text-xs text-[var(--text-3)] font-medium">{card.label}</p>
            <p className={cn('text-lg font-bold mt-1', card.color)}>
              {formatCurrency(card.value, currency)}
            </p>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {([
          { key: 'plan', label: 'Rencana Anggaran' },
          { key: 'variance', label: 'Analisis Variansi' },
          { key: 'chart', label: 'Grafik' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Plan tab ──────────────────────────────────────────────────────── */}
      {tab === 'plan' && (
        <div className="overflow-x-auto">
          {loadingBudget ? (
            <div className="text-center py-12 text-[var(--text-3)] text-sm">Memuat...</div>
          ) : (
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-[var(--text-2)] w-36">
                    Kategori
                  </th>
                  {MONTH_LABELS.map((m, i) => (
                    <th key={i} className="py-2 px-2 text-xs font-semibold text-[var(--text-2)] text-right">
                      {m}
                    </th>
                  ))}
                  <th className="py-2 px-3 text-xs font-semibold text-[var(--text-2)] text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {ALL_CATEGORIES.map(cat => {
                  const rowTotal = Array.from({ length: 12 }, (_, i) => i + 1)
                    .reduce((s, m) => s + (budgetMap.get(`${cat}-${m}`)?.budgetAmount ?? 0), 0)

                  return (
                    <tr
                      key={cat}
                      className="border-b border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors"
                    >
                      <td className="py-2 px-3 font-medium text-xs text-[var(--text-1)]">
                        {CATEGORY_LABELS[cat]}
                      </td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                        const existing = budgetMap.get(`${cat}-${month}`)
                        return (
                          <td key={month} className="py-1 px-2 min-w-[70px]">
                            {existing ? (
                              <BudgetCell
                                row={existing}
                                storeId={storeId}
                                year={year}
                                category={cat}
                                month={month}
                                onSaved={handleSaved}
                              />
                            ) : (
                              <button
                                onClick={() => upsertRow.mutate({ category: cat, month, budgetAmount: 0 })}
                                className="w-full text-right text-xs text-[var(--text-3)] hover:text-amber-500 transition-colors"
                                title="Klik untuk tambah"
                              >
                                +
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2 px-3 text-right text-xs font-semibold text-[var(--text-1)]">
                        {rowTotal.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Variance tab ──────────────────────────────────────────────────── */}
      {tab === 'variance' && (
        <div>
          {loadingVariance ? (
            <div className="text-center py-12 text-[var(--text-3)] text-sm">Memuat...</div>
          ) : !variance || variance.rows.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-3)] text-sm">
              Belum ada data anggaran untuk tahun {year}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-[var(--text-2)]">Kategori</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-[var(--text-2)]">Bulan</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-[var(--text-2)]">Anggaran</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-[var(--text-2)]">Aktual</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-[var(--text-2)]">Variansi</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-[var(--text-2)]">%</th>
                    <th className="py-2 px-3 text-xs font-semibold text-[var(--text-2)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {variance.rows.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors"
                    >
                      <td className="py-2 px-3 text-xs text-[var(--text-1)]">
                        {CATEGORY_LABELS[r.category]}
                      </td>
                      <td className="py-2 px-3 text-xs text-[var(--text-2)]">
                        {MONTH_LABELS[r.month - 1]}
                      </td>
                      <td className="py-2 px-3 text-right text-xs text-[var(--text-1)]">
                        {formatCurrency(r.budgetAmount, currency)}
                      </td>
                      <td className="py-2 px-3 text-right text-xs text-[var(--text-1)]">
                        {formatCurrency(r.actualAmount, currency)}
                      </td>
                      <td className={cn(
                        'py-2 px-3 text-right text-xs font-semibold',
                        r.favorable ? 'text-emerald-600' : 'text-rose-600'
                      )}>
                        {r.variance >= 0 ? '+' : ''}{formatCurrency(r.variance, currency)}
                      </td>
                      <td className={cn(
                        'py-2 px-3 text-right text-xs font-semibold',
                        r.favorable ? 'text-emerald-600' : 'text-rose-600'
                      )}>
                        {r.variancePct >= 0 ? '+' : ''}{r.variancePct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-3">
                        <VarianceBadge variance={r.variance} favorable={r.favorable} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--bg-subtle)]">
                    <td colSpan={2} className="py-2 px-3 text-xs font-bold text-[var(--text-1)]">Total</td>
                    <td className="py-2 px-3 text-right text-xs font-bold text-[var(--text-1)]">
                      {formatCurrency(variance.totalBudget, currency)}
                    </td>
                    <td className="py-2 px-3 text-right text-xs font-bold text-[var(--text-1)]">
                      {formatCurrency(variance.totalActual, currency)}
                    </td>
                    <td className={cn(
                      'py-2 px-3 text-right text-xs font-bold',
                      variance.totalVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    )}>
                      {variance.totalVariance >= 0 ? '+' : ''}{formatCurrency(variance.totalVariance, currency)}
                    </td>
                    <td className={cn(
                      'py-2 px-3 text-right text-xs font-bold',
                      variance.totalVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    )}>
                      {variance.totalVariancePct >= 0 ? '+' : ''}{variance.totalVariancePct.toFixed(1)}%
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Chart tab ──────────────────────────────────────────────────────── */}
      {tab === 'chart' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[var(--text-2)]" />
            <label className="text-sm font-semibold text-[var(--text-2)]">Kategori:</label>
            <select
              value={chartCategory}
              onChange={e => setChartCategory(e.target.value as BudgetCategory)}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)] text-sm"
            >
              {ALL_CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">
              {CATEGORY_LABELS[chartCategory]} — Anggaran vs Aktual {year}
            </h3>
            {loadingVariance ? (
              <div className="h-[220px] flex items-center justify-center text-[var(--text-3)] text-sm">
                Memuat...
              </div>
            ) : (
              <BudgetChart
                rows={variance?.rows ?? []}
                currency={currency}
                category={chartCategory}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
