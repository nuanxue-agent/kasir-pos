'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Package, Calendar, CreditCard, CheckCircle, Clock, Upload,
  Mail, Plus, Star, TrendingUp, MessageSquare, Send, ChevronDown, ChevronUp, X
} from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

interface VendorPortalClientProps {
  storeId: string
  currency?: string
}

const inputCls = 'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'
const btnPrimary = 'flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50'
const btnSecondary = 'flex items-center gap-2 bg-[var(--bg-subtle)] hover:bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-1)] text-sm px-3 py-2 rounded-xl transition-colors'

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'bg-stone-100 text-stone-600',
    SENT: 'bg-blue-100 text-blue-700',
    CONFIRMED: 'bg-amber-100 text-amber-700',
    RECEIVED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    ACCEPTED: 'bg-green-100 text-green-700',
    EXPIRED: 'bg-stone-200 text-stone-500',
  }
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', map[status] ?? 'bg-stone-100 text-stone-500')}>
      {status}
    </span>
  )
}

// ── Performance Scorecard ─────────────────────────────────────────────────────

function ScorecardBar({ label, value, max = 100, unit = '%', color = 'amber' }: {
  label: string; value: number; max?: number; unit?: string; color?: string
}) {
  const pct = Math.min(100, (value / max) * 100)
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-400',
    green: 'bg-green-400',
    blue: 'bg-blue-400',
  }
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[var(--text-2)]">
        <span>{label}</span>
        <span className="font-semibold text-[var(--text-1)]">{value.toFixed(1)}{unit}</span>
      </div>
      <div className="h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colorMap[color] ?? 'bg-amber-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function PerformanceScorecard({ supplierId, storeId }: { supplierId: string; storeId: string }) {
  const { data: pos = [] } = useQuery<any[], Error, any[]>({
    queryKey: ['vendor-pos', supplierId, storeId],
    queryFn: () =>
      fetch(`/api/suppliers/${supplierId}/purchase-orders?storeId=${storeId}`)
        .then(r => r.ok ? r.json() as Promise<any[]> : []).catch(() => [] as any[]),
  })

  const scorecard = useMemo(() => {
    if (!pos?.length) return null
    const received = pos.filter(p => p.status === 'RECEIVED')
    const onTime = received.filter(p => {
      if (!p.expectedDate || !p.updatedAt) return false
      return new Date(p.updatedAt) <= new Date(p.expectedDate)
    })
    const onTimePct = received.length ? (onTime.length / received.length) * 100 : 0
    const avgResponse = pos.filter(p => p.confirmedAt && p.createdAt).reduce((sum, p) => {
      const diff = (new Date(p.confirmedAt).getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60)
      return sum + diff
    }, 0) / Math.max(1, pos.filter(p => p.confirmedAt).length)
    const qualityRating = received.length ? 4.2 : 0 // stub: would come from GoodsReceipt QC
    return { onTimePct, avgResponseHours: avgResponse, qualityRating, totalOrders: pos.length }
  }, [pos])

  if (!scorecard) return (
    <div className="text-center py-6 text-sm text-[var(--text-2)]">Belum ada data kinerja</div>
  )

  return (
    <div className="space-y-3 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
      <h4 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-amber-500" /> Scorecard Kinerja
      </h4>
      <ScorecardBar label="On-Time Delivery" value={scorecard.onTimePct} color="green" />
      <ScorecardBar label="Quality Rating" value={scorecard.qualityRating} max={5} unit="/5" color="amber" />
      <ScorecardBar
        label="Avg. Response Time"
        value={Math.min(scorecard.avgResponseHours, 48)}
        max={48}
        unit="h"
        color="blue"
      />
      <p className="text-xs text-[var(--text-2)] pt-1">Total PO: {scorecard.totalOrders}</p>
    </div>
  )
}

// ── Invite Vendor Modal ───────────────────────────────────────────────────────

