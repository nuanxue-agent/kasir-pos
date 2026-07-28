'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  FileX,
  Plus,
  X,
  DollarSign,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Filter,
  ChevronDown,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

export type WriteOffReason = 'EXPIRED' | 'DAMAGED' | 'LOST' | 'THEFT' | 'OBSOLETE'
export type WriteOffStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface InventoryWriteOff {
  id: string
  storeId: string
  productId: string
  productName: string
  qty: number
  reason: WriteOffReason
  costValue: number
  approvedBy: string | null
  approvedAt: string | null
  status: WriteOffStatus
  notes: string | null
  createdAt: string
  createdBy: string
}

export interface WriteOffReportRow {
  reason: WriteOffReason
  count: number
  totalQty: number
  totalValue: number
}

interface Product {
  id: string
  name: string
  cost: number
}

interface WriteOffClientProps {
  storeId: string
  currency: string
  initialWriteOffs: InventoryWriteOff[]
  products: Product[]
  isManager: boolean
  currentUser: string
}

// ── Pure Business Logic (exported for testing) ────────────────────────────────

export function calcWriteOffValue(qty: number, unitCost: number): number {
  if (qty < 0 || unitCost < 0) return 0
  return qty * unitCost
}

export function isValidStatusTransition(
  current: WriteOffStatus,
  next: WriteOffStatus
): boolean {
  if (current === 'PENDING' && (next === 'APPROVED' || next === 'REJECTED')) return true
  return false
}

export function aggregateByReason(writeOffs: InventoryWriteOff[]): WriteOffReportRow[] {
  const map: Record<string, WriteOffReportRow> = {}
  for (const wo of writeOffs) {
    if (!map[wo.reason]) {
      map[wo.reason] = { reason: wo.reason, count: 0, totalQty: 0, totalValue: 0 }
    }
    map[wo.reason].count += 1
    map[wo.reason].totalQty += wo.qty
    map[wo.reason].totalValue += wo.costValue
  }
  return Object.values(map).sort((a, b) => b.totalValue - a.totalValue)
}

export function calcApprovalThreshold(
  costValue: number,
  thresholdAmount: number
): boolean {
  return costValue >= thresholdAmount
}

export function calcStockImpact(
  writeOffs: InventoryWriteOff[],
  productId: string
): number {
  return writeOffs
    .filter(wo => wo.productId === productId && wo.status === 'APPROVED')
    .reduce((sum, wo) => sum + wo.qty, 0)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<WriteOffReason, string> = {
  EXPIRED: 'Kadaluwarsa',
  DAMAGED: 'Rusak',
  LOST: 'Hilang',
  THEFT: 'Pencurian',
  OBSOLETE: 'Usang',
}

const STATUS_LABELS: Record<WriteOffStatus, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
}

function reasonBadge(reason: WriteOffReason) {
  const colors: Record<WriteOffReason, string> = {
    EXPIRED: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    DAMAGED: 'bg-red-500/10 text-red-600 border-red-500/20',
    LOST: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
    THEFT: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    OBSOLETE: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', colors[reason])}>
      {REASON_LABELS[reason]}
    </span>
  )
}

