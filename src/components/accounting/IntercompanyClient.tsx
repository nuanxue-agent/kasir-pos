'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { ArrowLeftRight, Building2, CheckCircle, Clock, RefreshCw, TrendingDown } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

interface IntercompanyClientProps {
  storeId: string
  currency: string
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type TxType = 'SALE' | 'LOAN' | 'EXPENSE_SHARE' | 'DIVIDEND'
export type TxStatus = 'PENDING' | 'CONFIRMED' | 'SETTLED'

export interface IntercompanyTransaction {
  id: string
  fromStoreId: string
  toStoreId: string
  type: TxType
  amount: number
  description: string | null
  status: TxStatus
  transactionDate: string
  settledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface EliminationEntry {
  fromStoreId: string
  toStoreId: string
  type: string
  grossAmount: number
  eliminatedAmount: number
  netAmount: number
}

export interface ConsolidationReport {
  storeIds: string[]
  totalRevenue: number
  totalEliminations: number
  consolidatedRevenue: number
  eliminationEntries: EliminationEntry[]
  netPositionByStore: Record<string, number>
  generatedAt: string
}

// ── Nav ────────────────────────────────────────────────────────────────────────

const NAV_TABS = [
  { label: 'Ringkasan',        href: '/dashboard/accounting' },
  { label: 'Chart of Accounts',href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal',           href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo',     href: '/dashboard/accounting/trial-balance' },
  { label: 'Faktur Supplier',  href: '/dashboard/accounting/supplier-invoices' },
  { label: 'Aset Tetap',       href: '/dashboard/accounting/fixed-assets' },
  { label: 'Faktur B2B',       href: '/dashboard/accounting/invoices' },
  { label: 'Aging Report',     href: '/dashboard/accounting/aging-report' },
  { label: 'Intercompany',     href: '/dashboard/accounting/intercompany' },
]

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
              'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-card)] hover:text-[var(--text-1)]',
            )}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TxType, string> = {
  SALE: 'Penjualan',
  LOAN: 'Pinjaman',
  EXPENSE_SHARE: 'Bagi Biaya',
  DIVIDEND: 'Dividen',
}

const STATUS_COLOR: Record<TxStatus, string> = {
  PENDING:   'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  SETTLED:   'bg-emerald-100 text-emerald-700',
}

// ── Add Transaction Modal ──────────────────────────────────────────────────────

interface AddTxModalProps {
  storeId: string
  onClose: () => void
  onSaved: () => void
}

