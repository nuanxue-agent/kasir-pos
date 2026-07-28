'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, CheckCircle, XCircle, Clock, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Pure logic exports (used by unit tests) ─────────────────────────────────

export type POStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED'
export type ReceiptStatus = 'PENDING' | 'INSPECTING' | 'ACCEPTED' | 'REJECTED' | 'PARTIAL'

export function calcVariance(orderedQty: number, receivedQty: number): number {
  return receivedQty - orderedQty
}

export function calcVariancePct(orderedQty: number, receivedQty: number): number {
  if (orderedQty === 0) return 0
  return ((receivedQty - orderedQty) / orderedQty) * 100
}

export function isPartialReceipt(items: Array<{ orderedQty: number; receivedQty: number }>): boolean {
  return items.some(i => i.receivedQty < i.orderedQty && i.receivedQty >= 0)
}

export function calcTotalCost(items: Array<{ receivedQty: number; unitCost: number }>): number {
  return items.reduce((sum, i) => sum + i.receivedQty * i.unitCost, 0)
}

export function calcCostPerUnit(totalCost: number, totalQty: number): number {
  if (totalQty === 0) return 0
  return totalCost / totalQty
}

export function canReceive(status: POStatus): boolean {
  return status === 'SENT' || status === 'CONFIRMED'
}

export function calcNewStock(currentStock: number, receivedQty: number): number {
  return currentStock + receivedQty
}

export function validateReceiveItems(
  items: Array<{ receivedQty: number; unitCost: number; productId: string }>,
): string | null {
  for (const item of items) {
    if (!item.productId) return 'productId diperlukan'
    if (isNaN(item.receivedQty) || item.receivedQty < 0)
      return `receivedQty tidak valid untuk produk ${item.productId}`
    if (item.unitCost < 0)
      return `unitCost tidak boleh negatif untuk produk ${item.productId}`
  }
  const hasPositive = items.some(i => i.receivedQty > 0)
  if (!hasPositive) return 'Minimal 1 item dengan receivedQty > 0'
  return null
}

export function isPOFullyReceived(
  lines: Array<{ qty: number; receivedQty: number }>,
): boolean {
  return lines.length > 0 && lines.every(l => l.receivedQty >= l.qty)
}

export function calcAcceptanceRate(acceptedQty: number, receivedQty: number): number {
  if (receivedQty === 0) return 0
  return Math.round((acceptedQty / receivedQty) * 100)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptItem {
  id: string
  receiptId: string
  productId: string
  productName?: string
  sku?: string
  orderedQty: number
  receivedQty: number
  acceptedQty: number
  rejectedQty: number
  unitCost: number
  rejectionReason?: string
  inspectionNotes?: string
}

interface Receipt {
  id: string
  storeId: string
  purchaseOrderId?: string
  receivedBy: string
  receivedAt: string
  status: ReceiptStatus
  notes?: string
  itemCount?: number
  totalAccepted?: number
  totalRejected?: number
  items?: ReceiptItem[]
}

interface Product {
  id: string
  name: string
  sku?: string
  stock?: number
}

interface GoodsReceiptClientProps {
  storeId: string
  currency: string
  initialReceipts: Receipt[]
  products: Product[]
}

// ─── Status badge helper ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<ReceiptStatus, string> = {
  PENDING:    'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  INSPECTING: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  ACCEPTED:   'bg-green-500/15 text-green-400 border-green-500/30',
  REJECTED:   'bg-red-500/15 text-red-400 border-red-500/30',
  PARTIAL:    'bg-orange-500/15 text-orange-400 border-orange-500/30',
}

const STATUS_LABELS: Record<ReceiptStatus, string> = {
  PENDING:    'Menunggu',
  INSPECTING: 'Inspeksi',
  ACCEPTED:   'Diterima',
  REJECTED:   'Ditolak',
  PARTIAL:    'Sebagian',
}

