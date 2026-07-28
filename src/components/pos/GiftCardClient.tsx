'use client'

import { useState, useEffect, useCallback } from 'react'
import { Gift, Plus, Search, RefreshCw, Loader2, CheckCircle, XCircle, Clock, CreditCard, X, History } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'VOIDED'
type TxType = 'ISSUE' | 'REDEEM' | 'REFUND' | 'VOID'

interface GiftCard {
  id: string
  storeId: string
  code: string
  initialBalance: number
  currentBalance: number
  status: CardStatus
  expiresAt: string | null
  issuedTo: string | null
  issuedAt: string
  createdAt: string
  updatedAt: string
}

interface GiftCardTransaction {
  id: string
  cardId: string
  storeId: string
  type: TxType
  amount: number
  balance: number
  orderId: string | null
  createdAt: string
}

interface GiftCardClientProps {
  storeId: string
  currency: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CardStatus, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  ACTIVE:   { label: 'Active',   bg: '#dcfce7', color: '#16a34a', icon: <CheckCircle className="w-3 h-3" /> },
  REDEEMED: { label: 'Redeemed', bg: '#dbeafe', color: '#2563eb', icon: <CheckCircle className="w-3 h-3" /> },
  EXPIRED:  { label: 'Expired',  bg: '#fef3c7', color: '#d97706', icon: <Clock className="w-3 h-3" /> },
  VOIDED:   { label: 'Voided',   bg: '#fee2e2', color: '#dc2626', icon: <XCircle className="w-3 h-3" /> },
}

const TX_TYPE_LABEL: Record<TxType, string> = {
  ISSUE: 'Issued', REDEEM: 'Redeemed', REFUND: 'Refunded', VOID: 'Voided',
}

// ── QR/Barcode display (pure CSS) ─────────────────────────────────────────────

