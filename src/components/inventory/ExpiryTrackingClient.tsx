'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle, Clock, Plus, X, Package } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { type ExpiryStatus, getExpiryStatus } from '@/lib/inventory-costing'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpiryBatch {
  id: string
  storeId: string
  productId: string
  batchNumber: string
  expiryDate: string
  qty: number
  costPerUnit: number
  productName?: string
}

interface Product {
  id: string
  name: string
  sku?: string | null
}

interface ExpiryTrackingClientProps {
  storeId: string
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ExpiryStatus, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  EXPIRED: {
    label: 'Expired',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
  },
  EXPIRING_SOON: {
    label: 'Expiring Soon',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: <Clock className="h-4 w-4 text-amber-500" />,
  },
  OK: {
    label: 'OK',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: <CheckCircle className="h-4 w-4 text-green-500" />,
  },
}

function StatusBadge({ status }: { status: ExpiryStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.bg, cfg.text, 'border', cfg.border)}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr)
  exp.setHours(0, 0, 0, 0)
  return Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Add Batch Form ────────────────────────────────────────────────────────────

interface AddBatchFormProps {
  storeId: string
  products: Product[]
  onAdded: () => void
  onClose: () => void
}

function AddBatchForm({ storeId, products, onAdded, onClose }: AddBatchFormProps) {
  const [form, setForm] = useState({
    productId: '',
    batchNumber: '',
    expiryDate: '',
    qty: '',
    costPerUnit: '',
  })
  const [saving, setSaving] = useState(false)

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.productId || !form.batchNumber || !form.expiryDate || !form.qty || !form.costPerUnit) {
      toast.error('Semua field wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/inventory/expiry-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productId: form.productId,
          batchNumber: form.batchNumber,
          expiryDate: form.expiryDate,
          qty: Number(form.qty),
          costPerUnit: Number(form.costPerUnit),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error ?? 'Failed to add batch')
      }
      toast.success('Batch berhasil ditambahkan')
      onAdded()
    } catch (err: any) {
      toast.error(err.message ?? 'Gagal menambahkan batch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--text-1)]">Tambah Batch Baru</h2>
          <button onClick={onClose} aria-label="Tutup" className="rounded-lg p-1 text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* Product */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Produk</label>
            <select
              value={form.productId}
              onChange={e => set('productId', e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            >
              <option value="">Pilih produk…</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
              ))}
            </select>
          </div>
          {/* Batch number */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Nomor Batch</label>
            <input
              type="text"
              value={form.batchNumber}
              onChange={e => set('batchNumber', e.target.value)}
              placeholder="cth. BATCH-2024-001"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          {/* Expiry date */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Tanggal Kadaluarsa</label>
            <input
              type="date"
              value={form.expiryDate}
              onChange={e => set('expiryDate', e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          {/* Qty & cost row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Jumlah</label>
              <input
                type="number"
                min="1"
                value={form.qty}
                onChange={e => set('qty', e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Harga Pokok/unit</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.costPerUnit}
                onChange={e => set('costPerUnit', e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Menyimpan…' : 'Simpan Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExpiryTrackingClient({ storeId }: ExpiryTrackingClientProps) {
  const [batches, setBatches] = useState<ExpiryBatch[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState<ExpiryStatus | 'ALL'>('ALL')
  const [alertDismissed, setAlertDismissed] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, productRes] = await Promise.all([
        fetch(`/api/inventory/expiry-batches?storeId=${storeId}`),
        fetch(`/api/products?storeId=${storeId}&limit=500`),
      ])
      if (batchRes.ok) {
        const data = await batchRes.json() as { batches?: ExpiryBatch[] } | ExpiryBatch[]
        setBatches((data as { batches?: ExpiryBatch[] }).batches ?? (data as ExpiryBatch[]) ?? [])
      }
      if (productRes.ok) {
        const data = await productRes.json() as { products?: any[] } | any[]
        setProducts((data as { products?: any[] }).products ?? (data as any[]) ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-alert for expired batches
  useEffect(() => {
    if (alertDismissed) return
    const expired = batches.filter(b => getExpiryStatus(b.expiryDate) === 'EXPIRED')
    if (expired.length > 0) {
      toast.error(`${expired.length} batch sudah kadaluarsa! Segera tangani.`)
      setAlertDismissed(true)
    }
  }, [batches, alertDismissed])

  const batchesWithStatus = batches.map(b => ({
    ...b,
    status: getExpiryStatus(b.expiryDate) as ExpiryStatus,
    daysLeft: daysUntil(b.expiryDate),
  }))

  const filtered = filterStatus === 'ALL'
    ? batchesWithStatus
    : batchesWithStatus.filter(b => b.status === filterStatus)

  const expiredCount = batchesWithStatus.filter(b => b.status === 'EXPIRED').length
  const soonCount = batchesWithStatus.filter(b => b.status === 'EXPIRING_SOON').length

  // Build product name map
  const productMap = Object.fromEntries(products.map(p => [p.id, p]))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-1)]">Pelacakan Kadaluarsa</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">Kelola batch produk dan tanggal kadaluarsa</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Tambah Batch
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-1)]">{batches.length}</p>
              <p className="text-xs text-[var(--text-3)]">Total Batch</p>
            </div>
          </div>
        </div>
        <div className={cn('rounded-xl border p-4 shadow-sm', expiredCount > 0 ? 'border-red-200 bg-red-50' : 'border-[var(--border)] bg-[var(--bg-card)]')}>
          <div className="flex items-center gap-3">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', expiredCount > 0 ? 'bg-red-100' : 'bg-[var(--bg-subtle)]')}>
              <AlertTriangle className={cn('h-5 w-5', expiredCount > 0 ? 'text-red-600' : 'text-[var(--text-3)]')} />
            </div>
            <div>
              <p className={cn('text-2xl font-bold', expiredCount > 0 ? 'text-red-700' : 'text-[var(--text-1)]')}>{expiredCount}</p>
              <p className="text-xs text-[var(--text-3)]">Kadaluarsa</p>
            </div>
          </div>
        </div>
        <div className={cn('rounded-xl border p-4 shadow-sm', soonCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-[var(--border)] bg-[var(--bg-card)]')}>
          <div className="flex items-center gap-3">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', soonCount > 0 ? 'bg-amber-100' : 'bg-[var(--bg-subtle)]')}>
              <Clock className={cn('h-5 w-5', soonCount > 0 ? 'text-amber-600' : 'text-[var(--text-3)]')} />
            </div>
            <div>
              <p className={cn('text-2xl font-bold', soonCount > 0 ? 'text-amber-700' : 'text-[var(--text-1)]')}>{soonCount}</p>
              <p className="text-xs text-[var(--text-3)]">Segera Kadaluarsa</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {(['ALL', 'EXPIRED', 'EXPIRING_SOON', 'OK'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              filterStatus === s
                ? 'bg-blue-600 text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-muted)]',
            )}
          >
            {s === 'ALL' ? 'Semua' : s === 'EXPIRED' ? 'Kadaluarsa' : s === 'EXPIRING_SOON' ? 'Segera Kadaluarsa' : 'OK'}
          </button>
        ))}
      </div>

      {/* Batch table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--text-3)]">Memuat data batch…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-[var(--text-3)]">Belum ada batch{filterStatus !== 'ALL' ? ' dengan status ini' : ''}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)] text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
                  <th className="px-4 py-3 text-left">Produk</th>
                  <th className="px-4 py-3 text-left">No. Batch</th>
                  <th className="px-4 py-3 text-left">Tgl Kadaluarsa</th>
                  <th className="px-4 py-3 text-right">Stok</th>
                  <th className="px-4 py-3 text-right">HPP/Unit</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(b => {
                  const product = productMap[b.productId]
                  const name = b.productName ?? product?.name ?? b.productId
                  return (
                    <tr
                      key={b.id}
                      className={cn(
                        'transition-colors hover:bg-[var(--bg-subtle)]/80',
                        b.status === 'EXPIRED' && 'bg-red-50/40',
                        b.status === 'EXPIRING_SOON' && 'bg-amber-50/40',
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">{name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-2)]">{b.batchNumber}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">
                        <div>{b.expiryDate}</div>
                        <div className={cn('text-xs', b.daysLeft < 0 ? 'text-red-500' : b.daysLeft <= 30 ? 'text-amber-500' : 'text-[var(--text-3)]')}>
                          {b.daysLeft < 0 ? `${Math.abs(b.daysLeft)} hari lalu` : b.daysLeft === 0 ? 'Hari ini' : `${b.daysLeft} hari lagi`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-1)]">{b.qty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-2)]">{formatCurrency(b.costPerUnit)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add batch modal */}
      {showAddForm && (
        <AddBatchForm
          storeId={storeId}
          products={products}
          onAdded={() => { setShowAddForm(false); loadData() }}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}
