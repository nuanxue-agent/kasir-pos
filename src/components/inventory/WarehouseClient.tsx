'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Warehouse,
  ArrowRightLeft,
  Plus,
  RefreshCw,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Truck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

export type WarehouseType = 'MAIN' | 'SATELLITE' | 'TRANSIT'
export type TransferStatus = 'PENDING' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'

export interface WarehouseRecord {
  id: string
  storeId: string
  name: string
  address?: string | null
  type: WarehouseType
  active: number
  createdAt: string
}

export interface StockEntry {
  id: string
  warehouseId: string
  productId: string
  productName?: string
  sku?: string | null
  qty: number
  minQty: number
}

export interface TransferItem {
  id: string
  transferId: string
  productId: string
  productName?: string
  sku?: string | null
  qty: number
  receivedQty?: number | null
}

export interface StockTransfer {
  id: string
  fromWarehouseId: string
  toWarehouseId: string
  fromWarehouseName?: string
  toWarehouseName?: string
  storeId: string
  status: TransferStatus
  notes?: string | null
  createdAt: string
  items: TransferItem[]
}

// ── Pure helpers (exported for tests) ────────────────────────────────────────

export const VALID_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  PENDING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
}

export function isValidTransition(from: TransferStatus, to: TransferStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}

export function detectDiscrepancies(items: TransferItem[]): TransferItem[] {
  return items.filter(
    (item) =>
      item.receivedQty !== null &&
      item.receivedQty !== undefined &&
      item.receivedQty !== item.qty,
  )
}

export function totalStockAcrossWarehouses(
  entries: StockEntry[],
  productId: string,
): number {
  return entries
    .filter((e) => e.productId === productId)
    .reduce((sum, e) => sum + e.qty, 0)
}

// ── Sub-components ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TransferStatus, { label: string; color: string; Icon: any }> = {
  PENDING:    { label: 'Menunggu',   color: 'text-amber-600 bg-amber-50 border-amber-200',  Icon: Clock },
  IN_TRANSIT: { label: 'Dikirim',    color: 'text-blue-600 bg-blue-50 border-blue-200',     Icon: Truck },
  RECEIVED:   { label: 'Diterima',   color: 'text-green-600 bg-green-50 border-green-200',  Icon: CheckCircle },
  CANCELLED:  { label: 'Dibatalkan', color: 'text-red-600 bg-red-50 border-red-200',        Icon: XCircle },
}

function StatusBadge({ status }: { status: TransferStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.color)}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

const TYPE_LABELS: Record<WarehouseType, string> = {
  MAIN:      'Utama',
  SATELLITE: 'Satelit',
  TRANSIT:   'Transit',
}
interface WarehouseClientProps {
  storeId: string
}

