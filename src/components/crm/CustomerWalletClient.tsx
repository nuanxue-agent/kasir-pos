"use client"

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Wallet, Plus, Search, Loader2, X, RefreshCw, ArrowUpCircle,
  ArrowDownCircle, ArrowLeftRight, SlidersHorizontal, History,
  User, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { formatCurrency, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type TxType = 'TOPUP' | 'PAYMENT' | 'REFUND' | 'ADJUSTMENT'

interface CustomerWallet {
  id: string
  customerId: string
  storeId: string
  balance: number
  currency: string
  updatedAt: string
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
}

interface WalletTransaction {
  id: string
  walletId: string
  storeId: string
  type: TxType
  amount: number
  note: string | null
  orderId: string | null
  createdAt: string
  runningBalance: number
}

interface CustomerWalletClientProps {
  storeId: string
  currency?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TX_STYLE: Record<TxType, string> = {
  TOPUP:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PAYMENT:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  REFUND:     'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ADJUSTMENT: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

const TX_ICON: Record<TxType, React.ReactNode> = {
  TOPUP:      <ArrowUpCircle className="h-4 w-4 text-emerald-400" />,
  PAYMENT:    <ArrowDownCircle className="h-4 w-4 text-blue-400" />,
  REFUND:     <ArrowLeftRight className="h-4 w-4 text-amber-400" />,
  ADJUSTMENT: <SlidersHorizontal className="h-4 w-4 text-violet-400" />,
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomerWalletClient({ storeId, currency = 'IDR' }: CustomerWalletClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedWallet, setSelectedWallet] = useState<CustomerWallet | null>(null)
  const [showTopup, setShowTopup] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const { data: wallets = [], isLoading, refetch } = useQuery<CustomerWallet[]>({
    queryKey: ['wallets', storeId],
    queryFn: () => fetch(`/api/wallets?storeId=${storeId}`).then(r => r.json()),
  })

  const filtered = wallets.filter(w => {
    const q = search.toLowerCase()
    return !q ||
      w.customerName?.toLowerCase().includes(q) ||
      w.customerEmail?.toLowerCase().includes(q) ||
      w.customerPhone?.includes(q)
  })

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15">
            <Wallet className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--text-1)]">Customer Wallets</h1>
            <p className="text-xs text-[var(--text-3)]">Prepaid balances &amp; transaction history</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text-1)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2 pl-9 pr-3 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <Wallet className="mx-auto mb-3 h-8 w-8 text-stone-600" />
          <p className="text-sm font-medium text-[var(--text-2)]">No wallets found</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">Wallets are created automatically when a customer tops up.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead>
              <tr className="bg-[var(--bg-subtle)]">
                {['Customer', 'Balance', 'Currency', 'Last Updated', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--bg-card)]">
              {filtered.map(w => (
                <tr key={w.id} className="group hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/15">
                        <User className="h-3.5 w-3.5 text-violet-400" />
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text-1)]">{w.customerName ?? 'Unknown'}</p>
                        <p className="text-[10px] text-[var(--text-3)]">{w.customerEmail ?? w.customerPhone ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-[var(--text-1)]">
                    {formatCurrency(w.balance, w.currency || currency)}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-3)]">{w.currency || currency}</td>
                  <td className="px-4 py-3 text-[var(--text-3)]">{formatDate(w.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setSelectedWallet(w); setShowTopup(true) }}
                        className="rounded-md border border-emerald-500/30 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10"
                      >
                        Top Up
                      </button>
                      <button
                        onClick={() => { setSelectedWallet(w); setShowHistory(true) }}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-3)] hover:text-[var(--text-1)]"
                      >
                        History
                      </button>
                      <button
                        onClick={() => { setSelectedWallet(w); setShowAdjust(true) }}
                        className="rounded-md border border-violet-500/30 px-2 py-1 text-[10px] font-medium text-violet-400 hover:bg-violet-500/10"
                      >
                        Adjust
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showTopup && selectedWallet && (
        <TopupModal
          wallet={selectedWallet}
          storeId={storeId}
          currency={currency}
          onClose={() => { setShowTopup(false); setSelectedWallet(null) }}
          onDone={() => { setShowTopup(false); setSelectedWallet(null); qc.invalidateQueries({ queryKey: ['wallets', storeId] }) }}
        />
      )}
      {showAdjust && selectedWallet && (
        <AdjustModal
          wallet={selectedWallet}
          storeId={storeId}
          currency={currency}
          onClose={() => { setShowAdjust(false); setSelectedWallet(null) }}
          onDone={() => { setShowAdjust(false); setSelectedWallet(null); qc.invalidateQueries({ queryKey: ['wallets', storeId] }) }}
        />
      )}
      {showHistory && selectedWallet && (
        <HistoryModal
          wallet={selectedWallet}
          currency={currency}
          onClose={() => { setShowHistory(false); setSelectedWallet(null) }}
        />
      )}
    </div>
  )
}

