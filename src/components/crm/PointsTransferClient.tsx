"use client"

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRight, Gift, History, Loader2, RefreshCw,
  Search, Send, User, X, TrendingUp, Users, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransferStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

export interface PointsTransfer {
  id: string
  storeId: string
  fromCustomerId: string
  toCustomerId: string
  points: number
  message: string | null
  status: TransferStatus
  createdAt: string
  fromCustomerName?: string | null
  toCustomerName?: string | null
}

export interface TransferLimits {
  dailyLimitPoints: number
  minTransferPoints: number
  usedTodayPoints: number
}

interface Customer {
  id: string
  name: string
  phone: string | null
  loyaltyPoints: number
}

interface PointsTransferClientProps {
  storeId: string
}

// ─── Pure business logic (exported for tests) ─────────────────────────────────

export function hasSufficientBalance(balance: number, amount: number): boolean {
  return balance >= amount
}

export function isAboveMinTransfer(amount: number, minTransfer: number): boolean {
  return amount >= minTransfer
}

export function isWithinDailyLimit(usedToday: number, amount: number, dailyLimit: number): boolean {
  return usedToday + amount <= dailyLimit
}

export function calcNetBalance(balance: number, sentPoints: number, receivedPoints: number): number {
  return balance - sentPoints + receivedPoints
}

export function isValidTransferStatusTransition(from: TransferStatus, to: TransferStatus): boolean {
  if (from === 'PENDING' && to === 'CANCELLED') return true
  if (from === 'PENDING' && to === 'COMPLETED') return true
  return false
}

