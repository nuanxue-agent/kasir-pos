'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { TrendingUp, TrendingDown, Plus, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type PLCategory = 'REVENUE' | 'COGS' | 'OPEX' | 'OTHER_INCOME' | 'OTHER_EXPENSE'

interface PLAccount {
  id: string
  storeId: string
  code: string
  name: string
  category: PLCategory
  parentId: string | null
  active: number
  createdAt: string
}

interface PLAccountLine {
  accountId: string
  code: string
  name: string
  category: PLCategory
  parentId: string | null
  actual: number
  budget: number
  priorYear: number
}

interface PLSection {
  category: PLCategory
  label: string
  accounts: PLAccountLine[]
  total: number
  budgetTotal: number
  priorYearTotal: number
}

interface PLStatementResult {
  period: string
  budgetPeriod: string
  priorYearPeriod: string
  revenue: PLSection
  cogs: PLSection
  grossProfit: number
  grossProfitBudget: number
  grossProfitPriorYear: number
  grossMarginPct: number
  opex: PLSection
  ebitda: number
  ebitdaBudget: number
  ebitdaPriorYear: number
  otherIncome: PLSection
  otherExpense: PLSection
  netProfit: number
  netProfitBudget: number
  netProfitPriorYear: number
  netMarginPct: number
}

interface PLStatementClientProps {
  storeId: string
  currency: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_TABS = [
  { label: 'Ringkasan', href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal', href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo', href: '/dashboard/accounting/trial-balance' },
  { label: 'Faktur Supplier', href: '/dashboard/accounting/supplier-invoices' },
  { label: 'Aset Tetap', href: '/dashboard/accounting/fixed-assets' },
  { label: 'Faktur B2B', href: '/dashboard/accounting/invoices' },
  { label: 'Aging Report', href: '/dashboard/accounting/aging-report' },
  { label: 'Laba Rugi', href: '/dashboard/accounting/pl-statement' },
]

const CATEGORY_LABELS: Record<PLCategory, string> = {
  REVENUE: 'Pendapatan',
  COGS: 'Harga Pokok Penjualan',
  OPEX: 'Beban Operasional',
  OTHER_INCOME: 'Pendapatan Lainnya',
  OTHER_EXPENSE: 'Beban Lainnya',
}

const ALL_CATEGORIES: PLCategory[] = ['REVENUE', 'COGS', 'OPEX', 'OTHER_INCOME', 'OTHER_EXPENSE']

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

function nowPeriod(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function periodLabel(period: string): string {
  const [y, m] = period.split('-')
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
              'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-amber-500 text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]'
            )}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

interface SectionRowsProps {
  section: PLSection
  currency: string
  expanded: boolean
  onToggle: () => void
  isExpense?: boolean
}

function SectionRows({ section, currency, expanded, onToggle, isExpense = false }: SectionRowsProps) {
  const variantColor = (actual: number, budget: number) => {
    if (budget === 0) return ''
    const diff = actual - budget
    if (isExpense) return diff > 0 ? 'text-rose-600' : 'text-emerald-600'
    return diff >= 0 ? 'text-emerald-600' : 'text-rose-600'
  }

  return (
    <>
      {/* Section header row */}
      <tr
        className="border-b border-[var(--border)] bg-[var(--bg-subtle)] cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 px-3">
          <div className="flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-3)]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[var(--text-3)]" />
            )}
            <span className="text-xs font-semibold text-[var(--text-1)]">{section.label}</span>
          </div>
        </td>
        <td className="py-2 px-3 text-right text-xs font-semibold text-[var(--text-1)]">
          {formatCurrency(section.total, currency)}
        </td>
        <td className={cn('py-2 px-3 text-right text-xs font-semibold', variantColor(section.total, section.budgetTotal))}>
          {formatCurrency(section.budgetTotal, currency)}
        </td>
        <td className="py-2 px-3 text-right text-xs font-semibold text-[var(--text-2)]">
          {formatCurrency(section.priorYearTotal, currency)}
        </td>
      </tr>
      {/* Account detail rows */}
      {expanded && section.accounts.map(acc => (
        <tr
          key={acc.accountId}
          className="border-b border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <td className="py-1.5 px-3 pl-8">
            <span className="text-xs text-[var(--text-2)]">
              <span className="font-mono text-[var(--text-3)] mr-2">{acc.code}</span>
              {acc.name}
            </span>
          </td>
          <td className="py-1.5 px-3 text-right text-xs text-[var(--text-1)]">
            {formatCurrency(acc.actual, currency)}
          </td>
          <td className={cn('py-1.5 px-3 text-right text-xs', variantColor(acc.actual, acc.budget))}>
            {formatCurrency(acc.budget, currency)}
          </td>
          <td className="py-1.5 px-3 text-right text-xs text-[var(--text-2)]">
            {formatCurrency(acc.priorYear, currency)}
          </td>
        </tr>
      ))}
    </>
  )
}