export default function WarehouseClient({ storeId }: WarehouseClientProps) {
  const [loading, setLoading] = useState(true)
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([])
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [activeTab, setActiveTab] = useState<'warehouses' | 'transfers'>('warehouses')
  const [showAddWarehouse, setShowAddWarehouse] = useState(false)
  const [showAddTransfer, setShowAddTransfer] = useState(false)
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null)

  // Add warehouse form
  const [newWarehouse, setNewWarehouse] = useState({ name: '', address: '', type: 'MAIN' as WarehouseType })

  // Add transfer form
  const [newTransfer, setNewTransfer] = useState({
    fromWarehouseId: '',
    toWarehouseId: '',
    notes: '',
    items: [{ productId: '', qty: 0 }],
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [whRes, trRes] = await Promise.all([
        fetch(`/api/warehouses?storeId=${storeId}`),
        fetch(`/api/stock-transfers?storeId=${storeId}`),
      ])
      const whData = (await whRes.json()) as any
      const trData = (await trRes.json()) as any
      if (whData.error) throw new Error(whData.error)
      if (trData.error) throw new Error(trData.error)
      setWarehouses(whData.warehouses ?? [])
      setTransfers(trData.transfers ?? [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAddWarehouse = async () => {
    if (!newWarehouse.name.trim()) {
      toast.error('Nama gudang wajib diisi')
      return
    }
    try {
      const res = await fetch(`/api/warehouses?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWarehouse),
      })
      const data = (await res.json()) as any
      if (data.error) throw new Error(data.error)
      toast.success('Gudang berhasil ditambahkan')
      setShowAddWarehouse(false)
      setNewWarehouse({ name: '', address: '', type: 'MAIN' })
      fetchData()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleAddTransfer = async () => {
    if (!newTransfer.fromWarehouseId || !newTransfer.toWarehouseId) {
      toast.error('Pilih gudang asal dan tujuan')
      return
    }
    if (newTransfer.fromWarehouseId === newTransfer.toWarehouseId) {
      toast.error('Gudang asal dan tujuan harus berbeda')
      return
    }
    const validItems = newTransfer.items.filter((i) => i.productId && i.qty > 0)
    if (validItems.length === 0) {
      toast.error('Tambahkan minimal 1 item dengan qty > 0')
      return
    }
    try {
      const res = await fetch(`/api/stock-transfers?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTransfer, items: validItems }),
      })
      const data = (await res.json()) as any
      if (data.error) throw new Error(data.error)
      toast.success('Transfer berhasil dibuat')
      setShowAddTransfer(false)
      setNewTransfer({ fromWarehouseId: '', toWarehouseId: '', notes: '', items: [{ productId: '', qty: 0 }] })
      fetchData()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleUpdateTransferStatus = async (transferId: string, newStatus: TransferStatus) => {
    try {
      const res = await fetch(`/api/stock-transfers/${transferId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = (await res.json()) as any
      if (data.error) throw new Error(data.error)
      toast.success(`Status diubah ke ${STATUS_CONFIG[newStatus].label}`)
      fetchData()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const activeWarehouses = warehouses.filter((w) => w.active === 1)
  const pendingCount = transfers.filter((t) => t.status === 'PENDING').length
  const inTransitCount = transfers.filter((t) => t.status === 'IN_TRANSIT').length
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Warehouse className="h-6 w-6 text-[var(--accent)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--text-1)]">Manajemen Gudang</h1>
            <p className="text-sm text-[var(--text-2)]">Kelola gudang dan transfer stok antar lokasi</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="text-xs font-medium text-[var(--text-2)] uppercase tracking-wide">Total Gudang</div>
          <div className="mt-2 text-2xl font-bold text-[var(--text-1)]">{activeWarehouses.length}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="text-xs font-medium text-[var(--text-2)] uppercase tracking-wide">Total Transfer</div>
          <div className="mt-2 text-2xl font-bold text-[var(--text-1)]">{transfers.length}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-medium text-amber-600 uppercase tracking-wide">Menunggu</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{pendingCount}</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">Dalam Pengiriman</div>
          <div className="mt-2 text-2xl font-bold text-blue-700">{inTransitCount}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {(['warehouses', 'transfers'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {tab === 'warehouses' ? (
              <><Warehouse className="inline h-4 w-4 mr-1.5" />Gudang</>
            ) : (
              <><ArrowRightLeft className="inline h-4 w-4 mr-1.5" />Transfer Stok</>
            )}
          </button>
        ))}
      </div>

      {/* Warehouses Tab */}
      {activeTab === 'warehouses' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddWarehouse(!showAddWarehouse)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Tambah Gudang
            </button>
          </div>

          {showAddWarehouse && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
              <h3 className="font-semibold text-[var(--text-1)]">Gudang Baru</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Nama gudang"
                  value={newWarehouse.name}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-1)] text-sm"
                />
                <input
                  type="text"
                  placeholder="Alamat (opsional)"
                  value={newWarehouse.address}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, address: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-1)] text-sm"
                />
                <select
                  value={newWarehouse.type}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, type: e.target.value as WarehouseType })}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-1)] text-sm"
                >
                  <option value="MAIN">Utama</option>
                  <option value="SATELLITE">Satelit</option>
                  <option value="TRANSIT">Transit</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAddWarehouse(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
                >
                  Batal
                </button>
                <button
                  onClick={handleAddWarehouse}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90"
                >
                  Simpan
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-2)]">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Memuat data...
            </div>
          ) : warehouses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-2)]">
              <Warehouse className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Belum ada gudang. Tambahkan gudang pertama Anda.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-hover)]">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">Nama</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">Tipe</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">Alamat</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((w) => (
                    <tr key={w.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-3 px-4 font-medium text-[var(--text-1)]">{w.name}</td>
                      <td className="py-3 px-4 text-[var(--text-2)]">{TYPE_LABELS[w.type]}</td>
                      <td className="py-3 px-4 text-[var(--text-2)]">{w.address ?? '-'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                          w.active ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-50 border-gray-200'
                        )}>
                          {w.active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Transfers Tab */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddTransfer(!showAddTransfer)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Buat Transfer
            </button>
          </div>

          {showAddTransfer && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-4">
              <h3 className="font-semibold text-[var(--text-1)]">Transfer Stok Baru</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Dari Gudang</label>
                  <select
                    value={newTransfer.fromWarehouseId}
                    onChange={(e) => setNewTransfer({ ...newTransfer, fromWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-1)] text-sm"
                  >
                    <option value="">Pilih gudang asal</option>
                    {activeWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Ke Gudang</label>
                  <select
                    value={newTransfer.toWarehouseId}
                    onChange={(e) => setNewTransfer({ ...newTransfer, toWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-1)] text-sm"
                  >
                    <option value="">Pilih gudang tujuan</option>
                    {activeWarehouses
                      .filter((w) => w.id !== newTransfer.fromWarehouseId)
                      .map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Catatan (opsional)</label>
                <input
                  type="text"
                  placeholder="Catatan transfer..."
                  value={newTransfer.notes}
                  onChange={(e) => setNewTransfer({ ...newTransfer, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-1)] text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[var(--text-2)]">Item Transfer</label>
                {newTransfer.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="ID Produk"
                      value={item.productId}
                      onChange={(e) => {
                        const updated = [...newTransfer.items]
                        updated[idx] = { ...updated[idx], productId: e.target.value }
                        setNewTransfer({ ...newTransfer, items: updated })
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-1)] text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      min={1}
                      value={item.qty || ''}
                      onChange={(e) => {
                        const updated = [...newTransfer.items]
                        updated[idx] = { ...updated[idx], qty: Number(e.target.value) }
                        setNewTransfer({ ...newTransfer, items: updated })
                      }}
                      className="w-24 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-1)] text-sm"
                    />
                    {newTransfer.items.length > 1 && (
                      <button
                        onClick={() => {
                          const updated = newTransfer.items.filter((_, i) => i !== idx)
                          setNewTransfer({ ...newTransfer, items: updated })
                        }}
                        className="px-2 py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 text-sm"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setNewTransfer({ ...newTransfer, items: [...newTransfer.items, { productId: '', qty: 0 }] })}
                  className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Tambah item
                </button>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAddTransfer(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
                >
                  Batal
                </button>
                <button
                  onClick={handleAddTransfer}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90"
                >
                  Buat Transfer
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-2)]">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Memuat data...
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-2)]">
              <ArrowRightLeft className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Belum ada transfer stok.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transfers.map((t) => {
                const discrepancies = detectDiscrepancies(t.items)
                const isExpanded = expandedTransferId === t.id
                const allowed = VALID_TRANSITIONS[t.status]
                return (
                  <div key={t.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                      onClick={() => setExpandedTransferId(isExpanded ? null : t.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ArrowRightLeft className="h-4 w-4 text-[var(--text-2)] shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--text-1)] text-sm truncate">
                            {t.fromWarehouseName ?? t.fromWarehouseId} &rarr; {t.toWarehouseName ?? t.toWarehouseId}
                          </div>
                          <div className="text-xs text-[var(--text-2)]">
                            {t.items.length} item &bull; {new Date(t.createdAt).toLocaleDateString('id-ID')}
                            {discrepancies.length > 0 && (
                              <span className="ml-2 text-amber-600 font-medium">{discrepancies.length} selisih</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={t.status} />
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-[var(--text-2)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-2)]" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-[var(--border)] p-4 space-y-3">
                        {t.notes && (
                          <p className="text-sm text-[var(--text-2)] italic">{t.notes}</p>
                        )}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-[var(--text-2)] uppercase tracking-wide">
                              <th className="text-left pb-2">Produk</th>
                              <th className="text-right pb-2">Dikirim</th>
                              <th className="text-right pb-2">Diterima</th>
                              <th className="text-right pb-2">Selisih</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.items.map((item) => {
                              const diff = item.receivedQty != null ? item.receivedQty - item.qty : null
                              return (
                                <tr key={item.id} className="border-t border-[var(--border)]">
                                  <td className="py-2 text-[var(--text-1)]">{item.productName ?? item.productId}</td>
                                  <td className="py-2 text-right text-[var(--text-1)]">{item.qty}</td>
                                  <td className="py-2 text-right text-[var(--text-1)]">{item.receivedQty ?? '-'}</td>
                                  <td className={cn('py-2 text-right font-medium',
                                    diff == null ? 'text-[var(--text-2)]' :
                                    diff < 0 ? 'text-red-600' :
                                    diff > 0 ? 'text-amber-600' : 'text-green-600'
                                  )}>
                                    {diff == null ? '-' : diff === 0 ? 'OK' : diff > 0 ? `+${diff}` : diff}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        {allowed.length > 0 && (
                          <div className="flex gap-2 justify-end pt-2">
                            {allowed.map((nextStatus) => (
                              <button
                                key={nextStatus}
                                onClick={() => handleUpdateTransferStatus(t.id, nextStatus)}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                                  nextStatus === 'CANCELLED'
                                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                                    : 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white',
                                )}
                              >
                                {STATUS_CONFIG[nextStatus].label}
                              </button>
                            ))}
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
      )}
    </div>
  )
}