function AddTxModal({ storeId, onClose, onSaved }: AddTxModalProps) {
  const [form, setForm] = useState({
    toStoreId: '',
    type: 'SALE' as TxType,
    amount: '',
    description: '',
    transactionDate: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.toStoreId.trim()) { toast.error('ID toko tujuan wajib diisi'); return }
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) { toast.error('Jumlah harus lebih dari 0'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/intercompany', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromStoreId: storeId, toStoreId: form.toStoreId.trim(), type: form.type, amount, description: form.description || null, transactionDate: form.transactionDate }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan'); return }
      toast.success('Transaksi intercompany ditambahkan')
      onSaved()
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-[var(--text-1)] mb-4">Tambah Transaksi Intercompany</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">ID Toko Tujuan</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] text-sm"
              value={form.toStoreId}
              onChange={e => setForm(f => ({ ...f, toStoreId: e.target.value }))}
              placeholder="store_id_tujuan"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">Jenis</label>
            <select
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] text-sm"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as TxType }))}
            >
              {(Object.keys(TYPE_LABELS) as TxType[]).map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">Jumlah</label>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] text-sm"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">Tanggal</label>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] text-sm"
              value={form.transactionDate}
              onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">Deskripsi</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] text-sm"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Opsional"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg)]">Batal</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium disabled:opacity-60">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Transaction Table ──────────────────────────────────────────────────────────

function TransactionTable({
  transactions,
  storeId,
  currency,
  onAction,
}: {
  transactions: IntercompanyTransaction[]
  storeId: string
  currency: string
  onAction: (id: string, action: 'confirm' | 'settle') => void
}) {
  if (!transactions.length) {
    return (
      <div className="text-center py-12 text-[var(--text-2)] text-sm">
        Belum ada transaksi intercompany
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--text-2)] text-xs">
            <th className="text-left py-2 px-3">Tanggal</th>
            <th className="text-left py-2 px-3">Dari</th>
            <th className="text-left py-2 px-3">Ke</th>
            <th className="text-left py-2 px-3">Jenis</th>
            <th className="text-right py-2 px-3">Jumlah</th>
            <th className="text-left py-2 px-3">Status</th>
            <th className="text-left py-2 px-3">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => (
            <tr key={tx.id} className="border-b border-[var(--border)] hover:bg-[var(--bg)] transition-colors">
              <td className="py-2 px-3 text-[var(--text-1)]">{tx.transactionDate}</td>
              <td className="py-2 px-3 text-[var(--text-2)] font-mono text-xs">{tx.fromStoreId === storeId ? <span className="text-[var(--primary)] font-medium">Toko ini</span> : tx.fromStoreId}</td>
              <td className="py-2 px-3 text-[var(--text-2)] font-mono text-xs">{tx.toStoreId === storeId ? <span className="text-[var(--primary)] font-medium">Toko ini</span> : tx.toStoreId}</td>
              <td className="py-2 px-3">
                <span className="px-2 py-0.5 rounded-full bg-[var(--bg)] text-[var(--text-2)] text-xs border border-[var(--border)]">
                  {TYPE_LABELS[tx.type]}
                </span>
              </td>
              <td className="py-2 px-3 text-right font-medium text-[var(--text-1)]">{formatCurrency(tx.amount, currency)}</td>
              <td className="py-2 px-3">
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[tx.status])}>
                  {tx.status}
                </span>
              </td>
              <td className="py-2 px-3">
                {tx.status === 'PENDING' && tx.fromStoreId === storeId && (
                  <button onClick={() => onAction(tx.id, 'confirm')} className="text-xs text-blue-600 hover:underline">Konfirmasi</button>
                )}
                {tx.status === 'CONFIRMED' && (
                  <button onClick={() => onAction(tx.id, 'settle')} className="text-xs text-emerald-600 hover:underline">Selesaikan</button>
                )}
                {tx.status === 'SETTLED' && <span className="text-xs text-[var(--text-2)]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Consolidation Panel ────────────────────────────────────────────────────────

function ConsolidationPanel({ storeId, currency }: { storeId: string; currency: string }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['intercompany-consolidation', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intercompany/consolidation?storeId=${storeId}`)
      return res.json() as Promise<ConsolidationReport>
    },
  })

  if (isLoading) {
    return <div className="text-center py-8 text-[var(--text-2)] text-sm">Memuat laporan konsolidasi…</div>
  }

  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-1)]">Laporan Konsolidasi</h3>
        <button onClick={() => refetch()} className="text-xs text-[var(--text-2)] hover:text-[var(--text-1)] flex items-center gap-1">
          <RefreshCw size={12} /> Perbarui
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--text-2)] mb-1">Total Bruto</p>
          <p className="text-xl font-bold text-[var(--text-1)]">{formatCurrency(data.totalRevenue, currency)}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-red-500 mb-1 flex items-center gap-1"><TrendingDown size={12} /> Eliminasi</p>
          <p className="text-xl font-bold text-red-600">-{formatCurrency(data.totalEliminations, currency)}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 border-[var(--primary)]">
          <p className="text-xs text-[var(--primary)] mb-1">Konsolidasi Bersih</p>
          <p className="text-xl font-bold text-[var(--primary)]">{formatCurrency(data.consolidatedRevenue, currency)}</p>
        </div>
      </div>

      {Object.keys(data.netPositionByStore).length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <h4 className="text-xs font-semibold text-[var(--text-2)] mb-3 uppercase tracking-wide">Posisi Bersih per Toko</h4>
          <div className="space-y-2">
            {Object.entries(data.netPositionByStore).map(([sid, net]) => (
              <div key={sid} className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-2)] font-mono text-xs">{sid === storeId ? `${sid} (toko ini)` : sid}</span>
                <span className={cn('font-medium', net >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {net >= 0 ? '+' : ''}{formatCurrency(net, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.eliminationEntries.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <h4 className="text-xs font-semibold text-[var(--text-2)] mb-3 uppercase tracking-wide">Entri Eliminasi</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-2)] border-b border-[var(--border)]">
                  <th className="text-left py-1 px-2">Dari</th>
                  <th className="text-left py-1 px-2">Ke</th>
                  <th className="text-left py-1 px-2">Jenis</th>
                  <th className="text-right py-1 px-2">Bruto</th>
                  <th className="text-right py-1 px-2">Dieliminasi</th>
                  <th className="text-right py-1 px-2">Bersih</th>
                </tr>
              </thead>
              <tbody>
                {data.eliminationEntries.map((e, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    <td className="py-1 px-2 font-mono">{e.fromStoreId}</td>
                    <td className="py-1 px-2 font-mono">{e.toStoreId}</td>
                    <td className="py-1 px-2">{e.type}</td>
                    <td className="py-1 px-2 text-right">{formatCurrency(e.grossAmount, currency)}</td>
                    <td className="py-1 px-2 text-right text-red-500">-{formatCurrency(e.eliminatedAmount, currency)}</td>
                    <td className="py-1 px-2 text-right font-medium">{formatCurrency(e.netAmount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Summary Cards ──────────────────────────────────────────────────────────────

function SummaryCards({ transactions, currency }: { transactions: IntercompanyTransaction[]; currency: string }) {
  const pending   = transactions.filter(t => t.status === 'PENDING').reduce((s, t) => s + t.amount, 0)
  const confirmed = transactions.filter(t => t.status === 'CONFIRMED').reduce((s, t) => s + t.amount, 0)
  const settled   = transactions.filter(t => t.status === 'SETTLED').reduce((s, t) => s + t.amount, 0)

  const cards = [
    { label: 'Pending', value: pending,   icon: Clock,       color: 'text-yellow-600' },
    { label: 'Dikonfirmasi', value: confirmed, icon: CheckCircle, color: 'text-blue-600' },
    { label: 'Selesai', value: settled,   icon: Building2,   color: 'text-emerald-600' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
          <c.icon size={20} className={c.color} />
          <div>
            <p className="text-xs text-[var(--text-2)]">{c.label}</p>
            <p className="text-lg font-bold text-[var(--text-1)]">{formatCurrency(c.value, currency)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function IntercompanyClient({ storeId, currency }: IntercompanyClientProps) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [activeTab, setActiveTab] = useState<'transactions' | 'consolidation'>('transactions')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['intercompany', storeId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/intercompany?${params}`)
      return res.json() as Promise<{ transactions: IntercompanyTransaction[]; total: number }>
    },
  })

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'confirm' | 'settle' }) => {
      const res = await fetch(`/api/intercompany/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json() as any
      if (!res.ok) throw new Error(d.error ?? 'Gagal')
      return d
    },
    onSuccess: (_, { action }) => {
      toast.success(action === 'confirm' ? 'Transaksi dikonfirmasi' : 'Transaksi diselesaikan')
      qc.invalidateQueries({ queryKey: ['intercompany', storeId] })
      qc.invalidateQueries({ queryKey: ['intercompany-consolidation', storeId] })
    },
    onError: (e: any) => toast.error(e.message ?? 'Terjadi kesalahan'),
  })

  const transactions = data?.transactions ?? []

  return (
    <div className="space-y-4 p-4 md:p-6">
      <SubNav />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={20} className="text-[var(--primary)]" />
          <h1 className="text-xl font-bold text-[var(--text-1)]">Transaksi Intercompany</h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Tambah Transaksi
        </button>
      </div>

      <SummaryCards transactions={transactions} currency={currency} />

      <div className="flex gap-2 border-b border-[var(--border)]">
        {(['transactions', 'consolidation'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {tab === 'transactions' ? 'Daftar Transaksi' : 'Konsolidasi'}
          </button>
        ))}
      </div>

      {activeTab === 'transactions' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] text-sm"
            >
              <option value="">Semua Status</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Dikonfirmasi</option>
              <option value="SETTLED">Selesai</option>
            </select>
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-card)] transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-[var(--text-2)] text-sm">Memuat…</div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
              <TransactionTable
                transactions={transactions}
                storeId={storeId}
                currency={currency}
                onAction={(id, action) => actionMutation.mutate({ id, action })}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'consolidation' && (
        <ConsolidationPanel storeId={storeId} currency={currency} />
      )}

      {showAdd && (
        <AddTxModal
          storeId={storeId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            qc.invalidateQueries({ queryKey: ['intercompany', storeId] })
            qc.invalidateQueries({ queryKey: ['intercompany-consolidation', storeId] })
          }}
        />
      )}
    </div>
  )
}
