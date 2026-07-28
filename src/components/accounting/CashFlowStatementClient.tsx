'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { TrendingUp, TrendingDown, Plus, RefreshCw, ChevronDown, ChevronRight, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type CashFlowCategory = 'OPERATING' | 'INVESTING' | 'FINANCING'
type CashFlowType = 'INFLOW' | 'OUTFLOW'

interface CashFlowEntryRow {
  id: string
  description: string
  amount: number
  reference: string | null
}

interface CashFlowSection {
  category: CashFlowCategory
  label: string
  inflows: CashFlowEntryRow[]
  outflows: CashFlowEntryRow[]
  totalInflow: number
  totalOutflow: number
  net: number
}

interface CashFlowStatementResult {
  period: string
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  netCashChange: number
  openingBalance: number
  closingBalance: number
}

interface CashFlowStatementClientProps {
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
  { label: 'Arus Kas', href: '/dashboard/accounting/cash-flow-statement' },
]

const CATEGORY_LABELS: Record<CashFlowCategory, string> = {
  OPERATING: 'Aktivitas Operasi',
  INVESTING: 'Aktivitas Investasi',
  FINANCING: 'Aktivitas Pendanaan',
}

const ALL_CATEGORIES: CashFlowCategory[] = ['OPERATING', 'INVESTING', 'FINANCING']

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

function nowPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

interface SectionBlockProps {
  section: CashFlowSection
  currency: string
  expanded: boolean
  onToggle: () => void
}

