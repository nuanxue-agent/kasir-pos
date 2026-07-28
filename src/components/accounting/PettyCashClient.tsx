'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Wallet, TrendingDown, AlertTriangle, X, Loader2, CheckCircle, Clock, XCircle } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  aggregateAdvancesByCategory,
  findUnsettledAdvances,
  totalUnsettledAmount,
  isValidAdvanceTransition,
  calcReplenishAmount,
} from '@/lib/petty-cash'
import type { AdvanceTransaction, AdvanceStatus, AdvanceTransactionType } from '@/lib/petty-cash'

// ── Re-export pure functions so tests can import from this module ──────────────
export {
  calcBalanceAfterTx,
  isValidAdvanceTransition,
  calcReplenishAmount,
  aggregateAdvancesByCategory,
  findUnsettledAdvances,
  totalUnsettledAmount,
} from '@/lib/petty-cash'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PettyCashFund {
  id: string
  storeId: string
  name: string
  balance: number
  replenishAmount: number
  custodian: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface PettyCashTx {
  id: string
  fundId: string
  storeId: string
  type: AdvanceTransactionType
  amount: number
  balance: number
  description: string
  category: string
  receiptNo: string
  requestedBy: string
  approvedBy: string
  status: AdvanceStatus
  createdAt: string
}

interface PettyCashClientProps {
  storeId: string
  currency: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  'ATK', 'Transportasi', 'Konsumsi', 'Kebersihan',
  'Utilitas', 'Pemeliharaan', 'Lain-lain',
]

const STATUS_LABEL: Record<AdvanceStatus, string> = {
  PENDING:  'Menunggu',
  APPROVED: 'Disetujui',
  SETTLED:  'Selesai',
  REJECTED: 'Ditolak',
}

const STATUS_COLOR: Record<AdvanceStatus, string> = {
  PENDING:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  SETTLED:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

function StatusBadge({ status }: { status: AdvanceStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLOR[status])}>
      {status === 'PENDING'  && <Clock size={10} />}
      {status === 'APPROVED' && <CheckCircle size={10} />}
      {status === 'SETTLED'  && <CheckCircle size={10} />}
      {status === 'REJECTED' && <XCircle size={10} />}
      {STATUS_LABEL[status]}
    </span>
  )
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]'
const cancelBtnCls =
  'rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:border-[var(--primary)]/50'
const submitBtnCls =
  'flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-3)]">{label}</label>
      {children}
    </div>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-semibold text-[var(--text-1)]">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-2)] text-[var(--text-3)]">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Transaction row ────────────────────────────────────────────────────────────

