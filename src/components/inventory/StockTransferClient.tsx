'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, CheckCircle, XCircle, Clock, Package, ChevronDown, ChevronUp, ArrowRight, Truck, AlertTriangle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Pure logic exports (used by unit tests) ─────────────────────────────────

export type TransferStatus = 'DRAFT' | 'REQUESTED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'

export function canApprove(status: TransferStatus): boolean {
  return status === 'DRAFT' || status === 'REQUESTED'
}

export function canShip(status: TransferStatus): boolean {
  return status === 'REQUESTED'
}

export function canReceive(status: TransferStatus): boolean {
  return status === 'IN_TRANSIT'
}

export function canCancel(status: TransferStatus): boolean {
  return status === 'DRAFT' || status === 'REQUESTED'
}

export function isValidTransition(from: TransferStatus, to: TransferStatus): boolean {
  const allowed: Record<TransferStatus, TransferStatus[]> = {
    DRAFT:      ['REQUESTED', 'CANCELLED'],
    REQUESTED:  ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['RECEIVED'],
    RECEIVED:   [],
    CANCELLED:  [],
  }
  return allowed[from].includes(to)
}

export function calcTotalRequestedQty(items: Array<{ requestedQty: number }>): number {
  return items.reduce((sum, i) => sum + i.requestedQty, 0)
}

export function calcTotalSentQty(items: Array<{ sentQty: number }>): number {
  return items.reduce((sum, i) => sum + (i.sentQty ?? 0), 0)
}

export function calcTotalReceivedQty(items: Array<{ receivedQty: number }>): number {
  return items.reduce((sum, i) => sum + (i.receivedQty ?? 0), 0)
}

export function calcTransferValue(
  items: Array<{ requestedQty: number; unitCost?: number }>
): number {
  return items.reduce((sum, i) => sum + i.requestedQty * (i.unitCost ?? 0), 0)
}

export function isPartialReceipt(
  items: Array<{ sentQty: number; receivedQty: number }>
): boolean {
  return items.some(i => (i.receivedQty ?? 0) < (i.sentQty ?? 0) && (i.receivedQty ?? 0) >= 0)
}

export function calcDiscrepancy(
  items: Array<{ sentQty: number; receivedQty: number }>
): number {
  return items.reduce((sum, i) => sum + ((i.sentQty ?? 0) - (i.receivedQty ?? 0)), 0)
}

export function hasDiscrepancy(
  items: Array<{ sentQty: number; receivedQty: number }>
): boolean {
  return items.some(i => (i.sentQty ?? 0) !== (i.receivedQty ?? 0))
}

export function validateTransferItems(
  items: Array<{ productId: string; requestedQty: number }>
): string | null {
  for (const item of items) {
    if (!item.productId) return 'Setiap item harus memiliki productId'
    if (isNaN(item.requestedQty) || item.requestedQty <= 0)
      return `requestedQty harus > 0 untuk produk ${item.productId}`
  }
  return null
}