// ─── Top Up Modal ─────────────────────────────────────────────────────────────

function TopupModal({
  wallet, storeId, currency, onClose, onDone,
}: { wallet: CustomerWallet; storeId: string; currency: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'CASH' | 'TRANSFER' | 'GIFT_CARD'>('CASH')
  const [giftCardCode, setGiftCardCode] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (method === 'GIFT_CARD' && !giftCardCode.trim()) { setError('Enter gift card code'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/wallets/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: wallet.customerId,
          storeId,
          amount: amt,
          note: note || `Top up via ${method.toLowerCase().replace('_', ' ')}`,
          method,
          giftCardCode: method === 'GIFT_CARD' ? giftCardCode.trim().toUpperCase() : undefined,
        }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Top up failed'); return }
      toast.success(`Topped up ${formatCurrency(amt, currency)}`)
      onDone()
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Top Up Wallet" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-sm">
          <p className="text-[var(--text-3)]">Current Balance</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--text-1)]">{formatCurrency(wallet.balance, currency)}</p>
          <p className="text-xs text-[var(--text-3)]">{wallet.customerName}</p>
        </div>

        <FormField label="Amount" required>
          <input type="number" min="1000" step="1000" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 100000" className={inputCls} />
        </FormField>

        <FormField label="Method" required>
          <div className="flex gap-2">
            {(['CASH', 'TRANSFER', 'GIFT_CARD'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                  method === m
                    ? 'border-violet-500/60 bg-violet-500/15 text-violet-400'
                    : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-3)] hover:text-[var(--text-2)]',
                )}
              >
                {m === 'GIFT_CARD' ? 'Gift Card' : m.charAt(0) + m.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </FormField>

        {method === 'GIFT_CARD' && (
          <FormField label="Gift Card Code" required>
            <input
              type="text"
              value={giftCardCode}
              onChange={e => setGiftCardCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234EFGH5678"
              className={cn(inputCls, 'font-mono tracking-widest')}
            />
          </FormField>
        )}

        <FormField label="Note">
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Optional note" className={inputCls} />
        </FormField>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button onClick={handle} disabled={saving || !amount} className={primaryBtnCls}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Top Up
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Adjust Modal ─────────────────────────────────────────────────────────────

function AdjustModal({
  wallet, storeId, currency, onClose, onDone,
}: { wallet: CustomerWallet; storeId: string; currency: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt === 0) { setError('Enter a non-zero amount (negative to deduct)'); return }
    if (!note.trim()) { setError('Note is required for adjustments'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/wallets/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: wallet.customerId, storeId, amount: amt, note: note.trim() }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Adjustment failed'); return }
      toast.success('Balance adjusted')
      onDone()
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Adjust Balance" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          Admin adjustment — use positive amount to add, negative to deduct.
        </div>
        <FormField label="Amount" required>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 50000 or -10000" className={inputCls} />
        </FormField>
        <FormField label="Reason / Note" required>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Reason for adjustment" className={inputCls} />
        </FormField>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button onClick={handle} disabled={saving || !amount || !note} className={primaryBtnCls}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Apply
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── History Modal ────────────────────────────────────────────────────────────

function HistoryModal({
  wallet, currency, onClose,
}: { wallet: CustomerWallet; currency: string; onClose: () => void }) {
  const { data: txns = [], isLoading } = useQuery<WalletTransaction[]>({
    queryKey: ['wallet-txns', wallet.id],
    queryFn: () => fetch(`/api/wallets/${wallet.id}/transactions`).then(r => r.json()),
  })

  return (
    <ModalShell title="Transaction History" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-3)]">{wallet.customerName}</span>
          <span className="font-semibold text-[var(--text-1)]">{formatCurrency(wallet.balance, currency)}</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          </div>
        ) : txns.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--text-3)]">No transactions yet.</div>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            {txns.map(tx => (
              <div key={tx.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  {TX_ICON[tx.type]}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-semibold', TX_STYLE[tx.type])}>{tx.type}</span>
                      {tx.orderId && <span className="text-[10px] text-[var(--text-3)]">Order #{tx.orderId.slice(-6)}</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--text-3)]">{tx.note || '—'}</p>
                    <p className="text-[10px] text-stone-600">{formatDate(tx.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-semibold', tx.type === 'PAYMENT' ? 'text-red-400' : tx.type === 'TOPUP' ? 'text-emerald-400' : 'text-[var(--text-1)]')}>
                    {tx.type === 'PAYMENT' ? '-' : '+'}{formatCurrency(Math.abs(tx.amount), currency)}
                  </p>
                  <p className="text-[10px] text-[var(--text-3)]">{formatCurrency(tx.runningBalance, currency)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)]">
          Close
        </button>
      </div>
    </ModalShell>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className={cn('w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl', wide ? 'max-w-lg' : 'max-w-sm')}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 focus:outline-none'
const cancelBtnCls = 'flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)]'
const primaryBtnCls = 'flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
