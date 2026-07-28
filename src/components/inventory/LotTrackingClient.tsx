'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Package,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  daysUntilExpiry,
  isExpiringWithin,
  isExpired,
  fefoSort,
  buildFefoPickPlan,
  getExpiryAlerts,
  deriveStatus,
  isValidStatusTransition,
} from '@/lib/lot-tracking'
import type { Lot, LotStatus, ExpiryAlertThreshold } from '@/lib/lot-tracking'

// Re-export pure helpers so unit tests can import from this module
export {
  daysUntilExpiry,
  isExpiringWithin,
  isExpired,
  fefoSort,
  buildFefoPickPlan,
  getExpiryAlerts,
  deriveStatus,
  isValidStatusTransition,
}
export type { Lot, LotStatus, ExpiryAlertThreshold }

// ── Types ─────────────────────────────────────────────────────────────────────

interface LotWithProduct extends Lot {
  productName?: string
  supplierName?: string
}

interface Product {
  id: string
  name: string
}

interface LotTrackingClientProps {
  storeId: string
  currency: string
  products: Product[]
}

type AlertTab = '30' | '60' | '90'

const STATUS_LABELS: Record<LotStatus, string> = {
  ACTIVE:   'Aktif',
  EXPIRED:  'Kedaluwarsa',
  DEPLETED: 'Habis',
}

const STATUS_COLORS: Record<LotStatus, string> = {
  ACTIVE:   'text-green-500',
  EXPIRED:  'text-red-500',
  DEPLETED: 'text-[var(--text-3)]',
}

// ── Add Lot Form ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  productId:   '',
  lotNumber:   '',
  expiryDate:  '',
  receivedDate: new Date().toISOString().split('T')[0],
  initialQty:  '',
  costPerUnit: '',
  supplierId:  '',
}

type FormState = typeof EMPTY_FORM

// ── Main Component ────────────────────────────────────────────────────────────

