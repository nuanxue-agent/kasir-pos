"use client"

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Plus, Search, Loader2, X, RefreshCw,
  AlertTriangle, CheckCircle, Clock, TrendingUp, History,
  SlidersHorizontal, Shield, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  calcAvailableCredit,
  calcUtilizationPct,
  determineCreditStatus,
  calcDueDate,
  type CreditStatus,
} from '@/lib/credit-limits'

// ── Types ─────────────────────────────────────────────────────────────────────

type TxType = 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT'

interface CustomerCredit {
  id: string
  storeId: string
  customerId: string
  creditLimit: number
  usedCredit: number
  availableCredit: number
  paymentTermsDays: number
  status: CreditStatus
  lastReviewedAt: string | null
  createdAt: string
  updatedAt: string
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
}

interface CreditTransaction {
  id: string
  customerId: string
  storeId: string
  type: TxType
  amount: number
  balance: number
  reference: string | null
  createdAt: string
}

interface Props {
  storeId: string
  currency?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<CreditStatus, string> = {
  GOOD:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  WARNING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  FROZEN:  'bg-red-500/15 text-red-400 border-red-500/30',
}

const STATUS_ICON: Record<CreditStatus, React.ReactNode> = {
  GOOD:    <CheckCircle className="h-3 w-3" />,
  WARNING: <AlertTriangle className="h-3 w-3" />,
  FROZEN:  <Shield className="h-3 w-3" />,
}

const TX_STYLE: Record<TxType, string> = {
  CHARGE:     'bg-red-500/15 text-red-400 border-red-500/30',
  PAYMENT:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ADJUSTMENT: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

const TX_ICON: Record<TxType, React.ReactNode> = {
  CHARGE:     <ArrowDownCircle className="h-4 w-4 text-red-400" />,
  PAYMENT:    <ArrowUpCircle className="h-4 w-4 text-emerald-400" />,
  ADJUSTMENT: <SlidersHorizontal className="h-4 w-4 text-violet-400" />,
}

const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 focus:outline-none'
const cancelBtnCls = 'flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)]'
const primaryBtnCls = 'flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50'

// ── Shared Sub-components ─────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className={cn('w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl', wide ? 'max-w-2xl' : 'max-w-sm')}>
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

function UtilizationBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

// ── Create Credit Modal ───────────────────────────────────────────────────────

function CreateCreditModal({ storeId, onClose, onDone }: { storeId: string; onClose: () => void; onDone: () => void }) {
  const [customerId, setCustomerId] = useState('')
  const [creditLimit, setCreditLimit] = useState('')
  const [paymentTermsDays, setPaymentTermsDays] = useState('30')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    if (!customerId.trim()) { setError('Customer ID is required'); return }
    const limit = parseFloat(creditLimit)
    if (!limit || limit <= 0) { setError('Enter a valid credit limit'); return }
    const terms = parseInt(paymentTermsDays)
    if (!terms || terms <= 0) { setError('Payment terms must be a positive number of days'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/customer-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, customerId: customerId.trim(), creditLimit: limit, paymentTermsDays: terms }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Failed to create credit account'); return }
      toast.success('Credit account created')
      onDone()
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <ModalShell title="New Credit Account" onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Customer ID" required>
          <input type="text" value={customerId} onChange={e => setCustomerId(e.target.value)}
            placeholder="Enter customer ID" className={inputCls} />
        </FormField>
        <FormField label="Credit Limit (IDR)" required>
          <input type="number" min="10000" step="10000" value={creditLimit} onChange={e => setCreditLimit(e.target.value)}
            placeholder="e.g. 5000000" className={inputCls} />
        </FormField>
        <FormField label="Payment Terms (days)" required>
          <input type="number" min="1" max="365" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)}
            placeholder="e.g. 30" className={inputCls} />
        </FormField>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button onClick={handle} disabled={saving} className={primaryBtnCls}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create Account
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Edit Credit Modal ─────────────────────────────────────────────────────────

function EditCreditModal({ credit, currency, onClose, onDone }: { credit: CustomerCredit; currency: string; onClose: () => void; onDone: () => void }) {
  const [creditLimit, setCreditLimit] = useState(String(credit.creditLimit))
  const [paymentTermsDays, setPaymentTermsDays] = useState(String(credit.paymentTermsDays))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    const limit = parseFloat(creditLimit)
    if (!limit || limit <= 0) { setError('Enter a valid credit limit'); return }
    const terms = parseInt(paymentTermsDays)
    if (!terms || terms <= 0) { setError('Payment terms must be positive'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/customer-credits/${credit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditLimit: limit, paymentTermsDays: terms }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Update failed'); return }
      toast.success('Credit account updated')
      onDone()
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Edit Credit Account" onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Credit Limit (IDR)" required>
          <input type="number" min="10000" step="10000" value={creditLimit} onChange={e => setCreditLimit(e.target.value)}
            className={inputCls} />
        </FormField>
        <FormField label="Payment Terms (days)" required>
          <input type="number" min="1" max="365" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)}
            className={inputCls} />
        </FormField>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button onClick={handle} disabled={saving} className={primaryBtnCls}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save Changes
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Record Transaction Modal ──────────────────────────────────────────────────

function TransactionModal({ credit, currency, onClose, onDone }: { credit: CustomerCredit; currency: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<TxType>('PAYMENT')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/customer-credits/${credit.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, amount: amt, reference: reference || null }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Transaction failed'); return }
      toast.success(`${type} of ${formatCurrency(amt, currency)} recorded`)
      onDone()
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Record Transaction" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-sm">
          <p className="text-[var(--text-3)]">Available Credit</p>
          <p className="mt-0.5 text-lg font-bold text-emerald-400">{formatCurrency(credit.availableCredit, currency)}</p>
          <p className="text-xs text-[var(--text-3)]">{credit.customerName ?? credit.customerId}</p>
        </div>
        <FormField label="Type" required>
          <div className="flex gap-2">
            {(['CHARGE', 'PAYMENT', 'ADJUSTMENT'] as TxType[]).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={cn('flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                  type === t ? TX_STYLE[t] : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                {t}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Amount (IDR)" required>
          <input type="number" min="1000" step="1000" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 500000" className={inputCls} />
        </FormField>
        <FormField label="Reference">
          <input type="text" value={reference} onChange={e => setReference(e.target.value)}
            placeholder="Invoice no., order ID, etc." className={inputCls} />
        </FormField>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button onClick={handle} disabled={saving || !amount} className={primaryBtnCls}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Record
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Transaction History Modal ─────────────────────────────────────────────────

function HistoryModal({ credit, currency, onClose }: { credit: CustomerCredit; currency: string; onClose: () => void }) {
  const { data: txns = [], isLoading } = useQuery<CreditTransaction[]>({
    queryKey: ['credit-txns', credit.id],
    queryFn: () => fetch(`/api/customer-credits/${credit.id}/transactions`).then(r => r.json()),
  })

  return (
    <ModalShell title="Transaction History" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-3)]">{credit.customerName ?? credit.customerId}</span>
          <span className="font-semibold text-[var(--text-1)]">Used: {formatCurrency(credit.usedCredit, currency)}</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-violet-400" /></div>
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
                      {tx.reference && <span className="text-[10px] text-[var(--text-3)]">{tx.reference}</span>}
                    </div>
                    <p className="text-[10px] text-stone-600">{formatDate(tx.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-semibold', tx.type === 'PAYMENT' ? 'text-emerald-400' : tx.type === 'CHARGE' ? 'text-red-400' : 'text-violet-400')}>
                    {tx.type === 'PAYMENT' ? '-' : '+'}{formatCurrency(Math.abs(tx.amount), currency)}
                  </p>
                  <p className="text-[10px] text-[var(--text-3)]">Bal: {formatCurrency(tx.balance, currency)}</p>
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

// ── Review Modal ──────────────────────────────────────────────────────────────

function ReviewModal({ credit, currency, onClose, onDone }: { credit: CustomerCredit; currency: string; onClose: () => void; onDone: () => void }) {
  const [creditLimit, setCreditLimit] = useState(String(credit.creditLimit))
  const [paymentTermsDays, setPaymentTermsDays] = useState(String(credit.paymentTermsDays))
  const [status, setStatus] = useState<CreditStatus>(credit.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    const limit = parseFloat(creditLimit)
    if (!limit || limit <= 0) { setError('Enter a valid credit limit'); return }
    const terms = parseInt(paymentTermsDays)
    if (!terms || terms <= 0) { setError('Payment terms must be positive'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/customer-credits/${credit.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditLimit: limit, paymentTermsDays: terms, status }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Review failed'); return }
      toast.success('Credit reviewed and updated')
      onDone()
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Credit Review" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-300">
          Manual review lets you adjust the credit limit, payment terms, and override the account status.
        </div>
        <FormField label="Credit Limit (IDR)" required>
          <input type="number" min="10000" step="10000" value={creditLimit} onChange={e => setCreditLimit(e.target.value)}
            className={inputCls} />
        </FormField>
        <FormField label="Payment Terms (days)" required>
          <input type="number" min="1" max="365" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)}
            className={inputCls} />
        </FormField>
        <FormField label="Status Override">
          <div className="flex gap-2">
            {(['GOOD', 'WARNING', 'FROZEN'] as CreditStatus[]).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className={cn('flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                  status === s ? STATUS_STYLE[s] : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                {s}
              </button>
            ))}
          </div>
        </FormField>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button onClick={handle} disabled={saving} className={primaryBtnCls}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Submit Review
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CreditLimitClient({ storeId, currency = 'IDR' }: Props) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<CustomerCredit | null>(null)
  const [modal, setModal] = useState<'edit' | 'transaction' | 'history' | 'review' | null>(null)

  const { data: credits = [], isLoading, refetch } = useQuery<CustomerCredit[]>({
    queryKey: ['customer-credits', storeId],
    queryFn: () => fetch(`/api/customer-credits?storeId=${storeId}`).then(r => r.json()),
  })

  const filtered = credits.filter(c => {
    const q = search.toLowerCase()
    return !q ||
      c.customerName?.toLowerCase().includes(q) ||
      c.customerEmail?.toLowerCase().includes(q) ||
      c.customerPhone?.includes(q) ||
      c.customerId.toLowerCase().includes(q)
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['customer-credits', storeId] })

  const openModal = (c: CustomerCredit, m: typeof modal) => { setSelected(c); setModal(m) }
  const closeModal = () => { setSelected(null); setModal(null) }
  const doneModal = () => { closeModal(); invalidate() }

  const totalCredit = credits.reduce((s, c) => s + c.creditLimit, 0)
  const totalUsed   = credits.reduce((s, c) => s + c.usedCredit, 0)
  const goodCount    = credits.filter(c => c.status === 'GOOD').length
  const warningCount = credits.filter(c => c.status === 'WARNING').length
  const frozenCount  = credits.filter(c => c.status === 'FROZEN').length

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15">
            <CreditCard className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--text-1)]">Credit Limits</h1>
            <p className="text-xs text-[var(--text-3)]">Manage customer credit limits and payment terms</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text-1)]">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">
            <Plus className="h-3.5 w-3.5" /> New Account
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Credit', value: formatCurrency(totalCredit, currency), icon: <TrendingUp className="h-4 w-4 text-violet-400" /> },
          { label: 'Total Used', value: formatCurrency(totalUsed, currency), icon: <CreditCard className="h-4 w-4 text-blue-400" /> },
          { label: 'Good / Warning', value: `${goodCount} / ${warningCount}`, icon: <CheckCircle className="h-4 w-4 text-emerald-400" /> },
          { label: 'Frozen', value: frozenCount, icon: <Shield className="h-4 w-4 text-red-400" /> },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-1">
              {stat.icon}
              <span className="text-xs text-[var(--text-3)]">{stat.label}</span>
            </div>
            <p className="text-lg font-bold text-[var(--text-1)]">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Alert banner for frozen accounts */}
      {frozenCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">
            <span className="font-semibold">{frozenCount} account{frozenCount > 1 ? 's' : ''} frozen</span>
            {' '}— credit limit reached. Review and adjust or record payments to unfreeze.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, phone, or customer ID..."
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2 pl-9 pr-3 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/20" />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <CreditCard className="mx-auto mb-3 h-8 w-8 text-stone-600" />
          <p className="text-sm font-medium text-[var(--text-2)]">No credit accounts found</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">Create an account to extend credit to customers.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead>
              <tr className="bg-[var(--bg-subtle)]">
                {['Customer', 'Credit Limit', 'Used', 'Available', 'Utilization', 'Terms', 'Status', 'Due Date', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--bg-card)]">
              {filtered.map(c => {
                const pct = calcUtilizationPct(c.creditLimit, c.usedCredit)
                const dueDate = calcDueDate(c.updatedAt, c.paymentTermsDays)
                return (
                  <tr key={c.id} className="group hover:bg-[var(--bg-subtle)] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text-1)]">{c.customerName ?? 'Unknown'}</p>
                      <p className="text-[11px] text-[var(--text-3)]">{c.customerEmail ?? c.customerId}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">{formatCurrency(c.creditLimit, currency)}</td>
                    <td className="px-4 py-3 text-red-400">{formatCurrency(c.usedCredit, currency)}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatCurrency(c.availableCredit, currency)}</td>
                    <td className="px-4 py-3 min-w-[100px]">
                      <div className="space-y-1">
                        <UtilizationBar pct={pct} />
                        <p className="text-[10px] text-[var(--text-3)]">{pct.toFixed(1)}%</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-[var(--text-3)]" />
                        {c.paymentTermsDays}d
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLE[c.status])}>
                        {STATUS_ICON[c.status]} {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-2)]">{dueDate}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openModal(c, 'transaction')} title="Record transaction"
                          className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-violet-400">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openModal(c, 'history')} title="View history"
                          className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-blue-400">
                          <History className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openModal(c, 'edit')} title="Edit account"
                          className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-amber-400">
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openModal(c, 'review')} title="Credit review"
                          className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-emerald-400">
                          <Shield className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateCreditModal storeId={storeId} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); invalidate() }} />
      )}
      {selected && modal === 'edit' && (
        <EditCreditModal credit={selected} currency={currency} onClose={closeModal} onDone={doneModal} />
      )}
      {selected && modal === 'transaction' && (
        <TransactionModal credit={selected} currency={currency} onClose={closeModal} onDone={doneModal} />
      )}
      {selected && modal === 'history' && (
        <HistoryModal credit={selected} currency={currency} onClose={closeModal} />
      )}
      {selected && modal === 'review' && (
        <ReviewModal credit={selected} currency={currency} onClose={closeModal} onDone={doneModal} />
      )}
    </div>
  )
}