interface SubtotalRowProps {
  label: string
  actual: number
  budget: number
  priorYear: number
  currency: string
  highlight?: boolean
}

function SubtotalRow({ label, actual, budget, priorYear, currency, highlight }: SubtotalRowProps) {
  return (
    <tr className={cn(
      'border-b-2 border-[var(--border)]',
      highlight ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-[var(--bg-subtle)]'
    )}>
      <td className={cn(
        'py-2.5 px-3 text-xs font-bold',
        highlight ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--text-1)]'
      )}>
        {label}
      </td>
      <td className={cn(
        'py-2.5 px-3 text-right text-xs font-bold',
        highlight ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--text-1)]',
        actual < 0 && 'text-rose-600'
      )}>
        {formatCurrency(actual, currency)}
      </td>
      <td className={cn(
        'py-2.5 px-3 text-right text-xs font-semibold',
        actual < 0 ? 'text-rose-600' : 'text-[var(--text-2)]'
      )}>
        {formatCurrency(budget, currency)}
      </td>
      <td className="py-2.5 px-3 text-right text-xs text-[var(--text-2)] font-semibold">
        {formatCurrency(priorYear, currency)}
      </td>
    </tr>
  )
}

// ── Add Account Modal ─────────────────────────────────────────────────────────

interface AddAccountModalProps {
  storeId: string
  onClose: () => void
  onSaved: () => void
}

