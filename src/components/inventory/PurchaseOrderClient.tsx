'use client'

import { useState, useCallback, useEffect } from 'react'
import { Plus, X, PackageCheck, Send, Ban, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Pure exports for tests ────────────────────────────────────────────────────
export type POStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'

export interface POItem {
  id: string
  poId: string
  storeId: string
  productId: string
  productName?: string
  qty: number
  unitPrice: number
  total: number
  receivedQty: number
}

export interface PurchaseOrder {
  id: string
  storeId: string
  vendorId: string
  vendorName?: string
  poNumber: string
  status: POStatus
  orderDate: string
  expectedDate?: string | null
  subtotal: number
  taxAmount: number
  total: number
  notes?: string | null
  items?: POItem[]
}

export function calcPOTotal(subtotal: number, taxAmount: number) {
  return subtotal + taxAmount
}

export function isPartiallyReceived(items: POItem[]): boolean {
  if (!items.length) return false
  return items.some(i => i.receivedQty > 0) && items.some(i => i.receivedQty < i.qty)
}

export function isFullyReceived(items: POItem[]): boolean {
  if (!items.length) return false
  return items.every(i => i.receivedQty >= i.qty)
}

// ── Status badge ─────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<POStatus, string> = {
  DRAFT:     'bg-gray-100 text-gray-700',
  SENT:      'bg-blue-100 text-blue-700',
  PARTIAL:   'bg-yellow-100 text-yellow-700',
  RECEIVED:  'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}
const STATUS_LABELS: Record<POStatus, string> = {
  DRAFT: 'Draft', SENT: 'Dikirim', PARTIAL: 'Sebagian', RECEIVED: 'Diterima', CANCELLED: 'Dibatalkan',
}

function StatusBadge({ status }: { status: POStatus }) {
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Component props ───────────────────────────────────────────────────────────
interface Props {
  storeId: string
  currency: string
  initialPOs: PurchaseOrder[]
  vendors: { id: string; name: string }[]
  products: { id: string; name: string; cost?: number }[]
}

export default function PurchaseOrderClient({ storeId, currency, initialPOs, vendors, products }: Props) {
  const [pos, setPOs] = useState<PurchaseOrder[]>(initialPOs)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showReceiveModal, setShowReceiveModal] = useState(false)

  // Form state
  const [vendorId, setVendorId] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [formItems, setFormItems] = useState<{ productId: string; qty: number; unitPrice: number }[]>([])

  // Receive state
  const [receiveLines, setReceiveLines] = useState<Record<string, number>>({})

  const fetchPOs = useCallback(async () => {
    const res = await fetch(`/api/purchase-orders?storeId=${storeId}`)
    const data = await res.json() as any
    if (!data.error) setPOs(data)
  }, [storeId])

  const resetForm = () => {
    setVendorId(''); setOrderDate(new Date().toISOString().split('T')[0])
    setExpectedDate(''); setNotes(''); setFormItems([])
  }

  const addFormItem = () => setFormItems(prev => [...prev, { productId: '', qty: 1, unitPrice: 0 }])
  const removeFormItem = (i: number) => setFormItems(prev => prev.filter((_, idx) => idx !== i))
  const updateFormItem = (i: number, field: string, value: any) =>
    setFormItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))

  const formSubtotal = formItems.reduce((s, i) => s + i.qty * i.unitPrice, 0)

  const handleCreate = async () => {
    if (!vendorId) { toast.error('Pilih vendor'); return }
    if (formItems.length === 0) { toast.error('Tambah minimal 1 item'); return }
    for (const item of formItems) {
      if (!item.productId) { toast.error('Pilih produk untuk semua item'); return }
      if (item.qty <= 0) { toast.error('Qty harus lebih dari 0'); return }
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId, orderDate,
          expectedDate: expectedDate || null,
          notes: notes || null,
          subtotal: formSubtotal,
          taxAmount: 0,
          total: formSubtotal,
          items: formItems.map(i => ({
            productId: i.productId,
            qty: i.qty,
            unitPrice: i.unitPrice,
          })),
        }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success(`PO ${data.poNumber} dibuat`)
      resetForm(); setShowForm(false)
      await fetchPOs()
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (po: PurchaseOrder, newStatus: POStatus) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success(`Status diubah ke ${STATUS_LABELS[newStatus]}`)
      await fetchPOs()
    } finally {
      setLoading(false)
    }
  }

  const openReceive = async (po: PurchaseOrder) => {
    // Load items
    const res = await fetch(`/api/purchase-orders/${po.id}/items?storeId=${storeId}`)
    const items = await res.json() as any
    const poWithItems = { ...po, items: Array.isArray(items) ? items : [] }
    setSelectedPO(poWithItems)
    const defaults: Record<string, number> = {}
    for (const item of poWithItems.items ?? []) {
      const remaining = item.qty - (item.receivedQty ?? 0)
      if (remaining > 0) defaults[item.id] = remaining
    }
    setReceiveLines(defaults)
    setShowReceiveModal(true)
  }

  const handleReceive = async () => {
    if (!selectedPO) return
    const lines = Object.entries(receiveLines)
      .filter(([, qty]) => qty > 0)
      .map(([id, receivedQty]) => ({ id, receivedQty }))
    if (lines.length === 0) { toast.error('Masukkan qty diterima'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}/receive?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success('Barang diterima, stok diperbarui')
      setShowReceiveModal(false); setSelectedPO(null)
      await fetchPOs()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Purchase Orders</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">Kelola pesanan pembelian ke vendor</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPOs}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-1)] text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Buat PO
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--text-1)]">Buat Purchase Order</h2>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-[var(--text-3)]" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[var(--text-2)] mb-1 block">Vendor *</label>
              <select
                value={vendorId}
                onChange={e => setVendorId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-3 py-2 text-sm"
              >
                <option value="">-- Pilih Vendor --</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--text-2)] mb-1 block">Tanggal Order *</label>
              <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm text-[var(--text-2)] mb-1 block">Exp. Tiba</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm text-[var(--text-2)] mb-1 block">Catatan</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--text-1)]">Item</span>
              <button onClick={addFormItem}
                className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline">
                <Plus className="w-3 h-3" /> Tambah item
              </button>
            </div>
            {formItems.length === 0 && (
              <p className="text-sm text-[var(--text-3)] italic">Belum ada item — klik "Tambah item"</p>
            )}
            <div className="space-y-2">
              {formItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select value={item.productId} onChange={e => updateFormItem(i, 'productId', e.target.value)}
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-2 py-1.5 text-sm">
                    <option value="">-- Produk --</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min="1" value={item.qty}
                    onChange={e => updateFormItem(i, 'qty', Number(e.target.value))}
                    placeholder="Qty"
                    className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-2 py-1.5 text-sm" />
                  <input type="number" min="0" value={item.unitPrice}
                    onChange={e => updateFormItem(i, 'unitPrice', Number(e.target.value))}
                    placeholder="Harga"
                    className="w-32 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-2 py-1.5 text-sm" />
                  <button onClick={() => removeFormItem(i)} className="mt-1.5">
                    <X className="w-4 h-4 text-[var(--text-3)] hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
            {formItems.length > 0 && (
              <div className="text-right text-sm text-[var(--text-2)] mt-2">
                Subtotal: <span className="font-semibold text-[var(--text-1)]">{formatCurrency(formSubtotal, currency)}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-2)] text-sm hover:bg-[var(--bg-1)]">
              Batal
            </button>
            <button onClick={handleCreate} disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Buat PO
            </button>
          </div>
        </div>
      )}

      {/* PO List */}
      {pos.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <p className="text-[var(--text-3)]">Belum ada purchase order.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pos.map(po => (
            <div key={po.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-[var(--bg-1)]"
                onClick={() => setExpandedId(expandedId === po.id ? null : po.id)}
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={po.status} />
                  <span className="font-mono text-sm font-medium text-[var(--text-1)]">{po.poNumber}</span>
                  {po.vendorName && <span className="text-sm text-[var(--text-2)]">{po.vendorName}</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-[var(--text-1)]">{formatCurrency(po.total, currency)}</span>
                  <span className="text-xs text-[var(--text-3)]">{po.orderDate?.slice(0, 10)}</span>
                  {expandedId === po.id ? <ChevronUp className="w-4 h-4 text-[var(--text-3)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-3)]" />}
                </div>
              </div>

              {expandedId === po.id && (
                <div className="border-t border-[var(--border)] px-5 py-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-[var(--text-3)]">Subtotal</span><br />{formatCurrency(po.subtotal, currency)}</div>
                    <div><span className="text-[var(--text-3)]">Pajak</span><br />{formatCurrency(po.taxAmount, currency)}</div>
                    <div><span className="text-[var(--text-3)]">Total</span><br /><strong>{formatCurrency(po.total, currency)}</strong></div>
                    {po.expectedDate && <div><span className="text-[var(--text-3)]">Exp. Tiba</span><br />{po.expectedDate.slice(0, 10)}</div>}
                  </div>
                  {po.notes && <p className="text-sm text-[var(--text-2)]">📝 {po.notes}</p>}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {po.status === 'DRAFT' && (
                      <button onClick={() => handleStatusChange(po, 'SENT')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:opacity-90">
                        <Send className="w-3 h-3" /> Kirim ke Vendor
                      </button>
                    )}
                    {(po.status === 'SENT' || po.status === 'PARTIAL') && (
                      <button onClick={() => openReceive(po)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs hover:opacity-90">
                        <PackageCheck className="w-3 h-3" /> Terima Barang
                      </button>
                    )}
                    {(po.status === 'DRAFT' || po.status === 'SENT') && (
                      <button onClick={() => handleStatusChange(po, 'CANCELLED')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs hover:bg-red-50">
                        <Ban className="w-3 h-3" /> Batalkan
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Receive Modal */}
      {showReceiveModal && selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-1)]">Terima Barang — {selectedPO.poNumber}</h2>
              <button onClick={() => setShowReceiveModal(false)}><X className="w-4 h-4 text-[var(--text-3)]" /></button>
            </div>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {(selectedPO.items ?? []).map(item => {
                const remaining = item.qty - (item.receivedQty ?? 0)
                if (remaining <= 0) return (
                  <div key={item.id} className="flex items-center justify-between text-sm opacity-50">
                    <span>{item.productName ?? item.productId}</span>
                    <span className="text-green-600 font-medium">✓ Lunas</span>
                  </div>
                )
                return (
                  <div key={item.id} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-[var(--text-1)]">{item.productName ?? item.productId}</span>
                    <span className="text-[var(--text-3)] text-xs">sisa {remaining}</span>
                    <input
                      type="number" min="0" max={remaining}
                      value={receiveLines[item.id] ?? 0}
                      onChange={e => setReceiveLines(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                      className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] px-2 py-1 text-sm"
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowReceiveModal(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-2)] text-sm">
                Batal
              </button>
              <button onClick={handleReceive} disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Konfirmasi Terima
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