export function aggregateTransferStats(transfers: PointsTransfer[], customerId: string) {
  let totalSent = 0
  let totalReceived = 0
  let pending = 0
  let completed = 0
  let cancelled = 0

  for (const t of transfers) {
    if (t.status !== 'CANCELLED') {
      if (t.fromCustomerId === customerId) totalSent += t.points
      if (t.toCustomerId === customerId) totalReceived += t.points
    }
    if (t.status === 'PENDING') pending++
    else if (t.status === 'COMPLETED') completed++
    else if (t.status === 'CANCELLED') cancelled++
  }

  return { totalSent, totalReceived, pending, completed, cancelled, total: transfers.length }
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TransferStatus, { label: string; color: string }> = {
  PENDING:   { label: 'Menunggu',  color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  COMPLETED: { label: 'Selesai',   color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  CANCELLED: { label: 'Dibatalkan', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
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

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className={cn('mb-3 inline-flex rounded-lg p-2', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-[var(--text-1)]">{value}</p>
      <p className="text-sm font-medium text-[var(--text-2)]">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--text-3)]">{sub}</p>}
    </div>
  )
}

// ─── New Transfer Modal ───────────────────────────────────────────────────────

function NewTransferModal({ storeId, onClose, onSuccess }: {
  storeId: string; onClose: () => void; onSuccess: () => void
}) {
  const [fromCustomerId, setFromCustomerId] = useState('')
  const [toCustomerId, setToCustomerId] = useState('')
  const [points, setPoints] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-simple', storeId],
    queryFn: () => fetch(`/api/customers?storeId=${storeId}&limit=200`).then(r => r.json()),
  })

  const { data: limits } = useQuery<TransferLimits>({
    queryKey: ['transfer-limits', storeId, fromCustomerId],
    queryFn: () =>
      fetch(`/api/points-transfers/limits?storeId=${storeId}&customerId=${fromCustomerId}`)
        .then(r => r.json()),
    enabled: !!fromCustomerId,
  })

  const fromCustomer = customers.find(c => c.id === fromCustomerId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const pts = Number(points)
    if (!fromCustomerId) { setError('Pilih pelanggan pengirim'); return }
    if (!toCustomerId)   { setError('Pilih pelanggan penerima'); return }
    if (fromCustomerId === toCustomerId) { setError('Pengirim dan penerima tidak boleh sama'); return }
    if (!pts || pts <= 0) { setError('Masukkan jumlah poin yang valid'); return }

    if (limits) {
      if (!hasSufficientBalance(fromCustomer?.loyaltyPoints ?? 0, pts)) {
        setError(`Saldo poin tidak cukup (tersedia: ${fromCustomer?.loyaltyPoints ?? 0})`); return
      }
      if (!isAboveMinTransfer(pts, limits.minTransferPoints)) {
        setError(`Minimum transfer: ${limits.minTransferPoints} poin`); return
      }
      if (!isWithinDailyLimit(limits.usedTodayPoints, pts, limits.dailyLimitPoints)) {
        const remaining = limits.dailyLimitPoints - limits.usedTodayPoints
        setError(`Melebihi batas harian. Sisa hari ini: ${remaining} poin`); return
      }
    }

    setSaving(true)
    try {
      const res = await fetch('/api/points-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, fromCustomerId, toCustomerId, points: pts, message: message.trim() || null }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal membuat transfer')
      toast.success('Transfer poin berhasil')
      onSuccess()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Transfer / Hadiah Poin" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Pengirim (From)" required>
          <select
            value={fromCustomerId}
            onChange={e => setFromCustomerId(e.target.value)}
            className={inputCls}
            required
          >
            <option value="">— Pilih pelanggan —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''} — {c.loyaltyPoints ?? 0} poin
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Penerima (To)" required>
          <select
            value={toCustomerId}
            onChange={e => setToCustomerId(e.target.value)}
            className={inputCls}
            required
          >
            <option value="">— Pilih pelanggan —</option>
            {customers
              .filter(c => c.id !== fromCustomerId)
              .map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
          </select>
        </FormField>

        <FormField label="Jumlah Poin" required>
          <input
            type="number"
            min="1"
            step="1"
            value={points}
            onChange={e => setPoints(e.target.value)}
            placeholder="Contoh: 100"
            className={inputCls}
            required
          />
          {limits && (
            <p className="mt-1 text-[10px] text-[var(--text-3)]">
              Min: {limits.minTransferPoints} poin · Batas harian: {limits.dailyLimitPoints} poin
              · Terpakai hari ini: {limits.usedTodayPoints} poin
            </p>
          )}
        </FormField>

        <FormField label="Pesan (opsional)">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Contoh: Selamat ulang tahun!"
            className={inputCls}
          />
        </FormField>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={cancelBtnCls}>Batal</button>
          <button type="submit" disabled={saving} className={primaryBtnCls}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Kirim
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── History Modal ────────────────────────────────────────────────────────────

function HistoryModal({ storeId, customerId, customerName, onClose }: {
  storeId: string; customerId: string; customerName: string; onClose: () => void
}) {
  const { data: transfers = [], isLoading } = useQuery<PointsTransfer[]>({
    queryKey: ['transfers-customer', storeId, customerId],
    queryFn: () =>
      fetch(`/api/points-transfers?storeId=${storeId}&customerId=${customerId}`)
        .then(r => r.json()),
  })

  return (
    <ModalShell title={`Riwayat Transfer — ${customerName}`} onClose={onClose} wide>
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          </div>
        ) : transfers.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--text-3)]">Belum ada riwayat transfer.</div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {transfers.map(t => {
              const isSender = t.fromCustomerId === customerId
              return (
                <div key={t.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className={cn('mt-0.5 rounded-full p-1', isSender ? 'bg-red-500/15' : 'bg-emerald-500/15')}>
                      <ArrowLeftRight className={cn('h-3 w-3', isSender ? 'text-red-400' : 'text-emerald-400')} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[var(--text-1)]">
                        {isSender
                          ? `→ ${t.toCustomerName ?? t.toCustomerId}`
                          : `← ${t.fromCustomerName ?? t.fromCustomerId}`}
                      </p>
                      {t.message && <p className="mt-0.5 text-[10px] text-[var(--text-3)]">"{t.message}"</p>}
                      <p className="text-[10px] text-stone-600">{formatDate(t.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn('text-sm font-semibold', isSender ? 'text-red-400' : 'text-emerald-400')}>
                      {isSender ? '-' : '+'}{t.points} poin
                    </p>
                    <span className={cn('inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold', STATUS_CONFIG[t.status].color)}>
                      {STATUS_CONFIG[t.status].label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)]">
          Tutup
        </button>
      </div>
    </ModalShell>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PointsTransferClient({ storeId }: PointsTransferClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showNewTransfer, setShowNewTransfer] = useState(false)
  const [historyCustomer, setHistoryCustomer] = useState<{ id: string; name: string } | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const { data: transfers = [], isLoading, refetch } = useQuery<PointsTransfer[]>({
    queryKey: ['points-transfers', storeId],
    queryFn: () => fetch(`/api/points-transfers?storeId=${storeId}`).then(r => r.json()),
  })

  const filtered = transfers.filter(t => {
    const q = search.toLowerCase()
    return !q ||
      t.fromCustomerName?.toLowerCase().includes(q) ||
      t.toCustomerName?.toLowerCase().includes(q)
  })

  async function handleCancel(id: string) {
    setCancelling(id)
    try {
      const res = await fetch(`/api/points-transfers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal membatalkan transfer')
      toast.success('Transfer dibatalkan')
      qc.invalidateQueries({ queryKey: ['points-transfers', storeId] })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setCancelling(null)
    }
  }

  // Stats
  const completed = transfers.filter(t => t.status === 'COMPLETED').length
  const pending = transfers.filter(t => t.status === 'PENDING').length
  const totalPointsMoved = transfers
    .filter(t => t.status === 'COMPLETED')
    .reduce((sum, t) => sum + t.points, 0)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15">
            <Gift className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--text-1)]">Transfer & Hadiah Poin</h1>
            <p className="text-xs text-[var(--text-3)]">Kirim poin loyalitas antar pelanggan</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text-1)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowNewTransfer(true)}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Send className="h-4 w-4" />
            Transfer Baru
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={ArrowLeftRight} label="Total Transfer" value={transfers.length} color="bg-violet-500/15 text-violet-400" />
        <StatCard icon={Clock} label="Menunggu" value={pending} color="bg-amber-500/15 text-amber-400" />
        <StatCard
          icon={TrendingUp}
          label="Selesai"
          value={completed}
          sub={`${transfers.length > 0 ? Math.round((completed / transfers.length) * 100) : 0}% dari total`}
          color="bg-emerald-500/15 text-emerald-400"
        />
        <StatCard icon={Users} label="Poin Tersalurkan" value={`${totalPointsMoved.toLocaleString()} poin`} color="bg-blue-500/15 text-blue-400" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari nama pelanggan…"
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
          <Gift className="mx-auto mb-3 h-8 w-8 text-stone-600" />
          <p className="text-sm font-medium text-[var(--text-2)]">Belum ada transfer poin</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">Klik "Transfer Baru" untuk memulai.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead>
              <tr className="bg-[var(--bg-subtle)]">
                {['Pengirim', 'Penerima', 'Poin', 'Pesan', 'Status', 'Tanggal', 'Aksi'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--bg-card)]">
              {filtered.map(t => (
                <tr key={t.id} className="group hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15">
                        <User className="h-3 w-3 text-red-400" />
                      </div>
                      <span className="text-xs font-medium text-[var(--text-1)]">
                        {t.fromCustomerName ?? t.fromCustomerId.slice(-6)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
                        <User className="h-3 w-3 text-emerald-400" />
                      </div>
                      <span className="text-xs font-medium text-[var(--text-1)]">
                        {t.toCustomerName ?? t.toCustomerId.slice(-6)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-violet-400">{t.points.toLocaleString()}</td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-xs text-[var(--text-3)]">
                    {t.message ?? <span className="italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[9px] font-semibold', STATUS_CONFIG[t.status].color)}>
                      {STATUS_CONFIG[t.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-3)]">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setHistoryCustomer({ id: t.fromCustomerId, name: t.fromCustomerName ?? 'Pelanggan' })}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-3)] hover:text-[var(--text-1)]"
                        title="Lihat riwayat"
                      >
                        <History className="h-3 w-3" />
                      </button>
                      {t.status === 'PENDING' && (
                        <button
                          onClick={() => handleCancel(t.id)}
                          disabled={cancelling === t.id}
                          className="rounded-md border border-red-500/30 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {cancelling === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Batal'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showNewTransfer && (
        <NewTransferModal
          storeId={storeId}
          onClose={() => setShowNewTransfer(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['points-transfers', storeId] })}
        />
      )}
      {historyCustomer && (
        <HistoryModal
          storeId={storeId}
          customerId={historyCustomer.id}
          customerName={historyCustomer.name}
          onClose={() => setHistoryCustomer(null)}
        />
      )}
    </div>
  )
}
