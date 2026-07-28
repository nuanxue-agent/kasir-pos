'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Wallet, TrendingDown, AlertTriangle, X, Loader2 } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  aggregateByCategory,
  filterByMonth,
  totalExpenses,
  totalReplenishments,
  calcReplenishmentNeeded,
  isBelowLowBalanceThreshold,
} from '@/lib/petty-cash'

// ── Re-export pure functions so unit tests can import from this module ────────
export {
  calcBalanceAfterExpense,
  calcBalanceAfterReplenishment,
  calcReplenishmentNeeded,
  wouldExceedBalance,
  wouldExceedMax,
  isBelowLowBalanceThreshold,
  aggregateByCategory,
  filterByMonth,
  totalExpenses,
  totalReplenishments,
} from '@/lib/petty-cash'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PettyCashFund {
  id: string
  storeId: string
  name: string
  balance: number
  maxBalance: number
  custodian: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface PettyCashTx {
  id: string
  fundId: string
  storeId: string
  type: 'REPLENISHMENT' | 'EXPENSE'
  amount: number
  category: string
  description: string
  receiptNumber: string
  createdBy: string
  createdAt: string
}

interface PettyCashClientProps {
  storeId: string
  currency: string
}

// ── Expense categories ────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  'ATK',
  'Transportasi',
  'Konsumsi',
  'Kebersihan',
  'Utilitas',
  'Pemeliharaan',
  'Lain-lain',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']
  return `${names[Number(m) - 1]} ${y}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PettyCashClient({ storeId, currency }: PettyCashClientProps) {
  const qc = useQueryClient()
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null)
  const [month, setMonth] = useState(currentYearMonth())
  const [showNewFund, setShowNewFund] = useState(false)
  const [showExpense, setShowExpense] = useState(false)
  const [showReplenish, setShowReplenish] = useState(false)

  // Fund form state
  const [fundName, setFundName] = useState('')
  const [fundCustodian, setFundCustodian] = useState('')
  const [fundMax, setFundMax] = useState('1000000')
  const [fundInitial, setFundInitial] = useState('0')

  // Expense form state
  const [expAmount, setExpAmount] = useState('')
  const [expCategory, setExpCategory] = useState(EXPENSE_CATEGORIES[0])
  const [expDesc, setExpDesc] = useState('')
  const [expReceipt, setExpReceipt] = useState('')

  // Replenish form state
  const [repAmount, setRepAmount] = useState('')
  const [repDesc, setRepDesc] = useState('Pengisian kas kecil')

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: funds = [], isLoading: fundsLoading } = useQuery<PettyCashFund[]>({
    queryKey: ['petty-cash-funds', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/petty-cash?storeId=${storeId}`)
      return (await res.json()) as any
    },
  })

  const selectedFund = funds.find(f => f.id === selectedFundId) ?? funds[0] ?? null
  const activeFund = selectedFund

  const { data: transactions = [], isLoading: txLoading } = useQuery<PettyCashTx[]>({
    queryKey: ['petty-cash-txs', activeFund?.id, storeId, month],
    queryFn: async () => {
      if (!activeFund) return []
      const res = await fetch(
        `/api/petty-cash/${activeFund.id}/transactions?storeId=${storeId}&month=${month}`,
      )
      return (await res.json()) as any
    },
    enabled: !!activeFund,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createFund = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/petty-cash?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fundName,
          custodian: fundCustodian,
          maxBalance: Number(fundMax),
          balance: Number(fundInitial),
        }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      toast.success('Dana kas kecil berhasil dibuat')
      qc.invalidateQueries({ queryKey: ['petty-cash-funds', storeId] })
      setShowNewFund(false)
      setFundName(''); setFundCustodian(''); setFundMax('1000000'); setFundInitial('0')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const recordExpense = useMutation({
    mutationFn: async () => {
      if (!activeFund) return
      const res = await fetch(
        `/api/petty-cash/${activeFund.id}/transactions?storeId=${storeId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'EXPENSE',
            amount: Number(expAmount),
            category: expCategory,
            description: expDesc,
            receiptNumber: expReceipt,
          }),
        },
      )
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      toast.success('Pengeluaran berhasil dicatat')
      qc.invalidateQueries({ queryKey: ['petty-cash-funds', storeId] })
      qc.invalidateQueries({ queryKey: ['petty-cash-txs', activeFund?.id, storeId, month] })
      setShowExpense(false)
      setExpAmount(''); setExpDesc(''); setExpReceipt('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const replenishFund = useMutation({
    mutationFn: async () => {
      if (!activeFund) return
      const res = await fetch(
        `/api/petty-cash/${activeFund.id}/replenish?storeId=${storeId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Number(repAmount), description: repDesc }),
        },
      )
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: (data: any) => {
      toast.success(`Kas diisi ${formatCurrency(data?.amountAdded ?? 0, currency)}`)
      qc.invalidateQueries({ queryKey: ['petty-cash-funds', storeId] })
      qc.invalidateQueries({ queryKey: ['petty-cash-txs', activeFund?.id, storeId, month] })
      setShowReplenish(false)
      setRepAmount('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Derived stats ──────────────────────────────────────────────────────────

  const monthlySummary = useMemo(() => aggregateByCategory(transactions), [transactions])
  const monthlyExpTotal = useMemo(() => totalExpenses(transactions), [transactions])
  const monthlyRepTotal = useMemo(() => totalReplenishments(transactions), [transactions])

  const isLow = activeFund
    ? isBelowLowBalanceThreshold(activeFund.balance, activeFund.maxBalance)
    : false

  const needed = activeFund
    ? calcReplenishmentNeeded(activeFund.balance, activeFund.maxBalance)
    : 0

  // ── Month nav ──────────────────────────────────────────────────────────────

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (fundsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-[var(--text-3)]" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Kas Kecil</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Kelola pengeluaran harian dan pengisian kas kecil
          </p>
        </div>
        <button
          onClick={() => setShowNewFund(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} /> Dana Baru
        </button>
      </div>

      {funds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <Wallet size={40} className="mx-auto mb-3 text-[var(--text-3)]" />
          <p className="text-[var(--text-2)] font-medium">Belum ada dana kas kecil</p>
          <p className="text-sm text-[var(--text-3)] mt-1">Buat dana pertama untuk mulai mencatat pengeluaran</p>
        </div>
      ) : (
        <>
          {/* Fund selector */}
          <div className="flex flex-wrap gap-3">
            {funds.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFundId(f.id)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-left transition-colors',
                  (activeFund?.id === f.id)
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--primary)]/50',
                )}
              >
                <p className="text-xs text-[var(--text-3)]">{f.custodian}</p>
                <p className="font-semibold text-[var(--text-1)]">{f.name}</p>
                <p className={cn('text-sm font-bold mt-1',
                  isBelowLowBalanceThreshold(f.balance, f.maxBalance)
                    ? 'text-red-500' : 'text-green-500'
                )}>
                  {formatCurrency(f.balance, currency)}
                </p>
              </button>
            ))}
          </div>

          {activeFund && (
            <>
              {/* Low balance alert */}
              {isLow && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                  <span className="text-sm text-amber-700 dark:text-amber-400">
                    Saldo rendah — tersisa {formatCurrency(activeFund.balance, currency)}.{' '}
                    Butuh pengisian sebesar {formatCurrency(needed, currency)} untuk mencapai batas maksimum.
                  </span>
                  <button
                    onClick={() => { setRepAmount(String(needed)); setShowReplenish(true) }}
                    className="ml-auto shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                  >
                    Isi Sekarang
                  </button>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: 'Saldo', value: formatCurrency(activeFund.balance, currency), icon: Wallet, color: 'text-[var(--primary)]' },
                  { label: 'Maks Saldo', value: formatCurrency(activeFund.maxBalance, currency), icon: Wallet, color: 'text-[var(--text-3)]' },
                  { label: 'Keluar Bulan Ini', value: formatCurrency(monthlyExpTotal, currency), icon: TrendingDown, color: 'text-red-500' },
                  { label: 'Pengisian Bulan Ini', value: formatCurrency(monthlyRepTotal, currency), icon: RefreshCw, color: 'text-green-500' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={16} className={color} />
                      <span className="text-xs text-[var(--text-3)]">{label}</span>
                    </div>
                    <p className="text-xl font-bold text-[var(--text-1)]">{value}</p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExpense(true)}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-1)] hover:border-[var(--primary)]/50"
                >
                  <TrendingDown size={16} className="text-red-500" /> Catat Pengeluaran
                </button>
                <button
                  onClick={() => setShowReplenish(true)}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-1)] hover:border-[var(--primary)]/50"
                >
                  <RefreshCw size={16} className="text-green-500" /> Pengisian
                </button>
              </div>

              {/* Month navigator + summary */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Category summary */}
                <div className="lg:col-span-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-[var(--text-1)]">Ringkasan Bulanan</h3>
                    <div className="flex items-center gap-1 text-sm text-[var(--text-3)]">
                      <button onClick={() => shiftMonth(-1)} className="px-1 hover:text-[var(--text-1)]">‹</button>
                      <span>{formatMonth(month)}</span>
                      <button onClick={() => shiftMonth(1)} className="px-1 hover:text-[var(--text-1)]">›</button>
                    </div>
                  </div>
                  {monthlySummary.length === 0 ? (
                    <p className="text-sm text-[var(--text-3)] py-4 text-center">Belum ada pengeluaran</p>
                  ) : (
                    <div className="space-y-3">
                      {monthlySummary.map(s => (
                        <div key={s.category} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-[var(--text-1)]">{s.category}</p>
                            <p className="text-xs text-[var(--text-3)]">{s.count}x transaksi</p>
                          </div>
                          <p className="text-sm font-semibold text-red-500">
                            {formatCurrency(s.total, currency)}
                          </p>
                        </div>
                      ))}
                      <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-[var(--text-1)]">Total</p>
                        <p className="text-sm font-bold text-red-500">
                          {formatCurrency(monthlyExpTotal, currency)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Transaction list */}
                <div className="lg:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                  <div className="p-4 border-b border-[var(--border)]">
                    <h3 className="font-semibold text-[var(--text-1)]">Riwayat Transaksi</h3>
                  </div>
                  {txLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="animate-spin text-[var(--text-3)]" size={24} />
                    </div>
                  ) : transactions.length === 0 ? (
                    <p className="text-sm text-[var(--text-3)] py-12 text-center">
                      Tidak ada transaksi untuk {formatMonth(month)}
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--border)]">
                      {transactions.map(tx => (
                        <div key={tx.id} className="flex items-center gap-4 px-4 py-3">
                          <div className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            tx.type === 'EXPENSE' ? 'bg-red-500/10' : 'bg-green-500/10',
                          )}>
                            {tx.type === 'EXPENSE'
                              ? <TrendingDown size={14} className="text-red-500" />
                              : <RefreshCw size={14} className="text-green-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text-1)] truncate">{tx.description}</p>
                            <p className="text-xs text-[var(--text-3)]">
                              {tx.category}
                              {tx.receiptNumber ? ` · #${tx.receiptNumber}` : ''}
                              {' · '}{new Date(tx.createdAt).toLocaleDateString('id-ID')}
                            </p>
                          </div>
                          <p className={cn(
                            'text-sm font-semibold shrink-0',
                            tx.type === 'EXPENSE' ? 'text-red-500' : 'text-green-500',
                          )}>
                            {tx.type === 'EXPENSE' ? '-' : '+'}{formatCurrency(tx.amount, currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}

      {/* New fund modal */}
      {showNewFund && (
        <Modal title="Dana Kas Kecil Baru" onClose={() => setShowNewFund(false)}>
          <div className="space-y-4">
            <Field label="Nama Dana *">
              <input className={inputCls} value={fundName} onChange={e => setFundName(e.target.value)} placeholder="Kas Kecil Toko" />
            </Field>
            <Field label="Pemegang Kas *">
              <input className={inputCls} value={fundCustodian} onChange={e => setFundCustodian(e.target.value)} placeholder="Nama kasir" />
            </Field>
            <Field label="Saldo Maksimum">
              <input className={inputCls} type="number" min="0" value={fundMax} onChange={e => setFundMax(e.target.value)} />
            </Field>
            <Field label="Saldo Awal">
              <input className={inputCls} type="number" min="0" value={fundInitial} onChange={e => setFundInitial(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowNewFund(false)} className={cancelBtnCls}>Batal</button>
              <button
                disabled={!fundName || !fundCustodian || createFund.isPending}
                onClick={() => createFund.mutate()}
                className={submitBtnCls}
              >
                {createFund.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Simpan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Expense modal */}
      {showExpense && activeFund && (
        <Modal title="Catat Pengeluaran" onClose={() => setShowExpense(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--bg-2)] px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-[var(--text-3)]">Saldo tersedia</span>
              <span className="font-bold text-[var(--text-1)]">{formatCurrency(activeFund.balance, currency)}</span>
            </div>
            <Field label="Jumlah *">
              <input className={inputCls} type="number" min="1" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="50000" />
            </Field>
            <Field label="Kategori *">
              <select className={inputCls} value={expCategory} onChange={e => setExpCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Keterangan *">
              <input className={inputCls} value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Beli tinta printer" />
            </Field>
            <Field label="No. Kwitansi">
              <input className={inputCls} value={expReceipt} onChange={e => setExpReceipt(e.target.value)} placeholder="INV-001 (opsional)" />
            </Field>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowExpense(false)} className={cancelBtnCls}>Batal</button>
              <button
                disabled={!expAmount || !expDesc || recordExpense.isPending}
                onClick={() => recordExpense.mutate()}
                className={submitBtnCls}
              >
                {recordExpense.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Simpan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Replenish modal */}
      {showReplenish && activeFund && (
        <Modal title="Pengisian Kas Kecil" onClose={() => setShowReplenish(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--bg-2)] px-4 py-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-[var(--text-3)]">Saldo saat ini</p>
                <p className="font-bold text-[var(--text-1)]">{formatCurrency(activeFund.balance, currency)}</p>
              </div>
              <div>
                <p className="text-[var(--text-3)]">Saldo maks</p>
                <p className="font-bold text-[var(--text-1)]">{formatCurrency(activeFund.maxBalance, currency)}</p>
              </div>
            </div>
            <Field label="Jumlah Pengisian *">
              <input className={inputCls} type="number" min="1" value={repAmount} onChange={e => setRepAmount(e.target.value)} placeholder={String(needed)} />
            </Field>
            <Field label="Keterangan">
              <input className={inputCls} value={repDesc} onChange={e => setRepDesc(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowReplenish(false)} className={cancelBtnCls}>Batal</button>
              <button
                disabled={!repAmount || replenishFund.isPending}
                onClick={() => replenishFund.mutate()}
                className={submitBtnCls}
              >
                {replenishFund.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Isi Kas'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── UI helpers ────────────────────────────────────────────────────────────────

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