export function reconcileQty(
  requestedQty: number,
  sentQty: number,
  receivedQty: number
): { shortage: number; excess: number; matched: number } {
  const matched = Math.min(sentQty, receivedQty)
  const shortage = Math.max(0, requestedQty - receivedQty)
  const excess = Math.max(0, receivedQty - requestedQty)
  return { shortage, excess, matched }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransferItem {
  id: string
  transferId: string
  productId: string
  productName?: string
  sku?: string
  requestedQty: number
  sentQty: number
  receivedQty: number
  unitCost?: number
}

interface StockTransfer {
  id: string
  fromStoreId?: string
  toStoreId?: string
  fromWarehouseId?: string
  toWarehouseId?: string
  status: TransferStatus
  requestedBy: string
  approvedBy?: string
  notes?: string
  createdAt: string
  itemCount?: number
  totalRequested?: number
}

interface Store { id: string; name: string }
interface Product { id: string; name: string; sku?: string; stock?: number }

interface StockTransferClientProps {
  storeId: string
  currency: string
  initialTransfers: StockTransfer[]
  stores: Store[]
  products: Product[]
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TransferStatus, string> = {
  DRAFT:      'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  REQUESTED:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  IN_TRANSIT: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  RECEIVED:   'bg-green-500/15 text-green-400 border-green-500/30',
  CANCELLED:  'bg-red-500/15 text-red-400 border-red-500/30',
}

const STATUS_LABELS: Record<TransferStatus, string> = {
  DRAFT:      'Draft',
  REQUESTED:  'Diminta',
  IN_TRANSIT: 'Dalam Pengiriman',
  RECEIVED:   'Diterima',
  CANCELLED:  'Dibatalkan',
}

function StatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs border font-medium', STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockTransferClient({
  storeId,
  currency,
  initialTransfers,
  stores,
  products,
}: StockTransferClientProps) {
  const [transfers, setTransfers] = useState<StockTransfer[]>(initialTransfers)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Record<string, TransferItem[]>>({})
  const [receiveModal, setReceiveModal] = useState<string | null>(null)
  const [receiveItems, setReceiveItems] = useState<Array<{ id: string; productName?: string; sentQty: number; receivedQty: string }>>([])

  // Form state
  const [formToStoreId, setFormToStoreId] = useState('')
  const [formFromWarehouseId, setFormFromWarehouseId] = useState('')
  const [formToWarehouseId, setFormToWarehouseId] = useState('')
  const [formRequestedBy, setFormRequestedBy] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<Array<{ productId: string; requestedQty: string }>>([
    { productId: '', requestedQty: '' },
  ])

  const fetchTransfers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/stock-transfers?storeId=${storeId}`)
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      setTransfers(json as StockTransfer[])
    } finally {
      setLoading(false)
    }
  }, [storeId])

  const fetchItems = async (transferId: string) => {
    if (expandedItems[transferId]) return
    const res = await fetch(`/api/stock-transfers/${transferId}/items`)
    const json = await res.json() as any
    if (!json.error) {
      setExpandedItems(prev => ({ ...prev, [transferId]: json as TransferItem[] }))
    }
  }

  const handleToggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      await fetchItems(id)
    }
  }

  const addFormItem = () => {
    setFormItems(prev => [...prev, { productId: '', requestedQty: '' }])
  }

  const removeFormItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateFormItem = (idx: number, field: string, value: string) => {
    setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const handleCreate = async () => {
    if (!formRequestedBy.trim()) { toast.error('Nama pemohon diperlukan'); return }
    if (!formToStoreId && !formToWarehouseId) { toast.error('Tujuan transfer diperlukan'); return }
    const items = formItems.map(i => ({
      productId: i.productId,
      requestedQty: parseFloat(i.requestedQty) || 0,
    }))
    const err = validateTransferItems(items)
    if (err) { toast.error(err); return }

    const res = await fetch('/api/stock-transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        toStoreId: formToStoreId || undefined,
        fromWarehouseId: formFromWarehouseId || undefined,
        toWarehouseId: formToWarehouseId || undefined,
        requestedBy: formRequestedBy,
        notes: formNotes || undefined,
        items,
      }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('Transfer stok dibuat')
    setShowForm(false)
    setFormToStoreId(''); setFormFromWarehouseId(''); setFormToWarehouseId('')
    setFormRequestedBy(''); setFormNotes('')
    setFormItems([{ productId: '', requestedQty: '' }])
    await fetchTransfers()
  }

  const handleAction = async (id: string, action: 'approve' | 'ship' | 'cancel') => {
    const res = await fetch(`/api/stock-transfers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    const labels: Record<string, string> = { approve: 'disetujui', ship: 'dikirim', cancel: 'dibatalkan' }
    toast.success(`Transfer ${labels[action]}`)
    setExpandedItems(prev => { const n = { ...prev }; delete n[id]; return n })
    await fetchTransfers()
  }

  const handleOpenReceive = async (transferId: string) => {
    const res = await fetch(`/api/stock-transfers/${transferId}/items`)
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    const items = (json as TransferItem[]).map(i => ({
      id: i.id,
      productName: i.productName,
      sentQty: i.sentQty ?? 0,
      receivedQty: String(i.sentQty ?? 0),
    }))
    setReceiveItems(items)
    setReceiveModal(transferId)
  }

  const handleReceive = async () => {
    if (!receiveModal) return
    const items = receiveItems.map(i => ({
      id: i.id,
      receivedQty: parseFloat(i.receivedQty) || 0,
    }))
    const res = await fetch(`/api/stock-transfers/${receiveModal}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'receive', items }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('Transfer diterima')
    setReceiveModal(null)
    setExpandedItems(prev => { const n = { ...prev }; delete n[receiveModal]; return n })
    await fetchTransfers()
  }

  const totalActive = transfers.filter(t => t.status === 'REQUESTED' || t.status === 'IN_TRANSIT').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Transfer Stok</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Pindahkan stok antar toko atau gudang
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTransfers}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition"
            style={{ background: 'var(--primary)' }}
          >
            <Plus size={14} />
            Buat Transfer
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {(
          [
            { label: 'Total', value: transfers.length, color: 'var(--text-1)' },
            { label: 'Aktif', value: totalActive, color: '#f59e0b' },
            { label: 'Dalam Pengiriman', value: transfers.filter(t => t.status === 'IN_TRANSIT').length, color: '#3b82f6' },
            { label: 'Diterima', value: transfers.filter(t => t.status === 'RECEIVED').length, color: '#22c55e' },
            { label: 'Dibatalkan', value: transfers.filter(t => t.status === 'CANCELLED').length, color: '#6b7280' },
          ] as const
        ).map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{label}</p>
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="font-semibold text-lg" style={{ color: 'var(--text-1)' }}>Buat Transfer Stok Baru</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Toko Tujuan</label>
              <select
                value={formToStoreId}
                onChange={e => setFormToStoreId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              >
                <option value="">-- Pilih toko tujuan --</option>
                {stores.filter(s => s.id !== storeId).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Diminta Oleh *</label>
              <input
                value={formRequestedBy}
                onChange={e => setFormRequestedBy(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                placeholder="Nama staf"
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Gudang Asal</label>
              <input
                value={formFromWarehouseId}
                onChange={e => setFormFromWarehouseId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                placeholder="ID gudang asal (opsional)"
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Gudang Tujuan</label>
              <input
                value={formToWarehouseId}
                onChange={e => setFormToWarehouseId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                placeholder="ID gudang tujuan (opsional)"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Catatan</label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                placeholder="Catatan opsional..."
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Item Transfer</h3>
              <button
                onClick={addFormItem}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              >
                <Plus size={12} /> Tambah Item
              </button>
            </div>
            <div className="space-y-2">
              {formItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-7">
                    <select
                      value={item.productId}
                      onChange={e => updateFormItem(idx, 'productId', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                    >
                      <option value="">Pilih produk...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      value={item.requestedQty}
                      onChange={e => updateFormItem(idx, 'requestedQty', e.target.value)}
                      placeholder="Qty"
                      className="w-full px-2 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                      min="1"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {formItems.length > 1 && (
                      <button
                        onClick={() => removeFormItem(idx)}
                        className="p-1 rounded text-red-400 hover:bg-red-400/10"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              Batal
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--primary)' }}
            >
              Buat Transfer
            </button>
          </div>
        </div>
      )}

      {/* Receive modal */}
      {receiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="w-full max-w-lg rounded-xl border p-6 space-y-4 mx-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <h2 className="font-semibold text-lg" style={{ color: 'var(--text-1)' }}>Konfirmasi Penerimaan</h2>
            <div className="space-y-2">
              {receiveItems.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-7 text-sm" style={{ color: 'var(--text-1)' }}>
                    {item.productName ?? item.id}
                    <span className="ml-2 text-xs" style={{ color: 'var(--text-3)' }}>
                      (dikirim: {item.sentQty})
                    </span>
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      value={item.receivedQty}
                      onChange={e => setReceiveItems(prev => prev.map((ri, i) => i === idx ? { ...ri, receivedQty: e.target.value } : ri))}
                      className="w-full px-2 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                      min="0"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setReceiveModal(null)}
                className="px-4 py-2 rounded-lg text-sm border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              >
                Batal
              </button>
              <button
                onClick={handleReceive}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--primary)' }}
              >
                Konfirmasi Terima
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer list */}
      <div className="space-y-3">
        {transfers.length === 0 && (
          <div
            className="rounded-xl border p-12 text-center"
            style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
          >
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p>Belum ada transfer stok</p>
          </div>
        )}
        {transfers.map(transfer => {
          const items = expandedItems[transfer.id] ?? []
          const isExpanded = expandedId === transfer.id

          return (
            <div
              key={transfer.id}
              className="rounded-xl border"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-3 p-4 flex-wrap">
                <button
                  onClick={() => handleToggleExpand(transfer.id)}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: 'var(--text-3)' }}
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                      #{transfer.id.slice(-8).toUpperCase()}
                    </span>
                    <StatusBadge status={transfer.status} />
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-1)' }}>
                    Diminta oleh <strong>{transfer.requestedBy}</strong>
                    {transfer.approvedBy && <> · Disetujui: <strong>{transfer.approvedBy}</strong></>}
                    {' · '}{transfer.itemCount ?? 0} item
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {new Date(transfer.createdAt).toLocaleString('id-ID')}
                    {transfer.notes && <> · {transfer.notes}</>}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {canApprove(transfer.status) && transfer.status === 'DRAFT' && (
                    <button
                      onClick={() => handleAction(transfer.id, 'approve')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: '#f59e0b' }}
                    >
                      <CheckCircle size={12} /> Setujui
                    </button>
                  )}
                  {canShip(transfer.status) && (
                    <button
                      onClick={() => handleAction(transfer.id, 'ship')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: '#3b82f6' }}
                    >
                      <Truck size={12} /> Kirim
                    </button>
                  )}
                  {canReceive(transfer.status) && (
                    <button
                      onClick={() => handleOpenReceive(transfer.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: '#22c55e' }}
                    >
                      <CheckCircle size={12} /> Terima
                    </button>
                  )}
                  {canCancel(transfer.status) && (
                    <button
                      onClick={() => handleAction(transfer.id, 'cancel')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border text-red-400"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <XCircle size={12} /> Batal
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--border)' }}>
                  {items.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>Memuat item...</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ color: 'var(--text-3)' }}>
                          <th className="text-left pb-2">Produk</th>
                          <th className="text-right pb-2">Diminta</th>
                          <th className="text-right pb-2">Dikirim</th>
                          <th className="text-right pb-2">Diterima</th>
                          <th className="text-right pb-2">Selisih</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(item => {
                          const diff = (item.receivedQty ?? 0) - (item.sentQty ?? 0)
                          return (
                            <tr key={item.id} style={{ color: 'var(--text-2)' }}>
                              <td className="py-1">
                                {item.productName ?? item.productId}
                                {item.sku && <span className="ml-1 text-xs" style={{ color: 'var(--text-3)' }}>({item.sku})</span>}
                              </td>
                              <td className="text-right py-1">{item.requestedQty}</td>
                              <td className="text-right py-1">{item.sentQty ?? '-'}</td>
                              <td className="text-right py-1">{item.receivedQty ?? '-'}</td>
                              <td className="text-right py-1">
                                {item.sentQty != null && item.receivedQty != null ? (
                                  <span style={{ color: diff < 0 ? '#ef4444' : diff > 0 ? '#f59e0b' : '#22c55e' }}>
                                    {diff > 0 ? '+' : ''}{diff}
                                  </span>
                                ) : '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
