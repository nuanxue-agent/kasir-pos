"use client"

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Gift, Plus, Search, Loader2, X, RefreshCw, Copy, Check,
  Ban, CreditCard, Hash, Calendar, User, Mail, DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { formatCurrency, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type GCStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'VOIDED'

interface GiftCard {
  id: string
  code: string
  amount: number
  balance: number
  issuedTo: string | null
  customerName: string | null
  issuedAt: string
  expiresAt: string | null
  status: GCStatus
}

interface GCTransaction {
  id: string
  cardId: string
  orderId: string | null
  amount: number
  type: 'ISSUE' | 'REDEEM' | 'REFUND'
  createdAt: string
}

interface GiftCardClientProps {
  storeId: string
  currency?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<GCStatus, string> = {
  ACTIVE:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  REDEEMED: 'bg-stone-500/15 text-stone-400 border-stone-500/30',
  EXPIRED:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  VOIDED:   'bg-red-500/15 text-red-400 border-red-500/30',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GiftCardClient({ storeId, currency = 'IDR' }: GiftCardClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showIssue, setShowIssue] = useState(false)
  const [showBatch, setShowBatch] = useState(false)
  const [showBalance, setShowBalance] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const { data: cards = [], isLoading, refetch } = useQuery<GiftCard[]>({
    queryKey: ['gift-cards', storeId],
    queryFn: () => fetch(`/api/gift-cards?storeId=${storeId}`).then(r => r.json()),
  })

  const voidCard = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/gift-cards/void?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json() as any as any
      if (!res.ok) throw new Error(data.error || 'Failed to void card')
      return data
    },
    onSuccess: () => {
      toast.success('Gift card voided')
      qc.invalidateQueries({ queryKey: ['gift-cards', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch { /* no clipboard */ }
  }

  const filtered = (cards as GiftCard[]).filter(c =>
    !search ||
    c.code.includes(search.toUpperCase()) ||
    c.customerName?.toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = (cards as GiftCard[]).filter(c => c.status === 'ACTIVE').length

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Gift Cards</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">{activeCount} active cards</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBalance(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Check Balance</span>
          </button>
          <button
            onClick={() => setShowBatch(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
          >
            <Hash className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Batch Issue</span>
          </button>
          <button
            onClick={() => setShowIssue(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-violet-200/40 transition-all hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Issue Card
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by code or recipient…"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] py-2 pl-9 pr-4 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 focus:outline-none"
        />
      </div>

      {/* Cards table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-3)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-14 text-center">
          <Gift className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)] opacity-30" />
          <p className="text-sm text-[var(--text-3)]">
            {search ? 'No cards match your search' : 'No gift cards issued yet'}
          </p>
          {!search && (
            <button
              onClick={() => setShowIssue(true)}
              className="mt-3 text-xs font-medium text-violet-400 hover:text-violet-300"
            >
              Issue your first gift card →
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                {['Code', 'Recipient', 'Balance', 'Expiry', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase last:text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(card => (
                <tr key={card.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold tracking-widest text-[var(--text-1)]">{card.code}</span>
                      <button
                        onClick={() => copyCode(card.code)}
                        className="text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
                        aria-label={`Copy ${card.code}`}
                      >
                        {copiedCode === card.code
                          ? <Check className="h-3 w-3 text-emerald-400" />
                          : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-2)]">
                    {card.customerName ?? <span className="text-[var(--text-3)]">Walk-in</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--text-1)]">{formatCurrency(card.balance, currency)}</p>
                    {card.balance !== card.amount && (
                      <p className="text-[10px] text-[var(--text-3)]">of {formatCurrency(card.amount, currency)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-3)] text-xs">
                    {card.expiresAt ? formatDate(card.expiresAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', STATUS_STYLE[card.status])}>
                      {card.status.charAt(0) + card.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {card.status === 'ACTIVE' && (
                      <button
                        onClick={() => {
                          if (confirm()) {
                            voidCard.mutate(card.id)
                          }
                        }}
                        className="rounded-lg border border-red-500/30 px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showIssue && (
        <IssueModal
          storeId={storeId}
          currency={currency}
          onClose={() => setShowIssue(false)}
          onDone={() => { setShowIssue(false); refetch() }}
        />
      )}
      {showBatch && (
        <BatchIssueModal
          storeId={storeId}
          currency={currency}
          onClose={() => setShowBatch(false)}
          onDone={() => { setShowBatch(false); refetch() }}
        />
      )}
      {showBalance && (
        <BalanceInquiryModal
          storeId={storeId}
          currency={currency}
          onClose={() => setShowBalance(false)}
        />
      )}
    </div>
  )
}

// ─── Issue Modal ──────────────────────────────────────────────────────────────

function IssueModal({
  storeId, currency, onClose, onDone,
}: { storeId: string; currency: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [issued, setIssued] = useState<{ code: string; amount: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleIssue = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, amount: amt, recipientName: recipientName || null, recipientEmail: recipientEmail || null, expiresAt: expiresAt || null }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Failed to issue'); return }
      setIssued({ code: data.code, amount: amt })
      toast.success(`Gift card issued: ${data.code}`)
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Issue Gift Card" onClose={onClose}>
      {issued ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-5 text-center">
            <Gift className="mx-auto mb-2 h-8 w-8 text-violet-400" />
            <p className="text-xs text-[var(--text-3)]">Gift card issued!</p>
            <p className="mt-1 font-mono text-xl font-bold tracking-widest text-[var(--text-1)]">{issued.code}</p>
            <p className="mt-1 text-sm font-semibold text-violet-400">{formatCurrency(issued.amount, currency)}</p>
          </div>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(issued.code).catch(() => {})
              setCopied(true); setTimeout(() => setCopied(false), 2000)
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)]"
          >
            {copied ? <><Check className="h-4 w-4 text-emerald-400" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Code</>}
          </button>
          <button onClick={onDone} className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:opacity-90">Done</button>
        </div>
      ) : (
        <div className="space-y-4">
          <FormField label="Amount" required>
            <input type="number" min="1000" step="1000" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 100000" className={inputCls} />
          </FormField>
          <FormField label="Recipient Name">
            <input type="text" value={recipientName} onChange={e => setRecipientName(e.target.value)}
              placeholder="Optional" className={inputCls} />
          </FormField>
          <FormField label="Recipient Email">
            <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
              placeholder="Optional" className={inputCls} />
          </FormField>
          <FormField label="Expiry Date">
            <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split('T')[0]} className={inputCls} />
          </FormField>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
            <button onClick={handleIssue} disabled={saving || !amount} className={primaryBtnCls}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Issue Card
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ─── Batch Issue Modal ────────────────────────────────────────────────────────

function BatchIssueModal({
  storeId, currency, onClose, onDone,
}: { storeId: string; currency: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [count, setCount] = useState('5')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<string[]>([])

  const handleBatch = async () => {
    const amt = parseFloat(amount)
    const cnt = parseInt(count)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!cnt || cnt < 1 || cnt > 100) { setError('Count must be 1–100'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, amount: amt, expiresAt: expiresAt || null, batch: cnt }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setResults(data.codes ?? [data.code])
      toast.success(`${data.codes?.length ?? 1} gift cards issued`)
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  if (results.length > 0) {
    return (
      <ModalShell title="Batch Issued" onClose={onDone}>
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-3)]">{results.length} cards issued for {formatCurrency(parseFloat(amount), currency)} each.</p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            {results.map(code => (
              <p key={code} className="px-3 py-1.5 font-mono text-xs font-semibold tracking-widest text-[var(--text-1)]">{code}</p>
            ))}
          </div>
          <button onClick={onDone} className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:opacity-90">Done</button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title="Batch Issue Gift Cards" onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Amount per Card" required>
          <input type="number" min="1000" step="1000" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 50000" className={inputCls} />
        </FormField>
        <FormField label="Number of Cards" required>
          <input type="number" min="1" max="100" value={count} onChange={e => setCount(e.target.value)}
            className={inputCls} />
        </FormField>
        <FormField label="Expiry Date">
          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            min={new Date().toISOString().split('T')[0]} className={inputCls} />
        </FormField>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button onClick={handleBatch} disabled={saving || !amount} className={primaryBtnCls}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Issue {count || '0'} Cards
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Balance Inquiry Modal ────────────────────────────────────────────────────

function BalanceInquiryModal({
  storeId, currency, onClose,
}: { storeId: string; currency: string; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<any>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  const check = async () => {
    const c = code.trim().toUpperCase()
    if (!c) return
    setChecking(true); setError(''); setResult(null)
    try {
      const res = await fetch(`/api/gift-cards/${c}/balance?storeId=${storeId}`)
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Card not found'); return }
      setResult(data)
    } catch { setError('Network error') } finally { setChecking(false) }
  }

  return (
    <ModalShell title="Check Gift Card Balance" onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Gift Card Code" required>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && check()}
            placeholder="ABCD1234EFGH5678"
            className={cn(inputCls, 'font-mono tracking-widest')}
          />
        </FormField>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
        {result && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-3)]">Balance</span>
              <span className="font-bold text-[var(--text-1)]">{formatCurrency(result.balance, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-3)]">Original</span>
              <span className="text-[var(--text-2)]">{formatCurrency(result.amount, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-3)]">Status</span>
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', STATUS_STYLE[result.status as GCStatus] ?? '')}>{result.status}</span>
            </div>
            {result.expiresAt && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-3)]">Expires</span>
                <span className="text-[var(--text-2)]">{formatDate(result.expiresAt)}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className={cancelBtnCls}>Close</button>
          <button onClick={check} disabled={checking || !code} className={primaryBtnCls}>
            {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Check
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
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