function StatusBadge({ status }: { status: ReceiptStatus }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs border font-medium', STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GoodsReceiptClient({
  storeId,
  currency,
  initialReceipts,
  products,
}: GoodsReceiptClientProps) {
  const [receipts, setReceipts] = useState<Receipt[]>(initialReceipts)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Record<string, ReceiptItem[]>>({})
  const [inspectReceiptId, setInspectReceiptId] = useState<string | null>(null)

  // New receipt form state
  const [formReceivedBy, setFormReceivedBy] = useState('')
  const [formPOId, setFormPOId] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<Array<{
    productId: string; orderedQty: string; receivedQty: string; unitCost: string; inspectionNotes: string
  }>>([{ productId: '', orderedQty: '', receivedQty: '', unitCost: '', inspectionNotes: '' }])

  const fetchReceipts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/goods-receipts?storeId=${storeId}`)
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      setReceipts(json as Receipt[])
    } finally {
      setLoading(false)
    }
  }, [storeId])

  const fetchItems = async (receiptId: string) => {
    if (expandedItems[receiptId]) return
    const res = await fetch(`/api/goods-receipts/${receiptId}/items`)
    const json = await res.json() as any
    if (!json.error) {
      setExpandedItems(prev => ({ ...prev, [receiptId]: json as ReceiptItem[] }))
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
    setFormItems(prev => [...prev, { productId: '', orderedQty: '', receivedQty: '', unitCost: '', inspectionNotes: '' }])
  }

  const removeFormItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateFormItem = (idx: number, field: string, value: string) => {
    setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const handleCreate = async () => {
    if (!formReceivedBy.trim()) { toast.error('Nama penerima diperlukan'); return }
    const items = formItems.map(i => ({
      productId: i.productId,
      orderedQty: parseFloat(i.orderedQty) || 0,
      receivedQty: parseFloat(i.receivedQty) || 0,
      unitCost: parseFloat(i.unitCost) || 0,
      inspectionNotes: i.inspectionNotes || undefined,
    }))
    const err = validateReceiveItems(items.map(i => ({
      productId: i.productId, receivedQty: i.receivedQty, unitCost: i.unitCost,
    })))
    if (err) { toast.error(err); return }

    const res = await fetch(`/api/goods-receipts?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receivedBy: formReceivedBy,
        purchaseOrderId: formPOId || undefined,
        notes: formNotes || undefined,
        items,
      }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('Penerimaan barang dibuat')
    setShowForm(false)
    setFormReceivedBy(''); setFormPOId(''); setFormNotes('')
    setFormItems([{ productId: '', orderedQty: '', receivedQty: '', unitCost: '', inspectionNotes: '' }])
    await fetchReceipts()
  }

  const handleAccept = async (receiptId: string) => {
    const res = await fetch(`/api/goods-receipts/${receiptId}/accept`, { method: 'POST' })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success(`Selesai — ${json.totalAccepted} unit diterima, stok diperbarui`)
    setExpandedItems(prev => { const n = { ...prev }; delete n[receiptId]; return n })
    await fetchReceipts()
  }

  const totalPending = receipts.filter(r => r.status === 'PENDING' || r.status === 'INSPECTING').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Penerimaan Barang</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Terima dan inspeksi kualitas barang dari pembelian
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchReceipts}
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
            Buat Penerimaan
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            { label: 'Total', value: receipts.length, icon: Package, color: 'var(--text-1)' },
            { label: 'Menunggu', value: totalPending, icon: Clock, color: '#f59e0b' },
            { label: 'Diterima', value: receipts.filter(r => r.status === 'ACCEPTED').length, icon: CheckCircle, color: '#22c55e' },
            { label: 'Ditolak/Sebagian', value: receipts.filter(r => r.status === 'REJECTED' || r.status === 'PARTIAL').length, icon: XCircle, color: '#ef4444' },
          ] as const
        ).map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon size={16} style={{ color }} />
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="font-semibold text-lg" style={{ color: 'var(--text-1)' }}>Buat Penerimaan Baru</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Diterima Oleh *</label>
              <input
                value={formReceivedBy}
                onChange={e => setFormReceivedBy(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                placeholder="Nama staf"
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>No. Purchase Order</label>
              <input
                value={formPOId}
                onChange={e => setFormPOId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                placeholder="Opsional"
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
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Item Barang</h3>
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
                  <div className="col-span-4">
                    <select
                      value={item.productId}
                      onChange={e => updateFormItem(idx, 'productId', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                    >
                      <option value="">Pilih produk...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={item.orderedQty}
                      onChange={e => updateFormItem(idx, 'orderedQty', e.target.value)}
                      placeholder="Dipesan"
                      className="w-full px-2 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                      min="0"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      value={item.receivedQty}
                      onChange={e => updateFormItem(idx, 'receivedQty', e.target.value)}
                      placeholder="Diterima"
                      className="w-full px-2 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                      min="0"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      value={item.unitCost}
                      onChange={e => updateFormItem(idx, 'unitCost', e.target.value)}
                      placeholder="Harga satuan"
                      className="w-full px-2 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                      min="0"
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
              Simpan Penerimaan
            </button>
          </div>
        </div>
      )}

      {/* Receipt list */}
      <div className="space-y-3">
        {receipts.length === 0 && (
          <div
            className="rounded-xl border p-12 text-center"
            style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
          >
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p>Belum ada penerimaan barang</p>
          </div>
        )}
        {receipts.map(receipt => {
          const items = expandedItems[receipt.id] ?? []
          const isExpanded = expandedId === receipt.id
          const canFinalize = receipt.status === 'PENDING' || receipt.status === 'INSPECTING'

          return (
            <div
              key={receipt.id}
              className="rounded-xl border"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              {/* Receipt header row */}
              <div className="flex items-center gap-3 p-4 flex-wrap">
                <button
                  onClick={() => handleToggleExpand(receipt.id)}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: 'var(--text-3)' }}
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                      #{receipt.id.slice(-8).toUpperCase()}
                    </span>
                    <StatusBadge status={receipt.status} />
                    {receipt.purchaseOrderId && (
                      <span className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                        PO: {receipt.purchaseOrderId}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-1)' }}>
                    Diterima oleh <strong>{receipt.receivedBy}</strong>
                    {' · '}{receipt.itemCount ?? 0} item
                    {receipt.totalAccepted != null && receipt.totalAccepted > 0 && (
                      <> · <span style={{ color: '#22c55e' }}>{receipt.totalAccepted} diterima</span></>
                    )}
                    {receipt.totalRejected != null && receipt.totalRejected > 0 && (
                      <> · <span style={{ color: '#ef4444' }}>{receipt.totalRejected} ditolak</span></>
                    )}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {new Date(receipt.receivedAt).toLocaleString('id-ID')}
                  </p>
                </div>
                {canFinalize && (
                  <button
                    onClick={() => handleAccept(receipt.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: '#16a34a' }}
                  >
                    <CheckCircle size={12} />
                    Finalisasi & Update Stok
                  </button>
                )}
              </div>

              {/* Expanded items table */}
              {isExpanded && (
                <div className="border-t px-4 pb-4" style={{ borderColor: 'var(--border)' }}>
                  {items.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: 'var(--text-3)' }}>Memuat item...</p>
                  ) : (
                    <table className="w-full text-xs mt-3">
                      <thead>
                        <tr style={{ color: 'var(--text-3)' }}>
                          <th className="text-left pb-2 font-medium">Produk</th>
                          <th className="text-right pb-2 font-medium">Dipesan</th>
                          <th className="text-right pb-2 font-medium">Diterima</th>
                          <th className="text-right pb-2 font-medium">Diterima ✓</th>
                          <th className="text-right pb-2 font-medium">Ditolak ✗</th>
                          <th className="text-right pb-2 font-medium">Harga Satuan</th>
                          <th className="text-left pb-2 font-medium">Alasan Tolak</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(item => {
                          const variance = calcVariance(item.orderedQty, item.receivedQty)
                          const acceptRate = calcAcceptanceRate(item.acceptedQty, item.receivedQty)
                          return (
                            <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td className="py-2 pr-2" style={{ color: 'var(--text-1)' }}>
                                {item.productName ?? item.productId}
                                {item.sku && <span className="ml-1" style={{ color: 'var(--text-3)' }}>({item.sku})</span>}
                              </td>
                              <td className="text-right py-2" style={{ color: 'var(--text-2)' }}>{item.orderedQty}</td>
                              <td className="text-right py-2">
                                <span style={{ color: 'var(--text-1)' }}>{item.receivedQty}</span>
                                {variance !== 0 && (
                                  <span className="ml-1" style={{ color: variance < 0 ? '#ef4444' : '#22c55e' }}>
                                    ({variance > 0 ? '+' : ''}{variance})
                                  </span>
                                )}
                              </td>
                              <td className="text-right py-2" style={{ color: '#22c55e' }}>
                                {item.acceptedQty}
                                {item.receivedQty > 0 && (
                                  <span className="ml-1" style={{ color: 'var(--text-3)' }}>({acceptRate}%)</span>
                                )}
                              </td>
                              <td className="text-right py-2" style={{ color: item.rejectedQty > 0 ? '#ef4444' : 'var(--text-3)' }}>
                                {item.rejectedQty}
                              </td>
                              <td className="text-right py-2" style={{ color: 'var(--text-2)' }}>
                                {formatCurrency(item.unitCost, currency)}
                              </td>
                              <td className="py-2 pl-2" style={{ color: 'var(--text-3)' }}>
                                {item.rejectionReason ?? '—'}
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
