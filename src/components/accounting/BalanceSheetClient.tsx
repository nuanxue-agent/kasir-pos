'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { Scale, Plus, RefreshCw, ChevronDown, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type BSCategory =
  | 'CURRENT_ASSET'
  | 'FIXED_ASSET'
  | 'CURRENT_LIABILITY'
  | 'LONG_TERM_LIABILITY'
  | 'EQUITY'

interface BSAccountLine {
  accountId: string
  code: string
  name: string
  category: BSCategory
  parentId: string | null
  amount: number
}

interface BSSection {
  category: BSCategory
  label: string
  accounts: BSAccountLine[]
  total: number
}

interface BalanceSheetResult {
  period: string
  currentAssets: BSSection
  fixedAssets: BSSection
  totalAssets: number
  currentLiabilities: BSSection
  longTermLiabilities: BSSection
  totalLiabilities: number
  equity: BSSection
  totalEquity: number
  totalLiabilitiesAndEquity: number
  balanced: boolean
}

interface BalanceSheetClientProps {
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
  { label: 'Neraca', href: '/dashboard/accounting/balance-sheet' },
]

const CATEGORY_LABELS: Record<BSCategory, string> = {
  CURRENT_ASSET: 'Aset Lancar',
  FIXED_ASSET: 'Aset Tetap',
  CURRENT_LIABILITY: 'Liabilitas Jangka Pendek',
  LONG_TERM_LIABILITY: 'Liabilitas Jangka Panjang',
  EQUITY: 'Ekuitas',
}

const ALL_CATEGORIES: BSCategory[] = [
  'CURRENT_ASSET',
  'FIXED_ASSET',
  'CURRENT_LIABILITY',
  'LONG_TERM_LIABILITY',
  'EQUITY',
]

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
  section: BSSection
  currency: string
  expanded: boolean
  onToggle: () => void
}

function SectionRows({ section, currency, expanded, onToggle }: SectionRowsProps) {
  return (
    <>
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
      </tr>
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
            {formatCurrency(acc.amount, currency)}
          </td>
        </tr>
      ))}
    </>
  )
}

interface TotalRowProps {
  label: string
  amount: number
  currency: string
  highlight?: boolean
}

function TotalRow({ label, amount, currency, highlight }: TotalRowProps) {
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
        highlight ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--text-1)]'
      )}>
        {formatCurrency(amount, currency)}
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
  const [category, setCategory] = useState<BSCategory>('CURRENT_ASSET')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!code.trim() || !name.trim()) {
      toast.error('Kode dan nama akun wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/bs-accounts?storeId=${storeId}`, {
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
        <h3 className="text-sm font-bold text-[var(--text-1)] mb-4">Tambah Akun Neraca</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Kode Akun</label>
            <input
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="mis. 1001"
              value={code}
              onChange={e => setCode(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Nama Akun</label>
            <input
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="mis. Kas dan Setara Kas"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Kategori</label>
            <select
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={category}
              onChange={e => setCategory(e.target.value as BSCategory)}
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

export default function BalanceSheetClient({ storeId, currency }: BalanceSheetClientProps) {
  const [period, setPeriod] = useState(nowPeriod())
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    CURRENT_ASSET: true,
    FIXED_ASSET: true,
    CURRENT_LIABILITY: true,
    LONG_TERM_LIABILITY: false,
    EQUITY: true,
  })
  const qc = useQueryClient()

  const { data: sheet, isLoading, refetch } = useQuery<BalanceSheetResult>({
    queryKey: ['balance-sheet', storeId, period],
    queryFn: async () => {
      const res = await fetch(`/api/balance-sheet?storeId=${storeId}&period=${period}`)
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      return data as BalanceSheetResult
    },
    enabled: !!storeId,
  })

  function toggleSection(cat: string) {
    setExpandedSections(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <div className="space-y-4">
      <SubNav />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-1)]">Neraca</h1>
          <p className="text-xs text-[var(--text-3)] mt-0.5">
            Balance Sheet — {periodLabel(period)}
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

      {/* ── Balance equation badge ──────────────────────────────────────────── */}
      {sheet && (
        <div className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-medium',
          sheet.balanced
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400'
            : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-400'
        )}>
          {sheet.balanced ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {sheet.balanced
            ? `Neraca seimbang — Aset = Liabilitas + Ekuitas (${formatCurrency(sheet.totalAssets, currency)})`
            : `Neraca tidak seimbang — Aset: ${formatCurrency(sheet.totalAssets, currency)} vs L+E: ${formatCurrency(sheet.totalLiabilitiesAndEquity, currency)}`
          }
        </div>
      )}

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      {sheet && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: 'Total Aset', value: sheet.totalAssets },
            { label: 'Total Liabilitas', value: sheet.totalLiabilities },
            { label: 'Total Ekuitas', value: sheet.totalEquity },
          ].map(kpi => (
            <div
              key={kpi.label}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4"
            >
              <p className="text-xs text-[var(--text-3)] mb-1">{kpi.label}</p>
              <p className="text-base font-bold text-[var(--text-1)]">
                {formatCurrency(kpi.value, currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Balance sheet table ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
          <div className="text-center py-16 text-[var(--text-3)] text-sm">Memuat neraca...</div>
        </div>
      ) : !sheet ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
          <div className="text-center py-16 text-[var(--text-3)] text-sm">
            Belum ada data untuk periode ini. Tambahkan akun neraca terlebih dahulu.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── ASSETS ── */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
              <h2 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wide">Aset</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-[var(--text-2)] w-2/3">Akun</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-[var(--text-2)]">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  <SectionRows
                    section={sheet.currentAssets}
                    currency={currency}
                    expanded={!!expandedSections.CURRENT_ASSET}
                    onToggle={() => toggleSection('CURRENT_ASSET')}
                  />
                  <SectionRows
                    section={sheet.fixedAssets}
                    currency={currency}
                    expanded={!!expandedSections.FIXED_ASSET}
                    onToggle={() => toggleSection('FIXED_ASSET')}
                  />
                  <TotalRow
                    label="Total Aset"
                    amount={sheet.totalAssets}
                    currency={currency}
                    highlight
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* ── LIABILITIES + EQUITY ── */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
              <h2 className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wide">Liabilitas & Ekuitas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-[var(--text-2)] w-2/3">Akun</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-[var(--text-2)]">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  <SectionRows
                    section={sheet.currentLiabilities}
                    currency={currency}
                    expanded={!!expandedSections.CURRENT_LIABILITY}
                    onToggle={() => toggleSection('CURRENT_LIABILITY')}
                  />
                  <SectionRows
                    section={sheet.longTermLiabilities}
                    currency={currency}
                    expanded={!!expandedSections.LONG_TERM_LIABILITY}
                    onToggle={() => toggleSection('LONG_TERM_LIABILITY')}
                  />
                  <TotalRow
                    label="Total Liabilitas"
                    amount={sheet.totalLiabilities}
                    currency={currency}
                  />
                  <SectionRows
                    section={sheet.equity}
                    currency={currency}
                    expanded={!!expandedSections.EQUITY}
                    onToggle={() => toggleSection('EQUITY')}
                  />
                  <TotalRow
                    label="Total Liabilitas & Ekuitas"
                    amount={sheet.totalLiabilitiesAndEquity}
                    currency={currency}
                    highlight
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showAddAccount && (
        <AddAccountModal
          storeId={storeId}
          onClose={() => setShowAddAccount(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['balance-sheet', storeId] })}
        />
      )}
    </div>
  )
}