function statusBadge(status: WriteOffStatus) {
  const colors: Record<WriteOffStatus, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
    APPROVED: 'bg-green-500/10 text-green-600 border-green-500/20',
    REJECTED: 'bg-red-500/10 text-red-600 border-red-500/20',
  }
  const icons: Record<WriteOffStatus, React.ReactNode> = {
    PENDING: <Clock className="h-3 w-3" />,
    APPROVED: <CheckCircle className="h-3 w-3" />,
    REJECTED: <XCircle className="h-3 w-3" />,
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', colors[status])}>
      {icons[status]}
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WriteOffClient({
  storeId,
  currency,
  initialWriteOffs,
  products,
  isManager,
  currentUser,
}: WriteOffClientProps) {
  const [writeOffs, setWriteOffs] = useState<InventoryWriteOff[]>(initialWriteOffs)
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<WriteOffStatus | 'ALL'>('ALL')
  const [filterReason, setFilterReason] = useState<WriteOffReason | 'ALL'>('ALL')
  const [activeTab, setActiveTab] = useState<'list' | 'report'>('list')

  const [formData, setFormData] = useState({
    productId: '',
    qty: '',
    reason: 'EXPIRED' as WriteOffReason,
    notes: '',
  })

  const fetchWriteOffs = useCallback(async () => {
    const res = await fetch(`/api/inventory-write-offs?storeId=${storeId}`)
    if (!res.ok) return
    const data = await res.json() as InventoryWriteOff[]
    setWriteOffs(data)
  }, [storeId])

  useEffect(() => { fetchWriteOffs() }, [fetchWriteOffs])

  const handleAdd = async () => {
    if (!formData.productId || !formData.qty) {
      toast.error('Pilih produk dan masukkan jumlah')
      return
    }
    setLoading(true)
    const res = await fetch(`/api/inventory-write-offs?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: formData.productId,
        qty: parseFloat(formData.qty),
        reason: formData.reason,
        notes: formData.notes || null,
      }),
    })
    const data = await res.json() as any
    if (data.error) { toast.error(data.error); setLoading(false); return }
    toast.success('Write-off berhasil dicatat')
    setShowAddForm(false)
    setFormData({ productId: '', qty: '', reason: 'EXPIRED', notes: '' })
    await fetchWriteOffs()
    setLoading(false)
  }

  const handleApprove = async (id: string) => {
    setActionLoading(id)
    const res = await fetch(`/api/inventory-write-offs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    const data = await res.json() as any
    if (data.error) { toast.error(data.error) } else { toast.success('Write-off disetujui'); await fetchWriteOffs() }
    setActionLoading(null)
  }

  const handleReject = async (id: string) => {
    setActionLoading(id)
    const res = await fetch(`/api/inventory-write-offs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    })
    const data = await res.json() as any
    if (data.error) { toast.error(data.error) } else { toast.success('Write-off ditolak'); await fetchWriteOffs() }
    setActionLoading(null)
  }

  const filtered = writeOffs.filter(wo => {
    if (filterStatus !== 'ALL' && wo.status !== filterStatus) return false
    if (filterReason !== 'ALL' && wo.reason !== filterReason) return false
    return true
  })

  const approvedWriteOffs = writeOffs.filter(wo => wo.status === 'APPROVED')
  const pendingCount = writeOffs.filter(wo => wo.status === 'PENDING').length
  const totalApprovedValue = approvedWriteOffs.reduce((s, wo) => s + wo.costValue, 0)
  const reportRows = aggregateByReason(approvedWriteOffs)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Write-Off Inventaris</h1>
          <p className="text-sm text-[var(--text-3)]">Catat dan kelola penghapusan stok rusak, kadaluwarsa, atau hilang</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Buat Write-Off
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Total Nilai Dihapus</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{formatCurrency(totalApprovedValue, currency)}</p>
            </div>
            <div className="rounded-full bg-red-500/10 p-3">
              <DollarSign className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Total Write-Off</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{approvedWriteOffs.length}</p>
            </div>
            <div className="rounded-full bg-orange-500/10 p-3">
              <Package className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Menunggu Persetujuan</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{pendingCount}</p>
            </div>
            <div className="rounded-full bg-yellow-500/10 p-3">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border)]">
        {(['list', 'report'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
            )}
          >
            {tab === 'list' ? 'Daftar Write-Off' : 'Laporan'}
          </button>
        ))}
      </div>

      {activeTab === 'list' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <Filter className="h-4 w-4 text-[var(--text-3)]" />
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as WriteOffStatus | 'ALL')}
                className="bg-transparent text-sm text-[var(--text-2)] outline-none"
              >
                <option value="ALL">Semua Status</option>
                <option value="PENDING">Menunggu</option>
                <option value="APPROVED">Disetujui</option>
                <option value="REJECTED">Ditolak</option>
              </select>
              <ChevronDown className="h-4 w-4 text-[var(--text-3)]" />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <select
                value={filterReason}
                onChange={e => setFilterReason(e.target.value as WriteOffReason | 'ALL')}
                className="bg-transparent text-sm text-[var(--text-2)] outline-none"
              >
                <option value="ALL">Semua Alasan</option>
                <option value="EXPIRED">Kadaluwarsa</option>
                <option value="DAMAGED">Rusak</option>
                <option value="LOST">Hilang</option>
                <option value="THEFT">Pencurian</option>
                <option value="OBSOLETE">Usang</option>
              </select>
              <ChevronDown className="h-4 w-4 text-[var(--text-3)]" />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Tanggal</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Produk</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Qty</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Alasan</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Nilai</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Status</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Disetujui oleh</th>
                    {isManager && <th className="px-4 py-3 font-medium text-[var(--text-3)]">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(wo => (
                    <tr key={wo.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-2)]/50">
                      <td className="px-4 py-3 text-[var(--text-2)]">
                        {new Date(wo.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">{wo.productName}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{wo.qty}</td>
                      <td className="px-4 py-3">{reasonBadge(wo.reason)}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">{formatCurrency(wo.costValue, currency)}</td>
                      <td className="px-4 py-3">{statusBadge(wo.status)}</td>
                      <td className="px-4 py-3 text-[var(--text-3)]">{wo.approvedBy ?? '—'}</td>
                      {isManager && (
                        <td className="px-4 py-3">
                          {wo.status === 'PENDING' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApprove(wo.id)}
                                disabled={actionLoading === wo.id}
                                className="rounded bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-500/20 disabled:opacity-50"
                              >
                                Setujui
                              </button>
                              <button
                                onClick={() => handleReject(wo.id)}
                                disabled={actionLoading === wo.id}
                                className="rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-50"
                              >
                                Tolak
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-12 text-center">
                  <FileX className="mx-auto h-12 w-12 text-[var(--text-3)]" />
                  <p className="mt-2 text-sm text-[var(--text-3)]">Tidak ada write-off ditemukan</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'report' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--text-1)]">Ringkasan per Alasan</h2>
            {reportRows.length === 0 ? (
              <p className="text-sm text-[var(--text-3)]">Belum ada write-off yang disetujui.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="pb-2 font-medium text-[var(--text-3)]">Alasan</th>
                    <th className="pb-2 font-medium text-[var(--text-3)]">Jumlah</th>
                    <th className="pb-2 font-medium text-[var(--text-3)]">Total Qty</th>
                    <th className="pb-2 font-medium text-[var(--text-3)]">Total Nilai</th>
                    <th className="pb-2 font-medium text-[var(--text-3)]">% Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map(row => {
                    const pct = totalApprovedValue > 0 ? (row.totalValue / totalApprovedValue) * 100 : 0
                    return (
                      <tr key={row.reason} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-3">{reasonBadge(row.reason)}</td>
                        <td className="py-3 text-[var(--text-2)]">{row.count}</td>
                        <td className="py-3 text-[var(--text-2)]">{row.totalQty}</td>
                        <td className="py-3 font-semibold text-[var(--text-1)]">{formatCurrency(row.totalValue, currency)}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--bg-2)]">
                              <div className="h-full rounded-full bg-red-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-[var(--text-3)]">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-1)]">Buat Write-Off Baru</h3>
              <button onClick={() => setShowAddForm(false)} className="rounded p-1 hover:bg-[var(--bg-2)]">
                <X className="h-5 w-5 text-[var(--text-3)]" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Produk <span className="text-red-500">*</span></label>
                <select
                  value={formData.productId}
                  onChange={e => setFormData(p => ({ ...p, productId: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--primary)]"
                >
                  <option value="">Pilih produk...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Jumlah <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formData.qty}
                  onChange={e => setFormData(p => ({ ...p, qty: e.target.value }))}
                  placeholder="0"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--primary)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Alasan <span className="text-red-500">*</span></label>
                <select
                  value={formData.reason}
                  onChange={e => setFormData(p => ({ ...p, reason: e.target.value as WriteOffReason }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--primary)]"
                >
                  <option value="EXPIRED">Kadaluwarsa</option>
                  <option value="DAMAGED">Rusak</option>
                  <option value="LOST">Hilang</option>
                  <option value="THEFT">Pencurian</option>
                  <option value="OBSOLETE">Usang</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Catatan</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder="Keterangan tambahan..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--primary)]"
                />
              </div>
              {isManager && (
                <p className="text-xs text-[var(--text-3)]">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  Sebagai manajer, write-off ini akan langsung membutuhkan persetujuan Anda.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]"
                >
                  Batal
                </button>
                <button
                  onClick={handleAdd}
                  disabled={loading}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