function InviteModal({ supplierId, supplierName, storeId, onClose }: {
  supplierId: string; supplierName: string; storeId: string; onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<{ link?: string; error?: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleInvite() {
    if (!email.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/invite?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json() as { error?: string; inviteLink?: string }
      if (!res.ok) throw new Error(data.error ?? 'Gagal membuat undangan')
      setResult({ link: data.inviteLink })
    } catch (e: any) {
      setResult({ error: e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-[var(--text-1)]">Undang Vendor: {supplierName}</h3>
          <button onClick={onClose} className="text-[var(--text-2)] hover:text-[var(--text-1)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        {!result ? (
          <>
            <div>
              <label className="text-xs text-[var(--text-2)] mb-1 block">Email vendor</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vendor@example.com"
                className={inputCls}
              />
            </div>
            <button onClick={handleInvite} disabled={loading || !email.trim()} className={btnPrimary}>
              <Mail className="h-4 w-4" />
              {loading ? 'Mengirim…' : 'Kirim Undangan'}
            </button>
          </>
        ) : result.error ? (
          <p className="text-sm text-red-500">{result.error}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-green-600 font-medium">✓ Undangan dibuat</p>
            <div className="bg-[var(--bg-subtle)] rounded-lg p-3 text-xs font-mono break-all text-[var(--text-2)]">
              {result.link}
            </div>
            <p className="text-xs text-[var(--text-2)]">Salin link ini dan kirim ke vendor. Berlaku 7 hari.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Message Thread ────────────────────────────────────────────────────────────

function MessageThread({ supplierId, supplierName, storeId, onClose }: {
  supplierId: string; supplierName: string; storeId: string; onClose: () => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const qc = useQueryClient()

  const { data: messages = [] } = useQuery<any[], Error, any[]>({
    queryKey: ['vendor-messages', supplierId, storeId],
    queryFn: () =>
      fetch(`/api/suppliers/${supplierId}/messages?storeId=${storeId}`)
        .then(r => r.ok ? r.json() as Promise<any[]> : []).catch(() => [] as any[]),
    refetchInterval: 15000,
  })

  async function handleSend() {
    if (!body.trim()) return
    setSending(true)
    try {
      await fetch(`/api/suppliers/${supplierId}/messages?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim() || '(tanpa judul)', body: body.trim(), direction: 'OUT' }),
      })
      setBody('')
      setSubject('')
      qc.invalidateQueries({ queryKey: ['vendor-messages', supplierId, storeId] })
    } finally {
      setSending(false)
    }
  }

  const sorted = [...messages].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col h-[80vh]">
        <div className="flex justify-between items-center p-4 border-b border-[var(--border)]">
          <h3 className="font-semibold text-[var(--text-1)] flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-amber-500" /> Pesan: {supplierName}
          </h3>
          <button onClick={onClose} className="text-[var(--text-2)] hover:text-[var(--text-1)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sorted.length === 0 ? (
            <p className="text-center text-sm text-[var(--text-2)] py-8">Belum ada pesan</p>
          ) : sorted.map(msg => (
            <div key={msg.id} className={cn('max-w-[85%] space-y-1', msg.direction === 'OUT' ? 'ml-auto' : 'mr-auto')}>
              <div className={cn(
                'rounded-xl px-3 py-2 text-sm',
                msg.direction === 'OUT'
                  ? 'bg-amber-500 text-white'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-1)]'
              )}>
                {msg.subject && msg.subject !== '(tanpa judul)' && (
                  <p className="font-semibold text-xs mb-1 opacity-80">{msg.subject}</p>
                )}
                <p>{msg.body}</p>
              </div>
              <p className={cn('text-xs text-[var(--text-2)]', msg.direction === 'OUT' ? 'text-right' : '')}>
                {msg.direction === 'IN' ? '← Vendor' : 'Anda →'} · {formatDate(msg.sentAt)}
              </p>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-[var(--border)] space-y-2">
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subjek (opsional)"
            className={inputCls}
          />
          <div className="flex gap-2">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Tulis pesan…"
              rows={2}
              className={cn(inputCls, 'resize-none flex-1')}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSend() }}
            />
            <button onClick={handleSend} disabled={sending || !body.trim()} className={cn(btnPrimary, 'self-end')}>
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Supplier Row with portal actions ─────────────────────────────────────────

function SupplierPortalRow({ supplier, storeId, currency }: { supplier: any; storeId: string; currency: string }) {
  const [expanded, setExpanded] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showMessages, setShowMessages] = useState(false)

  const { data: pos = [] } = useQuery<any[], Error, any[]>({
    queryKey: ['vendor-portal-pos', supplier.id, storeId],
    queryFn: () =>
      fetch(`/api/suppliers/${supplier.id}/purchase-orders?storeId=${storeId}`)
        .then(r => r.ok ? r.json() as Promise<any[]> : []).catch(() => [] as any[]),
    enabled: expanded,
  })

  const openPOs = pos.filter(p => ['DRAFT', 'SENT', 'CONFIRMED'].includes(p.status))
  const deliverySchedule = pos.filter(p => p.status === 'CONFIRMED' && p.expectedDate)
    .sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime())
  const paymentHistory = pos.filter(p => p.status === 'RECEIVED')

  return (
    <>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm">
              {supplier.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-[var(--text-1)] text-sm">{supplier.name}</p>
              <p className="text-xs text-[var(--text-2)]">{supplier.email ?? supplier.phone ?? 'Tidak ada kontak'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInvite(true)}
              className={btnSecondary}
              title="Undang ke Portal Vendor"
            >
              <Mail className="h-3.5 w-3.5" /> Undang
            </button>
            <button
              onClick={() => setShowMessages(true)}
              className={btnSecondary}
              title="Pesan"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Pesan
            </button>
            <button
              onClick={() => setExpanded(e => !e)}
              className={btnSecondary}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-[var(--border)] p-4 space-y-6">
            {/* Open POs */}
            <section>
              <h4 className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> PO Aktif ({openPOs.length})
              </h4>
              {openPOs.length === 0 ? (
                <p className="text-xs text-[var(--text-2)]">Tidak ada PO aktif</p>
              ) : (
                <div className="space-y-2">
                  {openPOs.map(po => (
                    <div key={po.id} className="flex items-center justify-between bg-[var(--bg-subtle)] rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-1)]">{po.number}</p>
                        <p className="text-xs text-[var(--text-2)]">{formatDate(po.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[var(--text-1)]">
                          {formatCurrency(po.total ?? 0, currency)}
                        </p>
                        <StatusBadge status={po.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Delivery Schedule */}
            <section>
              <h4 className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Jadwal Pengiriman
              </h4>
              {deliverySchedule.length === 0 ? (
                <p className="text-xs text-[var(--text-2)]">Tidak ada jadwal pengiriman</p>
              ) : (
                <div className="space-y-2">
                  {deliverySchedule.map(po => (
                    <div key={po.id} className="flex items-center justify-between bg-[var(--bg-subtle)] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        <div>
                          <p className="text-sm text-[var(--text-1)]">{po.number}</p>
                          <p className="text-xs text-[var(--text-2)]">Ekspektasi: {formatDate(po.expectedDate)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
                          onClick={() => {
                            // stub: confirm delivery date
                            alert(`Konfirmasi tanggal pengiriman untuk PO ${po.number}`)
                          }}
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> Konfirmasi
                        </button>
                        <button
                          className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1"
                          onClick={() => {
                            // stub: upload delivery note
                            alert(`Upload surat jalan untuk PO ${po.number}`)
                          }}
                        >
                          <Upload className="h-3.5 w-3.5" /> Surat Jalan
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Payment History */}
            <section>
              <h4 className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Riwayat Pembayaran
              </h4>
              {paymentHistory.length === 0 ? (
                <p className="text-xs text-[var(--text-2)]">Belum ada riwayat pembayaran</p>
              ) : (
                <div className="space-y-2">
                  {paymentHistory.slice(0, 5).map(po => (
                    <div key={po.id} className="flex items-center justify-between bg-[var(--bg-subtle)] rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm text-[var(--text-1)]">{po.number}</p>
                        <p className="text-xs text-[var(--text-2)]">{formatDate(po.updatedAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-green-600">
                          {formatCurrency(po.total ?? 0, currency)}
                        </p>
                        <StatusBadge status="RECEIVED" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Performance Scorecard */}
            <PerformanceScorecard supplierId={supplier.id} storeId={storeId} />
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          supplierId={supplier.id}
          supplierName={supplier.name}
          storeId={storeId}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showMessages && (
        <MessageThread
          supplierId={supplier.id}
          supplierName={supplier.name}
          storeId={storeId}
          onClose={() => setShowMessages(false)}
        />
      )}
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VendorPortalClient({ storeId, currency = 'IDR' }: VendorPortalClientProps) {
  const [search, setSearch] = useState('')

  const { data: suppliers = [], isLoading } = useQuery<any[]>({
    queryKey: ['suppliers-portal', storeId, search],
    queryFn: () =>
      fetch(`/api/suppliers?storeId=${storeId}${search ? `&search=${encodeURIComponent(search)}` : ''}`)
        .then(r => r.json()),
  })

  const { data: invites = [] } = useQuery<any[], Error, any[]>({
    queryKey: ['vendor-invites', storeId],
    queryFn: () =>
      fetch(`/api/suppliers/invites?storeId=${storeId}`)
        .then(r => r.ok ? r.json() as Promise<any[]> : []).catch(() => [] as any[]),
    refetchInterval: 30000,
  })

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Portal Vendor</h1>
          <p className="text-sm text-[var(--text-2)] mt-1">
            Kelola komunikasi, undangan, dan kinerja supplier
          </p>
        </div>
        {invites.filter(i => i.status === 'PENDING').length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm text-amber-700">
            <Mail className="h-4 w-4" />
            {invites.filter(i => i.status === 'PENDING').length} undangan tertunda
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari supplier…"
          className={inputCls}
        />
      </div>

      {/* Supplier list */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-[var(--text-2)]">Memuat supplier…</div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-12 text-sm text-[var(--text-2)]">
          {search ? 'Tidak ada supplier ditemukan' : 'Belum ada supplier'}
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(supplier => (
            <SupplierPortalRow
              key={supplier.id}
              supplier={supplier}
              storeId={storeId}
              currency={currency}
            />
          ))}
        </div>
      )}
    </div>
  )
}
