"use client"

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Plus, Search, Loader2, X, RefreshCw,
  ArrowUpCircle, ArrowDownCircle, SlidersHorizontal,
  User, AlertTriangle, CheckCircle, Clock, BarChart2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { formatCurrency, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
type TxType = 'PURCHASE' | 'PAYMENT' | 'ADJUSTMENT'

interface CreditAccount {
  id: string
  storeId: string
  customerId: string
  creditLimit: number
  balance: number
  status: AccountStatus
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
}

interface CreditTransaction {
  id: string
  accountId: string
  storeId: string
  type: TxType
  amount: number
  orderId: string | null
  note: string | null
  createdAt: string
}

interface AgingRow {
  customerId: string
  customerName: string | null
  accountId: string
  current: number
  days30: number
  days60: number
  days90: number
  over90: number
  total: number
}

interface StoreCreditClientProps {
  storeId: string
  currency?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<AccountStatus, string> = {
  ACTIVE:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  SUSPENDED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  CLOSED:    'bg-red-500/15 text-red-400 border-red-500/30',
}

const TX_STYLE: Record<TxType, string> = {
  PURCHASE:   'bg-red-500/15 text-red-400 border-red-500/30',
  PAYMENT:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ADJUSTMENT: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

const TX_ICON: Record<TxType, React.ReactNode> = {
  PURCHASE:   <ArrowDownCircle className="h-4 w-4 text-red-400" />,
  PAYMENT:    <ArrowUpCircle className="h-4 w-4 text-emerald-400" />,
  ADJUSTMENT: <SlidersHorizontal className="h-4 w-4 text-violet-400" />,
}

const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 focus:outline-none'
const cancelBtnCls = 'flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)]'
const primaryBtnCls = 'flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50'

// ─── Shared Sub-components ────────────────────────────────────────────────────

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

// ─── Create Account Modal ─────────────────────────────────────────────────────

function CreateAccountModal({ storeId, onClose, onDone }: { storeId: string; onClose: () => void; onDone: () => void }) {
  const [customerId, setCustomerId] = useState('')
  const [creditLimit, setCreditLimit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    if (!customerId.trim()) { setError('Customer ID is required'); return }
    const limit = parseFloat(creditLimit)
    if (!limit || limit <= 0) { setError('Enter a valid credit limit'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/credit-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, customerId: customerId.trim(), creditLimit: limit }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Failed to create account'); return }
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
            placeholder="e.g. 1000000" className={inputCls} />
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

// ─── Record Payment Modal ─────────────────────────────────────────────────────

function PaymentModal({ account, currency, onClose, onDone }: { account: CreditAccount; currency: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > account.balance) { setError('Payment exceeds outstanding balance'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/credit-accounts/${account.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PAYMENT', amount: amt, note: note || 'Customer payment' }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Payment failed'); return }
      toast.success(`Payment of ${formatCurrency(amt, currency)} recorded`)
      onDone()
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Record Payment" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-sm">
          <p className="text-[var(--text-3)]">Outstanding Balance</p>
          <p className="mt-0.5 text-lg font-bold text-red-400">{formatCurrency(account.balance, currency)}</p>
          <p className="text-xs text-[var(--text-3)]">{account.customerName}</p>
        </div>
        <FormField label="Payment Amount" required>
          <input type="number" min="1000" step="1000" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder={`Max ${formatCurrency(account.balance, currency)}`} className={inputCls} />
        </FormField>
        <FormField label="Note">
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Optional note" className={inputCls} />
        </FormField>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button onClick={handle} disabled={saving || !amount} className={primaryBtnCls}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Record Payment
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Edit Limit Modal ─────────────────────────────────────────────────────────

function EditLimitModal({ account, currency, onClose, onDone }: { account: CreditAccount; currency: string; onClose: () => void; onDone: () => void }) {
  const [creditLimit, setCreditLimit] = useState(String(account.creditLimit))
  const [status, setStatus] = useState<AccountStatus>(account.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    const limit = parseFloat(creditLimit)
    if (!limit || limit <= 0) { setError('Enter a valid credit limit'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/credit-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditLimit: limit, status }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Update failed'); return }
      toast.success('Account updated')
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
        <FormField label="Status" required>
          <div className="flex gap-2">
            {(['ACTIVE', 'SUSPENDED', 'CLOSED'] as AccountStatus[]).map(s => (
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
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save Changes
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Transaction History Modal ────────────────────────────────────────────────

function TransactionHistoryModal({ account, currency, onClose }: { account: CreditAccount; currency: string; onClose: () => void }) {
  const { data: txns = [], isLoading } = useQuery<CreditTransaction[]>({
    queryKey: ['credit-txns', account.id],
    queryFn: () => fetch(`/api/credit-accounts/${account.id}/transactions`).then(r => r.json()),
  })

  return (
    <ModalShell title="Transaction History" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-3)]">{account.customerName}</span>
          <span className="font-semibold text-red-400">{formatCurrency(account.balance, currency)} outstanding</span>
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
                      {tx.orderId && <span className="text-[10px] text-[var(--text-3)]">Order #{tx.orderId.slice(-6)}</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--text-3)]">{tx.note || '—'}</p>
                    <p className="text-[10px] text-stone-600">{formatDate(tx.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-semibold', tx.type === 'PAYMENT' ? 'text-emerald-400' : 'text-red-400')}>
                    {tx.type === 'PAYMENT' ? '-' : '+'}{formatCurrency(Math.abs(tx.amount), currency)}
                  </p>
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

// ─── Aging Report Modal ───────────────────────────────────────────────────────

function AgingReportModal({ storeId, currency, onClose }: { storeId: string; currency: string; onClose: () => void }) {
  const { data: rows = [], isLoading } = useQuery<AgingRow[]>({
    queryKey: ['credit-aging', storeId],
    queryFn: () => fetch(`/api/credit-accounts/aging?storeId=${storeId}`).then(r => r.json()),
  })

  const totalOverdue = rows.reduce((s, r) => s + r.days30 + r.days60 + r.days90 + r.over90, 0)

  return (
    <ModalShell title="Aging Report" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Total overdue: <span className="font-semibold">{formatCurrency(totalOverdue, currency)}</span>
          </p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-violet-400" /></div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--text-3)]">No overdue accounts.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-xs divide-y divide-[var(--border)]">
              <thead>
                <tr className="bg-[var(--bg-subtle)]">
                  {['Customer', 'Current', '1-30d', '31-60d', '61-90d', '90d+', 'Total'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--bg-card)]">
                {rows.map(r => (
                  <tr key={r.accountId} className="hover:bg-[var(--bg-subtle)]">
                    <td className="px-3 py-2 font-medium text-[var(--text-1)]">{r.customerName ?? r.customerId}</td>
                    <td className="px-3 py-2 text-[var(--text-2)]">{formatCurrency(r.current, currency)}</td>
                    <td className={cn('px-3 py-2', r.days30 > 0 ? 'text-amber-400 font-medium' : 'text-[var(--text-3)]')}>{formatCurrency(r.days30, currency)}</td>
                    <td className={cn('px-3 py-2', r.days60 > 0 ? 'text-orange-400 font-medium' : 'text-[var(--text-3)]')}>{formatCurrency(r.days60, currency)}</td>
                    <td className={cn('px-3 py-2', r.days90 > 0 ? 'text-red-400 font-medium' : 'text-[var(--text-3)]')}>{formatCurrency(r.days90, currency)}</td>
                    <td className={cn('px-3 py-2', r.over90 > 0 ? 'text-red-500 font-bold' : 'text-[var(--text-3)]')}>{formatCurrency(r.over90, currency)}</td>
                    <td className="px-3 py-2 font-semibold text-[var(--text-1)]">{formatCurrency(r.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)]">
          Close
        </button>
      </div>
    </ModalShell>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StoreCreditClient({ storeId, currency = 'IDR' }: StoreCreditClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'accounts' | 'aging'>('accounts')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<CreditAccount | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showAging, setShowAging] = useState(false)

  const { data: accounts = [], isLoading, refetch } = useQuery<CreditAccount[]>({
    queryKey: ['credit-accounts', storeId],
    queryFn: () => fetch(`/api/credit-accounts?storeId=${storeId}`).then(r => r.json()),
  })

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase()
    return !q ||
      a.customerName?.toLowerCase().includes(q) ||
      a.customerEmail?.toLowerCase().includes(q) ||
      a.customerPhone?.includes(q)
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['credit-accounts', storeId] })

  const availableCredit = (a: CreditAccount) => Math.max(0, a.creditLimit - a.balance)
  const utilization = (a: CreditAccount) => a.creditLimit > 0 ? (a.balance / a.creditLimit) * 100 : 0

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15">
            <CreditCard className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--text-1)]">Store Credit Accounts</h1>
            <p className="text-xs text-[var(--text-3)]">Manage customer credit limits and outstanding balances</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAging(true)}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20">
            <BarChart2 className="h-3.5 w-3.5" /> Aging Report
          </button>
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
          { label: 'Total Accounts', value: accounts.length, icon: <CreditCard className="h-4 w-4 text-blue-400" />, color: 'blue' },
          { label: 'Active', value: accounts.filter(a => a.status === 'ACTIVE').length, icon: <CheckCircle className="h-4 w-4 text-emerald-400" />, color: 'emerald' },
          { label: 'Suspended', value: accounts.filter(a => a.status === 'SUSPENDED').length, icon: <Clock className="h-4 w-4 text-amber-400" />, color: 'amber' },
          { label: 'Total Outstanding', value: formatCurrency(accounts.reduce((s, a) => s + a.balance, 0), currency), icon: <AlertTriangle className="h-4 w-4 text-red-400" />, color: 'red' },
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
          <CreditCard className="mx-auto mb-3 h-8 w-8 text-stone-600" />
          <p className="text-sm font-medium text-[var(--text-2)]">No credit accounts found</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">Create an account to let customers buy on credit.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead>
              <tr className="bg-[var(--bg-subtle)]">
                {['Customer', 'Credit Limit', 'Outstanding', 'Available', 'Utilization', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--bg-card)]">
              {filtered.map(a => {
                const util = utilization(a)
                return (
                  <tr key={a.id} className="group hover:bg-[var(--bg-subtle)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/15">
                          <User className="h-3.5 w-3.5 text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-1)]">{a.customerName ?? 'Unknown'}</p>
                          <p className="text-[10px] text-[var(--text-3)]">{a.customerEmail ?? a.customerPhone ?? '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{formatCurrency(a.creditLimit, currency)}</td>
                    <td className="px-4 py-3 font-semibold text-red-400">{formatCurrency(a.balance, currency)}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatCurrency(availableCredit(a), currency)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', util >= 90 ? 'bg-red-500' : util >= 70 ? 'bg-amber-500' : 'bg-emerald-500')}
                            style={{ width: `${Math.min(100, util)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--text-3)]">{util.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLE[a.status])}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setSelectedAccount(a); setShowPayment(true) }}
                          disabled={a.status !== 'ACTIVE' || a.balance === 0}
                          className="rounded-md border border-emerald-500/30 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed">
                          Pay
                        </button>
                        <button onClick={() => { setSelectedAccount(a); setShowHistory(true) }}
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-3)] hover:text-[var(--text-1)]">
                          History
                        </button>
                        <button onClick={() => { setSelectedAccount(a); setShowEdit(true) }}
                          className="rounded-md border border-violet-500/30 px-2 py-1 text-[10px] font-medium text-violet-400 hover:bg-violet-500/10">
                          Edit
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
        <CreateAccountModal storeId={storeId} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); invalidate() }} />
      )}
      {showPayment && selectedAccount && (
        <PaymentModal account={selectedAccount} currency={currency}
          onClose={() => { setShowPayment(false); setSelectedAccount(null) }}
          onDone={() => { setShowPayment(false); setSelectedAccount(null); invalidate() }} />
      )}
      {showEdit && selectedAccount && (
        <EditLimitModal account={selectedAccount} currency={currency}
          onClose={() => { setShowEdit(false); setSelectedAccount(null) }}
          onDone={() => { setShowEdit(false); setSelectedAccount(null); invalidate() }} />
      )}
      {showHistory && selectedAccount && (
        <TransactionHistoryModal account={selectedAccount} currency={currency}
          onClose={() => { setShowHistory(false); setSelectedAccount(null) }} />
      )}
      {showAging && (
        <AgingReportModal storeId={storeId} currency={currency} onClose={() => setShowAging(false)} />
      )}
    </div>
  )
}