function TxRow({
  tx,
  currency,
  onAction,
}: {
  tx: PettyCashTx
  currency: string
  onAction: (txId: string, status: AdvanceStatus, receiptNo?: string) => void
}) {
  const isAdvance = tx.type === 'ADVANCE'
  return (
    <tr className="border-t border-[var(--border)] hover:bg-[var(--bg-2)]/50 text-sm">
      <td className="px-4 py-3 text-[var(--text-3)] whitespace-nowrap">
        {new Date(tx.createdAt).toLocaleDateString('id-ID')}
      </td>
      <td className="px-4 py-3">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
          tx.type === 'REPLENISH'  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
          tx.type === 'ADVANCE'    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
          tx.type === 'SETTLEMENT' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                                     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
        )}>
          {tx.type === 'REPLENISH' ? 'Pengisian' : tx.type === 'EXPENSE' ? 'Pengeluaran' : tx.type === 'ADVANCE' ? 'Uang Muka' : 'Penyelesaian'}
        </span>
      </td>
      <td className="px-4 py-3 text-[var(--text-1)]">{tx.description}</td>
      <td className="px-4 py-3 text-[var(--text-3)]">{tx.category}</td>
      <td className={cn('px-4 py-3 font-medium tabular-nums text-right',
        tx.type === 'REPLENISH' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      )}>
        {tx.type === 'REPLENISH' ? '+' : '-'}{formatCurrency(tx.amount, currency)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-2)]">
        {formatCurrency(tx.balance, currency)}
      </td>
      <td className="px-4 py-3">
        {isAdvance ? <StatusBadge status={tx.status} /> : null}
      </td>
      <td className="px-4 py-3">
        {isAdvance && tx.status === 'PENDING' && (
          <div className="flex gap-1">
            <button
              onClick={() => onAction(tx.id, 'APPROVED')}
              className="rounded px-2 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300"
            >
              Setujui
            </button>
            <button
              onClick={() => onAction(tx.id, 'REJECTED')}
              className="rounded px-2 py-1 text-xs bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
            >
              Tolak
            </button>
          </div>
        )}
        {isAdvance && tx.status === 'APPROVED' && (
          <button
            onClick={() => onAction(tx.id, 'SETTLED')}
            className="rounded px-2 py-1 text-xs bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300"
          >
            Selesaikan
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PettyCashClient({ storeId, currency }: PettyCashClientProps) {
  const qc = useQueryClient()

  // Fund selection
  const [activeFundId, setActiveFundId] = useState<string | null>(null)

  // Modal states
  const [showNewFund, setShowNewFund]       = useState(false)
  const [showExpense, setShowExpense]       = useState(false)
  const [showAdvance, setShowAdvance]       = useState(false)
  const [showReplenish, setShowReplenish]   = useState(false)

  // New fund form
  const [fundName, setFundName]             = useState('')
  const [fundCustodian, setFundCustodian]   = useState('')
  const [fundReplenish, setFundReplenish]   = useState('1000000')
  const [fundBalance, setFundBalance]       = useState('0')

  // Expense form
  const [expAmount, setExpAmount]           = useState('')
  const [expDesc, setExpDesc]               = useState('')
  const [expCategory, setExpCategory]       = useState('ATK')
  const [expReceipt, setExpReceipt]         = useState('')

  // Advance form
  const [advAmount, setAdvAmount]           = useState('')
  const [advDesc, setAdvDesc]               = useState('')
  const [advCategory, setAdvCategory]       = useState('Transportasi')
  const [advRequester, setAdvRequester]     = useState('')

  // Replenish form
  const [repAmount, setRepAmount]           = useState('')
  const [repDesc, setRepDesc]               = useState('')

  // ── Queries ──────────────────────────────────────────────────────────────────

  const fundsQ = useQuery({
    queryKey: ['petty-cash-funds', storeId],
    queryFn: async () => {
      const r = await fetch(`/api/petty-cash-funds?storeId=${storeId}`)
      const d = await r.json() as any
      if (!r.ok) throw new Error(d.error)
      return d as PettyCashFund[]
    },
  })

  const funds = fundsQ.data ?? []
  const activeFund = funds.find(f => f.id === activeFundId) ?? funds[0] ?? null

  const txsQ = useQuery({
    queryKey: ['petty-cash-txs', activeFund?.id],
    enabled: !!activeFund?.id,
    queryFn: async () => {
      const r = await fetch(`/api/petty-cash-funds/${activeFund!.id}/transactions?storeId=${storeId}`)
      const d = await r.json() as any
      if (!r.ok) throw new Error(d.error)
      return d as PettyCashTx[]
    },
  })

  const txs = txsQ.data ?? []
  const unsettled = findUnsettledAdvances(txs as any)
  const unsettledTotal = totalUnsettledAmount(txs as any)
  const needed = activeFund ? calcReplenishAmount(activeFund.balance, activeFund.replenishAmount) : 0

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createFund = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/petty-cash-funds?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fundName, custodian: fundCustodian, replenishAmount: Number(fundReplenish), balance: Number(fundBalance) }),
      })
      const d = await r.json() as any
      if (!r.ok) throw new Error(d.error)
      return d
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['petty-cash-funds', storeId] })
      setActiveFundId(d.id)
      setShowNewFund(false)
      setFundName(''); setFundCustodian(''); setFundReplenish('1000000'); setFundBalance('0')
      toast.success('Dana kas kecil dibuat')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const postTx = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch(`/api/petty-cash-funds/${activeFund!.id}/transactions?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json() as any
      if (!r.ok) throw new Error(d.error)
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['petty-cash-txs', activeFund?.id] })
      qc.invalidateQueries({ queryKey: ['petty-cash-funds', storeId] })
      setShowExpense(false); setShowAdvance(false); setShowReplenish(false)
      setExpAmount(''); setExpDesc(''); setExpReceipt('')
      setAdvAmount(''); setAdvDesc(''); setAdvRequester('')
      setRepAmount(''); setRepDesc('')
      toast.success('Transaksi disimpan')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const patchTx = useMutation({
    mutationFn: async ({ txId, status, receiptNo }: { txId: string; status: AdvanceStatus; receiptNo?: string }) => {
      const r = await fetch(`/api/petty-cash-funds/${activeFund!.id}/transactions/${txId}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, receiptNo }),
      })
      const d = await r.json() as any
      if (!r.ok) throw new Error(d.error)
      return d
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['petty-cash-txs', activeFund?.id] })
      qc.invalidateQueries({ queryKey: ['petty-cash-funds', storeId] })
      const label = vars.status === 'APPROVED' ? 'Disetujui' : vars.status === 'SETTLED' ? 'Diselesaikan' : 'Ditolak'
      toast.success(`Uang muka ${label}`)
    },
    onError: (e: any) => toast.error(e.message),
  })

  function handleTxAction(txId: string, status: AdvanceStatus, receiptNo?: string) {
    patchTx.mutate({ txId, status, receiptNo })
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Kas Kecil</h1>
          <p className="text-sm text-[var(--text-3)]">Pengelolaan dana kas kecil dan uang muka</p>
        </div>
        <button
          onClick={() => setShowNewFund(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} /> Dana Baru
        </button>
      </div>

      {/* Fund selector */}
      {funds.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {funds.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFundId(f.id)}
              className={cn(
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                activeFund?.id === f.id
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--primary)]/50',
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats cards */}
      {activeFund && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center gap-3 mb-2">
              <Wallet size={18} className="text-[var(--primary)]" />
              <span className="text-sm text-[var(--text-3)]">Saldo</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-1)]">{formatCurrency(activeFund.balance, currency)}</p>
            <p className="mt-1 text-xs text-[var(--text-3)]">Pemegang: {activeFund.custodian}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center gap-3 mb-2">
              <TrendingDown size={18} className="text-orange-500" />
              <span className="text-sm text-[var(--text-3)]">Perlu Pengisian</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-1)]">{formatCurrency(needed, currency)}</p>
            <p className="mt-1 text-xs text-[var(--text-3)]">Target: {formatCurrency(activeFund.replenishAmount, currency)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={18} className={unsettled.length > 0 ? 'text-yellow-500' : 'text-[var(--text-3)]'} />
              <span className="text-sm text-[var(--text-3)]">Uang Muka Aktif</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-1)]">{unsettled.length}</p>
            {unsettled.length > 0 && (
              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">{formatCurrency(unsettledTotal, currency)} belum selesai</p>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {activeFund && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowExpense(true)} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:border-[var(--primary)]/50">
            <TrendingDown size={15} /> Catat Pengeluaran
          </button>
          <button onClick={() => setShowAdvance(true)} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:border-[var(--primary)]/50">
            <Wallet size={15} /> Ajukan Uang Muka
          </button>
          <button onClick={() => setShowReplenish(true)} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:border-[var(--primary)]/50">
            <RefreshCw size={15} /> Isi Kas
          </button>
        </div>
      )}

      {/* Transactions table */}
      {activeFund && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h2 className="font-semibold text-[var(--text-1)]">Riwayat Transaksi</h2>
          </div>
          {txsQ.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[var(--text-3)]" size={24} /></div>
          ) : txs.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--text-3)]">Belum ada transaksi</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[var(--bg-2)] text-xs text-[var(--text-3)]">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Jenis</th>
                    <th className="px-4 py-3">Keterangan</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3 text-right">Jumlah</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map(tx => (
                    <TxRow key={tx.id} tx={tx} currency={currency} onAction={handleTxAction} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!fundsQ.isLoading && funds.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <Wallet size={40} className="mx-auto mb-3 text-[var(--text-3)]" />
          <p className="font-medium text-[var(--text-1)]">Belum ada dana kas kecil</p>
          <p className="mt-1 text-sm text-[var(--text-3)]">Buat dana baru untuk mulai mencatat pengeluaran</p>
          <button onClick={() => setShowNewFund(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            <Plus size={16} /> Buat Dana
          </button>
        </div>
      )}

      {/* New Fund Modal */}
      {showNewFund && (
        <Modal title="Dana Kas Kecil Baru" onClose={() => setShowNewFund(false)}>
          <div className="space-y-4">
            <Field label="Nama Dana *"><input className={inputCls} value={fundName} onChange={e => setFundName(e.target.value)} placeholder="Kas Kecil Operasional" /></Field>
            <Field label="Pemegang Kas *"><input className={inputCls} value={fundCustodian} onChange={e => setFundCustodian(e.target.value)} placeholder="Nama pemegang kas" /></Field>
            <Field label="Target Pengisian (Rp)"><input className={inputCls} type="number" min="0" value={fundReplenish} onChange={e => setFundReplenish(e.target.value)} /></Field>
            <Field label="Saldo Awal (Rp)"><input className={inputCls} type="number" min="0" value={fundBalance} onChange={e => setFundBalance(e.target.value)} /></Field>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowNewFund(false)} className={cancelBtnCls}>Batal</button>
              <button disabled={!fundName || !fundCustodian || createFund.isPending} onClick={() => createFund.mutate()} className={submitBtnCls}>
                {createFund.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Simpan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Expense Modal */}
      {showExpense && activeFund && (
        <Modal title="Catat Pengeluaran" onClose={() => setShowExpense(false)}>
          <div className="space-y-4">
            <Field label="Jumlah *"><input className={inputCls} type="number" min="1" value={expAmount} onChange={e => setExpAmount(e.target.value)} /></Field>
            <Field label="Kategori">
              <select className={inputCls} value={expCategory} onChange={e => setExpCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Keterangan *"><input className={inputCls} value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Deskripsi pengeluaran" /></Field>
            <Field label="No. Kwitansi"><input className={inputCls} value={expReceipt} onChange={e => setExpReceipt(e.target.value)} placeholder="Opsional" /></Field>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowExpense(false)} className={cancelBtnCls}>Batal</button>
              <button disabled={!expAmount || !expDesc || postTx.isPending} onClick={() => postTx.mutate({ type: 'EXPENSE', amount: Number(expAmount), description: expDesc, category: expCategory, receiptNo: expReceipt })} className={submitBtnCls}>
                {postTx.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Simpan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Advance Modal */}
      {showAdvance && activeFund && (
        <Modal title="Ajukan Uang Muka" onClose={() => setShowAdvance(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--bg-2)] px-4 py-3 text-sm text-[var(--text-3)]">
              Uang muka perlu disetujui sebelum saldo dikurangi. Setelah digunakan, selesaikan dengan melampirkan kwitansi.
            </div>
            <Field label="Jumlah *"><input className={inputCls} type="number" min="1" value={advAmount} onChange={e => setAdvAmount(e.target.value)} /></Field>
            <Field label="Kategori">
              <select className={inputCls} value={advCategory} onChange={e => setAdvCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Keperluan *"><input className={inputCls} value={advDesc} onChange={e => setAdvDesc(e.target.value)} placeholder="Tujuan penggunaan uang muka" /></Field>
            <Field label="Diminta Oleh *"><input className={inputCls} value={advRequester} onChange={e => setAdvRequester(e.target.value)} placeholder="Nama pemohon" /></Field>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowAdvance(false)} className={cancelBtnCls}>Batal</button>
              <button disabled={!advAmount || !advDesc || !advRequester || postTx.isPending} onClick={() => postTx.mutate({ type: 'ADVANCE', amount: Number(advAmount), description: advDesc, category: advCategory, requestedBy: advRequester })} className={submitBtnCls}>
                {postTx.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Ajukan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Replenish Modal */}
      {showReplenish && activeFund && (
        <Modal title="Pengisian Kas Kecil" onClose={() => setShowReplenish(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--bg-2)] px-4 py-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-[var(--text-3)]">Saldo saat ini</p>
                <p className="font-bold text-[var(--text-1)]">{formatCurrency(activeFund.balance, currency)}</p>
              </div>
              <div>
                <p className="text-[var(--text-3)]">Perlu diisi</p>
                <p className="font-bold text-[var(--text-1)]">{formatCurrency(needed, currency)}</p>
              </div>
            </div>
            <Field label="Jumlah Pengisian *"><input className={inputCls} type="number" min="1" value={repAmount} onChange={e => setRepAmount(e.target.value)} placeholder={String(needed)} /></Field>
            <Field label="Keterangan"><input className={inputCls} value={repDesc} onChange={e => setRepDesc(e.target.value)} /></Field>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowReplenish(false)} className={cancelBtnCls}>Batal</button>
              <button disabled={!repAmount || postTx.isPending} onClick={() => postTx.mutate({ type: 'REPLENISH', amount: Number(repAmount), description: repDesc || 'Pengisian kas kecil', category: 'Pengisian' })} className={submitBtnCls}>
                {postTx.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Isi Kas'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
