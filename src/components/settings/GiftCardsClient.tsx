'use client'

import { useState, useEffect, useCallback } from 'react'
import { Gift, Plus, Loader2, X, RefreshCw, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GiftCard {
  id: string
  code: string
  balance: number
  originalBalance: number
  expiresAt: string | null
  status: 'ACTIVE' | 'USED' | 'EXPIRED'
  issuedTo: string | null
  customerName: string | null
  createdAt: string
}

interface Customer {
  id: string
  name: string
  phone: string | null
}

interface GiftCardsClientProps {
  storeId: string
  currency?: string
}

function fmt(n: number, currency = 'IDR') {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(n)
}

function statusBadge(status: GiftCard['status']) {
  const map = {
    ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    USED: 'bg-stone-500/15 text-stone-400 border-stone-500/30',
    EXPIRED: 'bg-red-500/15 text-red-400 border-red-500/30',
  }
  return map[status]
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GiftCardsClient({ storeId, currency = 'IDR' }: GiftCardsClientProps) {
  const [cards, setCards] = useState<GiftCard[]>([])
  const [loading, setLoading] = useState(true)
  const [showIssue, setShowIssue] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/gift-cards?storeId=${storeId}`)
      if (res.ok) {
        const data = (await res.json()) as GiftCard[]
        setCards(data)
      }
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    load()
  }, [load])

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch {
      // clipboard not available
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Gift Cards</h3>
          {!loading && (
            <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-3)]">
              {cards.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-1.5 text-[var(--text-3)] transition-colors hover:text-[var(--text-2)] disabled:opacity-40"
            aria-label="Refresh gift cards"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowIssue(true)}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Issue Gift Card
          </button>
        </div>
      </div>

      {/* Cards list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-3)]" />
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-10 text-center">
          <Gift className="mx-auto mb-2 h-8 w-8 text-[var(--text-3)] opacity-40" />
          <p className="text-sm text-[var(--text-3)]">No gift cards issued yet</p>
          <button
            onClick={() => setShowIssue(true)}
            className="mt-3 text-xs font-medium text-violet-400 transition-colors hover:text-violet-300"
          >
            Issue your first gift card →
          </button>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
          {cards.map(card => (
            <div key={card.id} className="flex items-center gap-4 bg-[var(--bg-card)] px-4 py-3">
              {/* Code + copy */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold tracking-widest text-[var(--text-1)]">
                    {card.code}
                  </span>
                  <button
                    onClick={() => copyCode(card.code)}
                    className="text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
                    aria-label={`Copy code ${card.code}`}
                  >
                    {copiedCode === card.code ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--text-3)]">
                  {card.customerName ? `Issued to ${card.customerName}` : 'Walk-in'}
                  {card.expiresAt && (
                    <span className="ml-2">
                      · Expires {new Date(card.expiresAt).toLocaleDateString('id-ID')}
                    </span>
                  )}
                </p>
              </div>

              {/* Balance */}
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {fmt(card.balance, currency)}
                </p>
                {card.balance !== card.originalBalance && (
                  <p className="text-[10px] text-[var(--text-3)]">
                    of {fmt(card.originalBalance, currency)}
                  </p>
                )}
              </div>

              {/* Status badge */}
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize',
                  statusBadge(card.status),
                )}
              >
                {card.status.toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Issue Gift Card modal */}
      {showIssue && (
        <IssueGiftCardModal
          storeId={storeId}
          currency={currency}
          onClose={() => setShowIssue(false)}
          onIssued={() => {
            setShowIssue(false)
            load()
          }}
        />
      )}
    </div>
  )
}

// ─── Issue Gift Card Modal ────────────────────────────────────────────────────

function IssueGiftCardModal({
  storeId,
  currency,
  onClose,
  onIssued,
}: {
  storeId: string
  currency: string
  onClose: () => void
  onIssued: () => void
}) {
  const [balance, setBalance] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [issued, setIssued] = useState<{ code: string; balance: number } | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  // Debounced customer search
  useEffect(() => {
    if (!customerQuery.trim()) {
      setCustomers([])
      return
    }
    const timer = setTimeout(async () => {
      setLoadingCustomers(true)
      try {
        const res = await fetch(
          `/api/customers?storeId=${storeId}&q=${encodeURIComponent(customerQuery)}&limit=5`,
        )
        if (res.ok) {
          const data = (await res.json()) as any
          setCustomers(Array.isArray(data) ? data : (data.customers ?? []))
        }
      } finally {
        setLoadingCustomers(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerQuery, storeId])

  const handleIssue = async () => {
    const amt = parseFloat(balance)
    if (!amt || amt <= 0) {
      setError('Please enter a valid balance amount')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          balance: amt,
          expiresAt: expiresAt || null,
          issuedTo: selectedCustomer?.id ?? null,
        }),
      })
      const data = (await res.json()) as any
      if (!res.ok) {
        setError(data.error || 'Failed to issue gift card')
        return
      }
      setIssued({ code: data.code, balance: data.balance })
      toast.success(`Gift card issued: ${data.code}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const copyIssuedCode = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Issue Gift Card</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {issued ? (
          /* Success state */
          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-center">
              <Gift className="mx-auto mb-2 h-8 w-8 text-violet-400" />
              <p className="mb-1 text-xs text-[var(--text-3)]">Gift card issued!</p>
              <p className="font-mono text-lg font-bold tracking-widest text-[var(--text-1)]">
                {issued.code}
              </p>
              <p className="mt-1 text-sm text-violet-400">{fmt(issued.balance, currency)}</p>
            </div>
            <button
              onClick={copyIssuedCode}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
            >
              {copiedCode ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy Code
                </>
              )}
            </button>
            <button
              onClick={onIssued}
              className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </div>
        ) : (
          /* Form state */
          <div className="space-y-4 p-5">
            {/* Balance */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Balance Amount <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                placeholder="e.g. 100000"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 focus:outline-none"
              />
            </div>

            {/* Expiry */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Expiry Date <span className="text-[var(--text-3)]">(optional)</span>
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 focus:outline-none"
              />
            </div>

            {/* Customer (optional) */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Issued To <span className="text-[var(--text-3)]">(optional)</span>
              </label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
                  <p className="text-sm text-[var(--text-1)]">{selectedCustomer.name}</p>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="text-[var(--text-3)] transition-colors hover:text-red-400"
                    aria-label="Remove customer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={customerQuery}
                    onChange={e => setCustomerQuery(e.target.value)}
                    placeholder="Search customer name or phone…"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-violet-500/60 focus:outline-none"
                  />
                  {(loadingCustomers || customers.length > 0) && (
                    <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-lg">
                      {loadingCustomers ? (
                        <div className="flex justify-center py-3">
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--text-3)]" />
                        </div>
                      ) : (
                        customers.map(c => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c)
                              setCustomerQuery('')
                              setCustomers([])
                            }}
                            className="flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-2 text-left text-sm transition-colors first:border-t-0 hover:bg-[var(--bg-subtle)]"
                          >
                            <span className="font-medium text-[var(--text-1)]">{c.name}</span>
                            {c.phone && (
                              <span className="text-xs text-[var(--text-3)]">{c.phone}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
              >
                Cancel
              </button>
              <button
                onClick={handleIssue}
                disabled={saving || !balance}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Issue Card
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