function AddAccountModal({ storeId, onClose, onSaved }: AddAccountModalProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<PLCategory>('REVENUE')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!code.trim() || !name.trim()) {
      toast.error('Kode dan nama akun wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/pl-accounts?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), name: name.trim(), category }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan'); return }
      toast.success('Akun berhasil ditambahkan')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-sm font-bold text-[var(--text-1)] mb-4">Tambah Akun P&L</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Kode Akun</label>
            <input
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="mis. 4001"
              value={code}
              onChange={e => setCode(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Nama Akun</label>
            <input
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="mis. Penjualan Produk"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Kategori</label>
            <select
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={category}
              onChange={e => setCategory(e.target.value as PLCategory)}
            >
              {ALL_CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors font-semibold"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PLStatementClient({ storeId, currency }: PLStatementClientProps) {
  const [period, setPeriod] = useState(nowPeriod())
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    REVENUE: true, COGS: true, OPEX: false, OTHER_INCOME: false, OTHER_EXPENSE: false,
  })
  const qc = useQueryClient()

  const { data: statement, isLoading, refetch } = useQuery<PLStatementResult>({
    queryKey: ['pl-statement', storeId, period],
    queryFn: async () => {
      const res = await fetch(`/api/pl-statement?storeId=${storeId}&period=${period}`)
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      return data as PLStatementResult
    },
    enabled: !!storeId,
  })

  function toggleSection(cat: string) {
    setExpandedSections(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  const isProfit = (statement?.netProfit ?? 0) >= 0

  return (
    <div className="space-y-4">
      <SubNav />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-1)]">Laporan Laba Rugi</h1>
          <p className="text-xs text-[var(--text-3)] mt-0.5">
            Profit & Loss Statement — {periodLabel(period)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)] transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowAddAccount(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Akun
          </button>
        </div>
      </div>

      {/* ── Summary KPI cards ──────────────────────────────────────────────── */}
      {statement && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Pendapatan', value: statement.revenue.total, sub: null },
            { label: 'Laba Kotor', value: statement.grossProfit, sub: `${statement.grossMarginPct.toFixed(1)}% margin` },
            { label: 'EBITDA', value: statement.ebitda, sub: null },
            { label: 'Laba Bersih', value: statement.netProfit, sub: `${statement.netMarginPct.toFixed(1)}% net margin` },
          ].map(kpi => (
            <div
              key={kpi.label}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4"
            >
              <p className="text-xs text-[var(--text-3)] mb-1">{kpi.label}</p>
              <p className={cn(
                'text-base font-bold',
                kpi.value >= 0 ? 'text-[var(--text-1)]' : 'text-rose-600'
              )}>
                {formatCurrency(kpi.value, currency)}
              </p>
              {kpi.sub && (
                <p className="text-xs text-[var(--text-3)] mt-0.5">{kpi.sub}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── P&L table ──────────────────────────────────────────────────────── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-[var(--text-3)] text-sm">Memuat laporan...</div>
        ) : !statement ? (
          <div className="text-center py-16 text-[var(--text-3)] text-sm">
            Belum ada data untuk periode ini. Tambahkan akun P&L terlebih dahulu.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--text-2)] w-1/2">
                    Akun
                  </th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold text-[var(--text-2)]">
                    {periodLabel(period)}
                  </th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold text-[var(--text-2)]">
                    Anggaran
                  </th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold text-[var(--text-2)]">
                    {periodLabel(statement.priorYearPeriod)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Revenue */}
                <SectionRows
                  section={statement.revenue}
                  currency={currency}
                  expanded={!!expandedSections.REVENUE}
                  onToggle={() => toggleSection('REVENUE')}
                />

                {/* COGS */}
                <SectionRows
                  section={statement.cogs}
                  currency={currency}
                  expanded={!!expandedSections.COGS}
                  onToggle={() => toggleSection('COGS')}
                  isExpense
                />

                {/* Gross Profit */}
                <SubtotalRow
                  label="Laba Kotor"
                  actual={statement.grossProfit}
                  budget={statement.grossProfitBudget}
                  priorYear={statement.grossProfitPriorYear}
                  currency={currency}
                />

                {/* OPEX */}
                <SectionRows
                  section={statement.opex}
                  currency={currency}
                  expanded={!!expandedSections.OPEX}
                  onToggle={() => toggleSection('OPEX')}
                  isExpense
                />

                {/* EBITDA */}
                <SubtotalRow
                  label="EBITDA"
                  actual={statement.ebitda}
                  budget={statement.ebitdaBudget}
                  priorYear={statement.ebitdaPriorYear}
                  currency={currency}
                />

                {/* Other Income */}
                <SectionRows
                  section={statement.otherIncome}
                  currency={currency}
                  expanded={!!expandedSections.OTHER_INCOME}
                  onToggle={() => toggleSection('OTHER_INCOME')}
                />

                {/* Other Expense */}
                <SectionRows
                  section={statement.otherExpense}
                  currency={currency}
                  expanded={!!expandedSections.OTHER_EXPENSE}
                  onToggle={() => toggleSection('OTHER_EXPENSE')}
                  isExpense
                />

                {/* Net Profit */}
                <SubtotalRow
                  label="Laba Bersih"
                  actual={statement.netProfit}
                  budget={statement.netProfitBudget}
                  priorYear={statement.netProfitPriorYear}
                  currency={currency}
                  highlight
                />
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Net profit indicator */}
      {statement && (
        <div className={cn(
          'flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold',
          isProfit
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400'
            : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-400'
        )}>
          {isProfit
            ? <TrendingUp className="h-4 w-4" />
            : <TrendingDown className="h-4 w-4" />
          }
          {isProfit ? 'Laba' : 'Rugi'} {periodLabel(period)}: {formatCurrency(Math.abs(statement.netProfit), currency)}
          <span className="ml-auto text-xs font-normal opacity-70">
            Net margin {statement.netMarginPct.toFixed(1)}%
          </span>
        </div>
      )}

      {showAddAccount && (
        <AddAccountModal
          storeId={storeId}
          onClose={() => setShowAddAccount(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['pl-statement'] })}
        />
      )}
    </div>
  )
}