function CodeDisplay({ code }: { code: string }) {
  // Simple barcode-style visual using SVG lines derived from code characters
  const bars = code.replace(/[^A-Z0-9]/g, '').split('').map((c, i) => {
    const w = (c.charCodeAt(0) % 3) + 1
    return { w, x: i * 6, key: i }
  })
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <svg width={bars.length * 6 + 10} height={48} aria-label={`Barcode for ${code}`}>
        {bars.map(b => (
          <rect key={b.key} x={b.x + 5} y={4} width={b.w} height={40} fill="var(--text-1)" rx={0.5} />
        ))}
      </svg>
      <p className="font-mono text-base font-bold tracking-widest" style={{ color: 'var(--text-1)' }}>{code}</p>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GiftCardClient({ storeId, currency }: GiftCardClientProps) {
  const [activeTab, setActiveTab] = useState<'cards' | 'issue' | 'redeem'>('cards')
  const [cards, setCards] = useState<GiftCard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CardStatus | 'ALL'>('ALL')

  // Issue form
  const [issueForm, setIssueForm] = useState({ initialBalance: '', issuedTo: '', expiresAt: '' })
  const [issuing, setIssuing] = useState(false)
  const [issuedCard, setIssuedCard] = useState<GiftCard | null>(null)

  // Redeem form
  const [redeemForm, setRedeemForm] = useState({ code: '', amount: '' })
  const [redeeming, setRedeeming] = useState(false)

  // Transactions modal
  const [txCard, setTxCard] = useState<GiftCard | null>(null)
  const [txList, setTxList] = useState<GiftCardTransaction[]>([])
  const [loadingTx, setLoadingTx] = useState(false)

  const fetchCards = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/gift-cards?${params}`)
      const data = await res.json() as any
      if (!Array.isArray(data)) { toast.error(data.error ?? 'Failed to load'); return }
      setCards(data)
    } catch {
      toast.error('Failed to load gift cards')
    } finally {
      setLoading(false)
    }
  }, [storeId, statusFilter, search])

  useEffect(() => { fetchCards() }, [fetchCards])

  const handleIssue = async () => {
    if (!issueForm.initialBalance || Number(issueForm.initialBalance) <= 0) {
      toast.error('Initial balance must be > 0'); return
    }
    setIssuing(true)
    try {
      const res = await fetch(`/api/gift-cards?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialBalance: Number(issueForm.initialBalance),
          issuedTo: issueForm.issuedTo.trim() || null,
          expiresAt: issueForm.expiresAt || null,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`Gift card issued: ${json.code}`)
      setIssuedCard(json)
      setIssueForm({ initialBalance: '', issuedTo: '', expiresAt: '' })
      fetchCards()
    } finally {
      setIssuing(false)
    }
  }

  const handleRedeem = async () => {
    if (!redeemForm.code.trim()) { toast.error('Card code is required'); return }
    if (!redeemForm.amount || Number(redeemForm.amount) <= 0) { toast.error('Amount must be > 0'); return }
    setRedeeming(true)
    try {
      const res = await fetch(`/api/gift-cards/redeem?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemForm.code.trim(), amount: Number(redeemForm.amount) }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`Redeemed ${formatCurrency(json.amountRedeemed, currency)} — Balance left: ${formatCurrency(json.remainingBalance, currency)}`)
      setRedeemForm({ code: '', amount: '' })
      fetchCards()
    } finally {
      setRedeeming(false)
    }
  }

  const openTx = async (card: GiftCard) => {
    setTxCard(card)
    setLoadingTx(true)
    try {
      const res = await fetch(`/api/gift-cards/${card.id}/transactions`)
      const data = await res.json() as any
      setTxList(Array.isArray(data) ? data : [])
    } catch {
      setTxList([])
    } finally {
      setLoadingTx(false)
    }
  }

  const handleVoid = async (card: GiftCard) => {
    if (!confirm(`Void gift card ${card.code}? This cannot be undone.`)) return
    const res = await fetch(`/api/gift-cards/${card.id}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'VOID' }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('Gift card voided')
    fetchCards()
  }

  const filteredCards = cards.filter(c =>
    statusFilter === 'ALL' || c.status === statusFilter
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            <Gift className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            Gift Cards
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Issue and redeem gift cards for your store</p>
        </div>
        <button onClick={fetchCards} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-2)' }}>
        {(['cards', 'issue', 'redeem'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn('px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize', activeTab === tab ? 'shadow-sm' : '')}
            style={activeTab === tab ? { background: 'var(--bg-card)', color: 'var(--text-1)' } : { color: 'var(--text-3)' }}
          >
            {tab === 'cards' ? 'All Cards' : tab === 'issue' ? 'Issue Card' : 'Redeem'}
          </button>
        ))}
      </div>

      {/* ── Cards Tab ── */}
      {activeTab === 'cards' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-3)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchCards()}
                placeholder="Search by code or name..."
                className="w-full rounded-lg pl-9 pr-3 py-2 text-sm border outline-none"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as CardStatus | 'ALL')}
              className="rounded-lg px-3 py-2 text-sm border outline-none"
              style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              <option value="ALL">All Statuses</option>
              {(Object.keys(STATUS_CONFIG) as CardStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>

          {/* Cards table */}
          {loading ? (
            <div className="flex items-center justify-center min-h-48">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--bg-2)' }}>
                  <tr>
                    {['Code', 'Balance', 'Initial', 'Issued To', 'Expires', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCards.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>No gift cards found</td></tr>
                  ) : filteredCards.map((card, i) => {
                    const sc = STATUS_CONFIG[card.status]
                    return (
                      <tr key={card.id} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-1)', borderTop: '1px solid var(--border)' }}>
                        <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--text-1)' }}>{card.code}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: 'var(--primary)' }}>{formatCurrency(card.currentBalance, currency)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{formatCurrency(card.initialBalance, currency)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{card.issuedTo ?? '—'}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>
                          {card.expiresAt ? new Date(card.expiresAt).toLocaleDateString('id-ID') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: sc.bg, color: sc.color }}>
                            {sc.icon}{sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openTx(card)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs border"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                              title="View transactions"
                            >
                              <History className="w-3 h-3" /> History
                            </button>
                            {card.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleVoid(card)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                                style={{ background: '#fee2e2', color: '#dc2626' }}
                                title="Void card"
                              >
                                <XCircle className="w-3 h-3" /> Void
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Issue Tab ── */}
      {activeTab === 'issue' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <Plus className="w-4 h-4" style={{ color: 'var(--primary)' }} /> Issue New Gift Card
            </h2>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Initial Balance *</label>
              <input
                type="number"
                value={issueForm.initialBalance}
                onChange={e => setIssueForm(f => ({ ...f, initialBalance: e.target.value }))}
                placeholder="e.g. 100000"
                className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Issued To (optional)</label>
              <input
                type="text"
                value={issueForm.issuedTo}
                onChange={e => setIssueForm(f => ({ ...f, issuedTo: e.target.value }))}
                placeholder="Customer name or phone"
                className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Expiry Date (optional)</label>
              <input
                type="date"
                value={issueForm.expiresAt}
                onChange={e => setIssueForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <button
              onClick={handleIssue}
              disabled={issuing}
              className="w-full rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
              {issuing ? 'Issuing...' : 'Issue Gift Card'}
            </button>
          </div>

          {/* Issued card preview */}
          {issuedCard && (
            <div className="rounded-xl p-6 space-y-3" style={{ background: 'var(--bg-card)', border: '2px solid var(--primary)' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>Card Issued</h3>
                <button onClick={() => setIssuedCard(null)}><X className="w-4 h-4" style={{ color: 'var(--text-3)' }} /></button>
              </div>
              <CodeDisplay code={issuedCard.code} />
              <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--bg-2)' }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-3)' }}>Balance</span>
                  <span className="font-bold" style={{ color: 'var(--primary)' }}>{formatCurrency(issuedCard.initialBalance, currency)}</span>
                </div>
                {issuedCard.issuedTo && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-3)' }}>Issued To</span>
                    <span style={{ color: 'var(--text-1)' }}>{issuedCard.issuedTo}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-3)' }}>Status</span>
                  <span className="font-medium" style={{ color: '#16a34a' }}>Active</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Redeem Tab ── */}
      {activeTab === 'redeem' && (
        <div className="max-w-md space-y-4">
          <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <CreditCard className="w-4 h-4" style={{ color: 'var(--primary)' }} /> Redeem Gift Card
            </h2>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Card Code *</label>
              <input
                type="text"
                value={redeemForm.code}
                onChange={e => setRedeemForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="GC-XXXX-XXXX-XXXX"
                className="w-full rounded-lg px-3 py-2 text-sm border outline-none font-mono tracking-widest"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Redemption Amount *</label>
              <input
                type="number"
                value={redeemForm.amount}
                onChange={e => setRedeemForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 50000"
                className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <button
              onClick={handleRedeem}
              disabled={redeeming}
              className="w-full rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {redeeming ? 'Processing...' : 'Redeem Card'}
            </button>
          </div>
        </div>
      )}

      {/* ── Transactions Modal ── */}
      {txCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="sticky top-0 flex items-center justify-between px-5 py-4" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>Transaction History</h3>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-3)' }}>{txCard.code}</p>
              </div>
              <button onClick={() => setTxCard(null)}><X className="w-5 h-5" style={{ color: 'var(--text-3)' }} /></button>
            </div>
            <div className="p-5 space-y-2">
              {loadingTx ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--primary)' }} /></div>
              ) : txList.length === 0 ? (
                <p className="text-center text-sm py-8" style={{ color: 'var(--text-3)' }}>No transactions</p>
              ) : txList.map(tx => (
                <div key={tx.id} className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: 'var(--bg-2)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{TX_TYPE_LABEL[tx.type]}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{new Date(tx.createdAt).toLocaleString('id-ID')}</p>
                    {tx.orderId && <p className="text-xs" style={{ color: 'var(--text-3)' }}>Order: {tx.orderId}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{ color: tx.type === 'ISSUE' || tx.type === 'REFUND' ? '#16a34a' : '#dc2626' }}>
                      {tx.type === 'ISSUE' || tx.type === 'REFUND' ? '+' : '-'}{formatCurrency(tx.amount, currency)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>Bal: {formatCurrency(tx.balance, currency)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