function SectionBlock({ section, currency, expanded, onToggle }: SectionBlockProps) {
  const isPositive = section.net >= 0

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Section header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-subtle)] hover:bg-[var(--bg-card)] transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-[var(--text-3)]" />
            : <ChevronRight className="h-4 w-4 text-[var(--text-3)]" />
          }
          <span className="text-sm font-semibold text-[var(--text-1)]">{section.label}</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-[var(--text-3)]">
            Masuk: <span className="text-emerald-600 font-medium">{formatCurrency(section.totalInflow, currency)}</span>
          </span>
          <span className="text-[var(--text-3)]">
            Keluar: <span className="text-rose-600 font-medium">{formatCurrency(section.totalOutflow, currency)}</span>
          </span>
          <span className={cn(
            'font-bold',
            isPositive ? 'text-emerald-600' : 'text-rose-600'
          )}>
            Net: {formatCurrency(section.net, currency)}
          </span>
        </div>
      </button>

      {/* Entry rows */}
      {expanded && (
        <div className="divide-y divide-[var(--border)]">
          {/* Inflows */}
          {section.inflows.length > 0 && (
            <>
              <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/10">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <ArrowUpCircle className="h-3.5 w-3.5" /> Penerimaan Kas
                </span>
              </div>
              {section.inflows.map(e => (
                <div key={e.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors">
                  <div className="flex flex-col">
                    <span className="text-xs text-[var(--text-1)]">{e.description}</span>
                    {e.reference && (
                      <span className="text-xs text-[var(--text-3)] font-mono">{e.reference}</span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-emerald-600">{formatCurrency(e.amount, currency)}</span>
                </div>
              ))}
            </>
          )}

          {/* Outflows */}
          {section.outflows.length > 0 && (
            <>
              <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/10">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                  <ArrowDownCircle className="h-3.5 w-3.5" /> Pengeluaran Kas
                </span>
              </div>
              {section.outflows.map(e => (
                <div key={e.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors">
                  <div className="flex flex-col">
                    <span className="text-xs text-[var(--text-1)]">{e.description}</span>
                    {e.reference && (
                      <span className="text-xs text-[var(--text-3)] font-mono">{e.reference}</span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-rose-600">({formatCurrency(e.amount, currency)})</span>
                </div>
              ))}
            </>
          )}

          {section.inflows.length === 0 && section.outflows.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-[var(--text-3)]">
              Belum ada transaksi untuk kategori ini
            </div>
          )}

          {/* Net subtotal */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-subtle)]">
            <span className="text-xs font-bold text-[var(--text-1)]">Net {section.label}</span>
            <span className={cn('text-xs font-bold', isPositive ? 'text-emerald-600' : 'text-rose-600')}>
              {formatCurrency(section.net, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Entry Modal ───────────────────────────────────────────────────────────

interface AddEntryModalProps {
  storeId: string
  period: string
  onClose: () => void
  onSaved: () => void
}

function AddEntryModal({ storeId, period, onClose, onSaved }: AddEntryModalProps) {
  const [category, setCategory] = useState<CashFlowCategory>('OPERATING')
  const [type, setType] = useState<CashFlowType>('INFLOW')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!description.trim()) { toast.error('Deskripsi wajib diisi'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt < 0) { toast.error('Jumlah tidak valid'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/cash-flow-entries?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, type, description: description.trim(), amount: amt, period, reference: reference.trim() || null }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan'); return }
      toast.success('Entri berhasil ditambahkan')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-sm font-bold text-[var(--text-1)] mb-4">Tambah Entri Arus Kas</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Kategori</label>
              <select
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={category}
                onChange={e => setCategory(e.target.value as CashFlowCategory)}
              >
                {ALL_CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Jenis</label>
              <select
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={type}
                onChange={e => setType(e.target.value as CashFlowType)}
              >
                <option value="INFLOW">Penerimaan</option>
                <option value="OUTFLOW">Pengeluaran</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Deskripsi</label>
            <input
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="mis. Penerimaan dari pelanggan"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Jumlah (IDR)</label>
            <input
              type="number"
              min="0"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] mb-1 block">Referensi (opsional)</label>
            <input
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="mis. INV-2025-001"
              value={reference}
              onChange={e => setReference(e.target.value)}
            />
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

export default function CashFlowStatementClient({ storeId, currency }: CashFlowStatementClientProps) {
  const [period, setPeriod] = useState(nowPeriod())
  const [openingBalance, setOpeningBalance] = useState('0')
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [expanded, setExpanded] = useState<Record<CashFlowCategory, boolean>>({
    OPERATING: true,
    INVESTING: true,
    FINANCING: true,
  })
  const qc = useQueryClient()

  const { data: statement, isLoading, refetch } = useQuery<CashFlowStatementResult>({
    queryKey: ['cash-flow-statement', storeId, period, openingBalance],
    queryFn: async () => {
      const res = await fetch(
        `/api/cash-flow-statement?storeId=${storeId}&period=${period}&openingBalance=${openingBalance}`
      )
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      return data as CashFlowStatementResult
    },
    enabled: !!storeId,
  })

  function toggleSection(cat: CashFlowCategory) {
    setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  const netPositive = (statement?.netCashChange ?? 0) >= 0

  return (
    <div className="space-y-4">
      <SubNav />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-1)]">Laporan Arus Kas</h1>
          <p className="text-xs text-[var(--text-3)] mt-0.5">
            Cash Flow Statement — {periodLabel(period)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[var(--text-2)] whitespace-nowrap">Saldo Awal</label>
            <input
              type="number"
              value={openingBalance}
              onChange={e => setOpeningBalance(e.target.value)}
              className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--bg-subtle)] text-[var(--text-1)] w-36 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
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
            onClick={() => setShowAddEntry(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Entri
          </button>
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────────── */}
      {statement && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Arus Kas Operasi', value: statement.operating.net },
            { label: 'Arus Kas Investasi', value: statement.investing.net },
            { label: 'Arus Kas Pendanaan', value: statement.financing.net },
            { label: 'Perubahan Kas Bersih', value: statement.netCashChange },
          ].map(kpi => (
            <div
              key={kpi.label}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4"
            >
              <p className="text-xs text-[var(--text-3)] mb-1">{kpi.label}</p>
              <p className={cn(
                'text-base font-bold',
                kpi.value >= 0 ? 'text-emerald-600' : 'text-rose-600'
              )}>
                {formatCurrency(kpi.value, currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Opening balance ─────────────────────────────────────────────────── */}
      {statement && (
        <div className="flex items-center justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3">
          <span className="text-xs font-semibold text-[var(--text-2)]">Saldo Kas Awal Periode</span>
          <span className="text-sm font-bold text-[var(--text-1)]">
            {formatCurrency(statement.openingBalance, currency)}
          </span>
        </div>
      )}

      {/* ── Sections ────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="text-center py-16 text-[var(--text-3)] text-sm">Memuat laporan...</div>
      ) : statement ? (
        <div className="space-y-3">
          {ALL_CATEGORIES.map(cat => (
            <SectionBlock
              key={cat}
              section={statement[cat.toLowerCase() as 'operating' | 'investing' | 'financing']}
              currency={currency}
              expanded={expanded[cat]}
              onToggle={() => toggleSection(cat)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-[var(--text-3)] text-sm">
          Belum ada data arus kas untuk periode ini.
        </div>
      )}

      {/* ── Closing balance ─────────────────────────────────────────────────── */}
      {statement && (
        <>
          <div className="flex items-center justify-between bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-4 py-3">
            <span className="text-xs font-semibold text-[var(--text-2)]">Total Perubahan Kas Bersih</span>
            <span className={cn('text-sm font-bold', netPositive ? 'text-emerald-600' : 'text-rose-600')}>
              {formatCurrency(statement.netCashChange, currency)}
            </span>
          </div>
          <div className={cn(
            'flex items-center justify-between rounded-xl px-4 py-3 border',
            netPositive
              ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
              : 'bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800'
          )}>
            <div className="flex items-center gap-2">
              {netPositive
                ? <TrendingUp className="h-4 w-4 text-emerald-600" />
                : <TrendingDown className="h-4 w-4 text-rose-600" />
              }
              <span className={cn(
                'text-sm font-bold',
                netPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
              )}>
                Saldo Kas Akhir Periode
              </span>
            </div>
            <span className={cn(
              'text-sm font-bold',
              netPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
            )}>
              {formatCurrency(statement.closingBalance, currency)}
            </span>
          </div>
        </>
      )}

      {showAddEntry && (
        <AddEntryModal
          storeId={storeId}
          period={period}
          onClose={() => setShowAddEntry(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['cash-flow-statement'] })}
        />
      )}
    </div>
  )
}