export default function LotTrackingClient({ storeId, currency, products }: LotTrackingClientProps) {
  const qc = useQueryClient()

  const [showForm, setShowForm]       = useState(false)
  const [form, setForm]               = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [statusFilter, setStatusFilter] = useState<LotStatus | ''>('')
  const [productFilter, setProductFilter] = useState('')
  const [alertTab, setAlertTab]       = useState<AlertTab>('30')
  const [expandedLot, setExpandedLot] = useState<string | null>(null)
  const [fefoProductId, setFefoProductId] = useState('')

  // ── Queries ──────────────────────────────────────────────────────────────────

  const lotsQuery = useQuery({
    queryKey: ['lots', storeId, statusFilter, productFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId })
      if (statusFilter)  sp.set('status', statusFilter)
      if (productFilter) sp.set('productId', productFilter)
      const res = await fetch(`/api/lots?${sp}`)
      if (!res.ok) throw new Error('Failed to fetch lots')
      return res.json() as Promise<LotWithProduct[]>
    },
  })

  const expiringQuery = useQuery({
    queryKey: ['lots-expiring', storeId, alertTab],
    queryFn: async () => {
      const res = await fetch(`/api/lots/expiring?storeId=${storeId}&days=${alertTab}`)
      if (!res.ok) throw new Error('Failed to fetch expiring lots')
      return res.json() as Promise<LotWithProduct[]>
    },
  })

  const fefoQuery = useQuery({
    queryKey: ['lots-fefo', storeId, fefoProductId],
    queryFn: async () => {
      if (!fefoProductId) return []
      const res = await fetch(`/api/lots/fefo?storeId=${storeId}&productId=${fefoProductId}`)
      if (!res.ok) throw new Error('Failed to fetch FEFO lots')
      return res.json() as Promise<(LotWithProduct & { daysUntilExpiry: number })[]>
    },
    enabled: !!fefoProductId,
  })

  const refetchAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['lots'] })
    qc.invalidateQueries({ queryKey: ['lots-expiring'] })
    qc.invalidateQueries({ queryKey: ['lots-fefo'] })
  }, [qc])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.productId || !form.lotNumber || !form.expiryDate || !form.receivedDate || !form.initialQty) {
      toast.error('Lengkapi semua field wajib')
      return
    }
    setSaving(true)
    try {
      const res  = await fetch(`/api/lots?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          initialQty:  parseFloat(form.initialQty),
          costPerUnit: form.costPerUnit ? parseFloat(form.costPerUnit) : 0,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Lot berhasil ditambahkan')
      setForm(EMPTY_FORM)
      setShowForm(false)
      refetchAll()
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (lot: LotWithProduct, newStatus: LotStatus) => {
    if (!isValidStatusTransition(lot.status, newStatus)) {
      toast.error(`Tidak bisa mengubah status dari ${lot.status} ke ${newStatus}`)
      return
    }
    const res  = await fetch(`/api/lots/${lot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('Status lot diperbarui')
    refetchAll()
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  const lots        = lotsQuery.data ?? []
  const expiring    = expiringQuery.data ?? []
  const fefoLots    = fefoQuery.data ?? []
  const isLoading   = lotsQuery.isLoading

  const alertCounts = {
    '30': (lotsQuery.data ?? []).filter(l => isExpiringWithin(l.expiryDate, 30)).length,
    '60': (lotsQuery.data ?? []).filter(l => isExpiringWithin(l.expiryDate, 60)).length,
    '90': (lotsQuery.data ?? []).filter(l => isExpiringWithin(l.expiryDate, 90)).length,
  }

  // Summary cards
  const activeLots   = lots.filter(l => l.status === 'ACTIVE')
  const expiredLots  = lots.filter(l => l.status === 'EXPIRED')
  const depletedLots = lots.filter(l => l.status === 'DEPLETED')
  const totalValue   = activeLots.reduce((s, l) => s + l.remainingQty * l.costPerUnit, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Lot &amp; Batch Tracking</h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">Kelola lot produk, tanggal kedaluwarsa, dan FEFO picking</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refetchAll}
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            Tambah Lot
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Lot Aktif',        value: activeLots.length,   icon: CheckCircle, color: 'text-green-500' },
          { label: 'Kedaluwarsa',      value: expiredLots.length,  icon: XCircle,     color: 'text-red-500'   },
          { label: 'Habis',            value: depletedLots.length, icon: Package,     color: 'text-[var(--text-3)]' },
          { label: 'Nilai Stok Aktif', value: null,                icon: AlertTriangle, color: 'text-yellow-500' },
        ].map((card, i) => (
          <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className={cn('mb-1', card.color)}>
              <card.icon size={18} />
            </div>
            <div className="text-xl font-bold text-[var(--text-1)]">
              {card.value !== null ? card.value : formatCurrency(totalValue, currency)}
            </div>
            <div className="text-xs text-[var(--text-3)]">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Add Lot Form */}
      {showForm && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-1)]">Tambah Lot Baru</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Produk *</label>
              <select
                value={form.productId}
                onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                required
              >
                <option value="">Pilih produk…</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Nomor Lot *</label>
              <input
                type="text"
                value={form.lotNumber}
                onChange={e => setForm(f => ({ ...f, lotNumber: e.target.value }))}
                placeholder="mis. LOT-2024-001"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Tanggal Kedaluwarsa *</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Tanggal Diterima *</label>
              <input
                type="date"
                value={form.receivedDate}
                onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Qty Awal *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.initialQty}
                onChange={e => setForm(f => ({ ...f, initialQty: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Harga per Unit</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.costPerUnit}
                onChange={e => setForm(f => ({ ...f, costPerUnit: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving && <RefreshCw size={14} className="animate-spin" />}
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expiry Alert Tabs */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-1 border-b border-[var(--border)] px-4 pt-4">
          <Clock size={16} className="mr-1 text-yellow-500" />
          <span className="text-sm font-semibold text-[var(--text-1)] mr-3">Peringatan Kedaluwarsa</span>
          {(['30', '60', '90'] as AlertTab[]).map(t => (
            <button
              key={t}
              onClick={() => setAlertTab(t)}
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                alertTab === t
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
              )}
            >
              {t} hari
              {alertCounts[t] > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                  {alertCounts[t]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="p-4">
          {expiringQuery.isLoading ? (
            <p className="text-sm text-[var(--text-3)]">Memuat…</p>
          ) : expiring.length === 0 ? (
            <p className="text-sm text-[var(--text-3)]">Tidak ada lot yang kedaluwarsa dalam {alertTab} hari ke depan.</p>
          ) : (
            <div className="space-y-2">
              {expiring.map(lot => {
                const days = daysUntilExpiry(lot.expiryDate)
                return (
                  <div
                    key={lot.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
                      days <= 7  ? 'border-red-500/30 bg-red-500/5'
                        : days <= 30 ? 'border-yellow-500/30 bg-yellow-500/5'
                        : 'border-[var(--border)] bg-[var(--bg-1)]'
                    )}
                  >
                    <div>
                      <span className="font-medium text-[var(--text-1)]">{lot.productName ?? lot.productId}</span>
                      <span className="ml-2 text-[var(--text-3)]">#{lot.lotNumber}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[var(--text-2)]">Sisa: {lot.remainingQty}</span>
                      <span className={cn(days <= 7 ? 'text-red-500 font-semibold' : 'text-yellow-500')}>
                        {days === 0 ? 'Hari ini!' : `${days} hari lagi`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* FEFO Picking Helper */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-1)]">Saran FEFO (First Expired, First Out)</h2>
        <div className="flex flex-wrap gap-3 items-start">
          <select
            value={fefoProductId}
            onChange={e => setFefoProductId(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] min-w-[200px]"
          >
            <option value="">Pilih produk untuk FEFO…</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        {fefoProductId && (
          <div className="mt-3 space-y-2">
            {fefoQuery.isLoading ? (
              <p className="text-sm text-[var(--text-3)]">Memuat…</p>
            ) : fefoLots.length === 0 ? (
              <p className="text-sm text-[var(--text-3)]">Tidak ada lot aktif untuk produk ini.</p>
            ) : (
              fefoLots.map((lot, idx) => (
                <div key={lot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] text-white font-bold">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-[var(--text-1)]">#{lot.lotNumber}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-2)]">
                    <span>Sisa: {lot.remainingQty}</span>
                    <span className={cn(
                      (lot as any).daysUntilExpiry <= 30 ? 'text-yellow-500' : 'text-[var(--text-3)]'
                    )}>
                      ED: {lot.expiryDate} ({(lot as any).daysUntilExpiry}h)
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Lot Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Daftar Lot</h2>
          <div className="ml-auto flex flex-wrap gap-2">
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5 text-xs text-[var(--text-2)]"
            >
              <option value="">Semua Produk</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as LotStatus | '')}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5 text-xs text-[var(--text-2)]"
            >
              <option value="">Semua Status</option>
              {(Object.keys(STATUS_LABELS) as LotStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--text-3)]">Memuat lot…</div>
        ) : lots.length === 0 ? (
          <div className="p-8 text-center">
            <Package size={32} className="mx-auto mb-2 text-[var(--text-3)]" />
            <p className="text-sm text-[var(--text-3)]">Belum ada lot. Tambahkan lot pertama.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {lots.map(lot => {
              const days    = daysUntilExpiry(lot.expiryDate)
              const expired = isExpired(lot.expiryDate)
              const soon    = !expired && days <= 30
              const isExpanded = expandedLot === lot.id

              return (
                <div key={lot.id} className="px-4 py-3">
                  <div
                    className="flex flex-wrap items-center gap-2 cursor-pointer"
                    onClick={() => setExpandedLot(isExpanded ? null : lot.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text-1)] text-sm truncate">
                          {lot.productName ?? lot.productId}
                        </span>
                        <span className="text-xs text-[var(--text-3)]">#{lot.lotNumber}</span>
                        <span className={cn('text-xs font-medium', STATUS_COLORS[lot.status])}>
                          {STATUS_LABELS[lot.status]}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-[var(--text-3)]">
                        <span>Sisa: <span className="text-[var(--text-2)]">{lot.remainingQty}</span> / {lot.initialQty}</span>
                        <span>
                          ED:{' '}
                          <span className={cn(
                            expired ? 'text-red-500 font-medium' : soon ? 'text-yellow-500' : 'text-[var(--text-2)]'
                          )}>
                            {lot.expiryDate}
                            {!expired && ` (${days}h)`}
                            {expired && ' — Kedaluwarsa!'}
                          </span>
                        </span>
                        {lot.costPerUnit > 0 && (
                          <span>
                            Nilai: <span className="text-[var(--text-2)]">{formatCurrency(lot.remainingQty * lot.costPerUnit, currency)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[var(--text-3)]">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div>
                          <div className="text-[var(--text-3)]">Diterima</div>
                          <div className="text-[var(--text-2)]">{lot.receivedDate}</div>
                        </div>
                        <div>
                          <div className="text-[var(--text-3)]">Harga/Unit</div>
                          <div className="text-[var(--text-2)]">{formatCurrency(lot.costPerUnit, currency)}</div>
                        </div>
                        <div>
                          <div className="text-[var(--text-3)]">Supplier</div>
                          <div className="text-[var(--text-2)]">{lot.supplierName ?? lot.supplierId ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-[var(--text-3)]">ID</div>
                          <div className="truncate font-mono text-[var(--text-3)]">{lot.id}</div>
                        </div>
                      </div>

                      {/* Status change buttons */}
                      {lot.status !== 'DEPLETED' && (
                        <div className="flex flex-wrap gap-2">
                          {lot.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleStatusChange(lot, 'EXPIRED')}
                              className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                            >
                              Tandai Kedaluwarsa
                            </button>
                          )}
                          {lot.status === 'EXPIRED' && (
                            <button
                              onClick={() => handleStatusChange(lot, 'ACTIVE')}
                              className="rounded border border-green-500/30 px-2 py-1 text-xs text-green-500 hover:bg-green-500/10"
                            >
                              Aktifkan Kembali
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
