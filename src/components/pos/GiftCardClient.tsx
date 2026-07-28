'use client'

import { useState, useCallback, useEffect } from 'react'
import { Gift, Plus, Search, RefreshCw, CreditCard, History, X, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { generateGiftCardCode, isValidGiftCardCode, applyGiftCardToOrder } from '@/lib/gift-cards'

export { generateGiftCardCode, isValidGiftCardCode, applyGiftCardToOrder } from '@/lib/gift-cards'

interface GiftCard {
  id: string
  storeId: string
  code: string
  balance: number
  initialBalance: number
  status: string
  expiryDate: string | null
  issuedAt: string
  issuedTo: string | null
}

interface GiftCardTransaction {
  id: string
  cardId: string
  type: string
  amount: number
  orderId: string | null
  note: string | null
  createdAt: string
}

interface GiftCardClientProps {
  storeId: string
  currency: string
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  REDEEMED: 'bg-gray-100 text-gray-600',
  EXPIRED: 'bg-red-100 text-red-600',
  DISABLED: 'bg-yellow-100 text-yellow-700',
}

const TYPE_LABELS: Record<string, string> = {
  ISSUE: 'Penerbitan',
  RELOAD: 'Isi Ulang',
  REDEEM: 'Penggunaan',
  REFUND: 'Refund',
}

type Modal = 'issue' | 'reload' | 'redeem' | 'check' | 'history' | null

export default function GiftCardClient({ storeId, currency }: GiftCardClientProps) {
  const [cards, setCards] = useState<GiftCard[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [selected, setSelected] = useState<GiftCard | null>(null)
  const [txns, setTxns] = useState<GiftCardTransaction[]>([])
  const [txnLoading, setTxnLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Form state
  const [issueAmount, setIssueAmount] = useState('')
  const [issueIssuedTo, setIssueIssuedTo] = useState('')
  const [issueExpiry, setIssueExpiry] = useState('')
  const [reloadAmount, setReloadAmount] = useState('')
  const [redeemAmount, setRedeemAmount] = useState('')
  const [checkCode, setCheckCode] = useState('')
  const [checkResult, setCheckResult] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchCards = useCallback(async () => {
    setLoading(true)
    const url = filterStatus
      ? `/api/gift-cards?storeId=${storeId}&status=${filterStatus}`
      : `/api/gift-cards?storeId=${storeId}`
    const res = await fetch(url)
    const data = await res.json() as any
    if (!data.error) setCards(data)
    setLoading(false)
  }, [storeId, filterStatus])

  useEffect(() => { fetchCards() }, [fetchCards])

  const openHistory = async (card: GiftCard) => {
    setSelected(card)
    setModal('history')
    setTxnLoading(true)
    const res = await fetch(`/api/gift-cards/${card.id}/transactions`)
    const data = await res.json() as any
    if (!data.error) setTxns(data)
    setTxnLoading(false)
  }

  const handleIssue = async () => {
    const amount = Number(issueAmount)
    if (!amount || amount <= 0) { toast.error('Nominal harus lebih dari 0'); return }
    setSubmitting(true)
    const res = await fetch(`/api/gift-cards?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, issuedTo: issueIssuedTo || null, expiryDate: issueExpiry || null }),
    })
    const data = await res.json() as any
    setSubmitting(false)
    if (data.error) { toast.error(data.error); return }
    toast.success(`Gift card diterbitkan: ${data.code}`)
    setModal(null)
    setIssueAmount(''); setIssueIssuedTo(''); setIssueExpiry('')
    fetchCards()
  }

  const handleReload = async () => {
    if (!selected) return
    const amount = Number(reloadAmount)
    if (!amount || amount <= 0) { toast.error('Nominal harus lebih dari 0'); return }
    setSubmitting(true)
    const res = await fetch(`/api/gift-cards/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'RELOAD', amount }),
    })
    const data = await res.json() as any
    setSubmitting(false)
    if (data.error) { toast.error(data.error); return }
    toast.success(`Saldo diisi: ${formatCurrency(amount, currency)}`)
    setModal(null); setReloadAmount('')
    fetchCards()
  }

  const handleRedeem = async () => {
    if (!selected) return
    const amount = Number(redeemAmount)
    if (!amount || amount <= 0) { toast.error('Nominal harus lebih dari 0'); return }
    setSubmitting(true)
    const res = await fetch(`/api/gift-cards/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'REDEEM', amount }),
    })
    const data = await res.json() as any
    setSubmitting(false)
    if (data.error) { toast.error(data.error); return }
    toast.success(`Berhasil digunakan: ${formatCurrency(data.applied, currency)}`)
    setModal(null); setRedeemAmount('')
    fetchCards()
  }

  const handleCheck = async () => {
    if (!checkCode.trim()) { toast.error('Masukkan kode gift card'); return }
    setSubmitting(true)
    const res = await fetch('/api/gift-cards/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: checkCode.trim().toUpperCase() }),
    })
    const data = await res.json() as any
    setSubmitting(false)
    if (data.error) { toast.error(data.error); setCheckResult(null); return }
    setCheckResult(data)
  }

  const filtered = cards.filter(c =>
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    (c.issuedTo ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Gift className="h-7 w-7 text-[var(--primary)]" />
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Gift Cards</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModal('check')}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-2)] transition-colors"
          >
            <Search className="h-4 w-4" /> Cek Saldo
          </button>
          <button
            onClick={() => setModal('issue')}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" /> Terbitkan
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari kode atau nama..."
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] w-56"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        >
          <option value="">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="REDEEMED">Habis</option>
          <option value="EXPIRED">Kadaluarsa</option>
          <option value="DISABLED">Nonaktif</option>
        </select>
        <button onClick={fetchCards} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2 hover:bg-[var(--bg-2)] transition-colors">
          <RefreshCw className="h-4 w-4 text-[var(--text-2)]" />
        </button>
      </div>

      {/* Cards Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-3)]">
            <Gift className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Belum ada gift card</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-2)] text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Kode</th>
                <th className="px-4 py-3 text-left">Diterbitkan Ke</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-right">Nilai Awal</th>
                <th className="px-4 py-3 text-left">Kadaluarsa</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(card => (
                <tr key={card.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-1)] transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-[var(--text-1)]">{card.code}</td>
                  <td className="px-4 py-3 text-[var(--text-2)]">{card.issuedTo ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--text-1)]">{formatCurrency(card.balance, currency)}</td>
                  <td className="px-4 py-3 text-right text-[var(--text-2)]">{formatCurrency(card.initialBalance, currency)}</td>
                  <td className="px-4 py-3 text-[var(--text-2)]">
                    {card.expiryDate ? new Date(card.expiryDate).toLocaleDateString('id-ID') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[card.status] ?? 'bg-gray-100 text-gray-600')}>
                      {card.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { setSelected(card); setModal('reload') }}
                        disabled={card.status === 'DISABLED'}
                        className="rounded px-2 py-1 text-xs text-[var(--primary)] hover:bg-[var(--bg-2)] disabled:opacity-40 transition-colors"
                      >
                        Isi Ulang
                      </button>
                      <button
                        onClick={() => { setSelected(card); setModal('redeem') }}
                        disabled={card.status !== 'ACTIVE'}
                        className="rounded px-2 py-1 text-xs text-[var(--primary)] hover:bg-[var(--bg-2)] disabled:opacity-40 transition-colors"
                      >
                        Gunakan
                      </button>
                      <button
                        onClick={() => openHistory(card)}
                        className="rounded px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Issue Modal */}
      {modal === 'issue' && (
        <ModalWrapper title="Terbitkan Gift Card" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="Nominal (Rp)">
              <input type="number" value={issueAmount} onChange={e => setIssueAmount(e.target.value)}
                placeholder="100000" className={inputCls} />
            </Field>
            <Field label="Diterbitkan Ke (opsional)">
              <input value={issueIssuedTo} onChange={e => setIssueIssuedTo(e.target.value)}
                placeholder="Nama pelanggan" className={inputCls} />
            </Field>
            <Field label="Tanggal Kadaluarsa (opsional)">
              <input type="date" value={issueExpiry} onChange={e => setIssueExpiry(e.target.value)} className={inputCls} />
            </Field>
            <ActionBar onCancel={() => setModal(null)} onConfirm={handleIssue} loading={submitting} confirmLabel="Terbitkan" />
          </div>
        </ModalWrapper>
      )}

      {/* Reload Modal */}
      {modal === 'reload' && selected && (
        <ModalWrapper title={`Isi Ulang — ${selected.code}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-2)]">Saldo saat ini: <span className="font-semibold text-[var(--text-1)]">{formatCurrency(selected.balance, currency)}</span></p>
            <Field label="Nominal Isi Ulang (Rp)">
              <input type="number" value={reloadAmount} onChange={e => setReloadAmount(e.target.value)}
                placeholder="50000" className={inputCls} />
            </Field>
            <ActionBar onCancel={() => setModal(null)} onConfirm={handleReload} loading={submitting} confirmLabel="Isi Ulang" />
          </div>
        </ModalWrapper>
      )}

      {/* Redeem Modal */}
      {modal === 'redeem' && selected && (
        <ModalWrapper title={`Gunakan — ${selected.code}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-2)]">Saldo tersedia: <span className="font-semibold text-[var(--text-1)]">{formatCurrency(selected.balance, currency)}</span></p>
            <Field label="Nominal yang Digunakan (Rp)">
              <input type="number" value={redeemAmount} onChange={e => setRedeemAmount(e.target.value)}
                placeholder="25000" className={inputCls} />
            </Field>
            <ActionBar onCancel={() => setModal(null)} onConfirm={handleRedeem} loading={submitting} confirmLabel="Gunakan" />
          </div>
        </ModalWrapper>
      )}

      {/* Check Balance Modal */}
      {modal === 'check' && (
        <ModalWrapper title="Cek Saldo Gift Card" onClose={() => { setModal(null); setCheckCode(''); setCheckResult(null) }}>
          <div className="space-y-4">
            <Field label="Kode Gift Card">
              <input value={checkCode} onChange={e => setCheckCode(e.target.value.toUpperCase())}
                placeholder="ABCD1234EFGH5678" maxLength={16} className={cn(inputCls, 'font-mono tracking-widest')} />
            </Field>
            {checkResult && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-2)]">Kode</span>
                  <span className="font-mono font-medium text-[var(--text-1)]">{checkResult.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-2)]">Saldo</span>
                  <span className="font-semibold text-[var(--text-1)]">{formatCurrency(checkResult.balance, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-2)]">Status</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[checkResult.status] ?? 'bg-gray-100 text-gray-600')}>
                    {checkResult.status}
                  </span>
                </div>
                {checkResult.expiryDate && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-2)]">Kadaluarsa</span>
                    <span className="text-[var(--text-1)]">{new Date(checkResult.expiryDate).toLocaleDateString('id-ID')}</span>
                  </div>
                )}
              </div>
            )}
            <ActionBar onCancel={() => { setModal(null); setCheckCode(''); setCheckResult(null) }} onConfirm={handleCheck} loading={submitting} confirmLabel="Cek" />
          </div>
        </ModalWrapper>
      )}

      {/* Transaction History Modal */}
      {modal === 'history' && selected && (
        <ModalWrapper title={`Riwayat — ${selected.code}`} onClose={() => setModal(null)} wide>
          {txnLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[var(--text-3)]" /></div>
          ) : txns.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-3)]">Belum ada transaksi</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-2)] text-xs uppercase">
                    <th className="px-3 py-2 text-left">Waktu</th>
                    <th className="px-3 py-2 text-left">Tipe</th>
                    <th className="px-3 py-2 text-right">Nominal</th>
                    <th className="px-3 py-2 text-left">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map(tx => (
                    <tr key={tx.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text-2)]">{new Date(tx.createdAt).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
                          tx.type === 'REDEEM' ? 'bg-red-100 text-red-600' :
                          tx.type === 'RELOAD' ? 'bg-blue-100 text-blue-700' :
                          tx.type === 'REFUND' ? 'bg-purple-100 text-purple-700' :
                          'bg-green-100 text-green-700')}>
                          {TYPE_LABELS[tx.type] ?? tx.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-[var(--text-1)]">{formatCurrency(tx.amount, currency)}</td>
                      <td className="px-3 py-2 text-[var(--text-2)]">{tx.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ModalWrapper>
      )}
    </div>
  )
}

// ─── Helper Components ────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--text-2)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function ActionBar({ onCancel, onConfirm, loading, confirmLabel }: { onCancel: () => void; onConfirm: () => void; loading: boolean; confirmLabel: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onCancel} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors">Batal</button>
      <button onClick={onConfirm} disabled={loading} className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {confirmLabel}
      </button>
    </div>
  )
}

function ModalWrapper({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={cn('rounded-2xl bg-[var(--bg-card)] shadow-xl w-full', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-semibold text-[var(--text-1)]">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--bg-2)] transition-colors">
            <X className="h-5 w-5 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
