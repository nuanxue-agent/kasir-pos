'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, CheckCircle, XCircle, Clock, Package, ChevronDown, ChevronUp, Truck, AlertTriangle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Pure logic exports (used by unit tests) ─────────────────────────────────

export type RTVStatus = 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'
export type RTVReason = 'DEFECTIVE' | 'EXCESS' | 'WRONG_ITEM' | 'EXPIRED'
export type ItemCondition = 'DAMAGED' | 'UNOPENED' | 'OPENED' | 'EXPIRED'

export function calcRTVTotalValue(items: Array<{ qty: number; unitCost: number }>): number {
  return items.reduce((sum, i) => sum + i.qty * i.unitCost, 0)
}

export function calcRTVTotalItems(items: Array<{ qty: number }>): number {
  return items.reduce((sum, i) => sum + i.qty, 0)
}

export function calcCreditNoteAmount(
  items: Array<{ qty: number; unitCost: number }>,
  creditPct: number,
): number {
  const total = calcRTVTotalValue(items)
  if (creditPct < 0 || creditPct > 100) return 0
  return Math.round((total * creditPct) / 100)
}

export function canTransitionRTV(from: RTVStatus, to: RTVStatus): boolean {
  const allowed: Record<RTVStatus, RTVStatus[]> = {
    DRAFT:        ['SUBMITTED', 'CANCELLED'],
    SUBMITTED:    ['ACKNOWLEDGED', 'CANCELLED'],
    ACKNOWLEDGED: ['SHIPPED', 'CANCELLED'],
    SHIPPED:      ['COMPLETED', 'CANCELLED'],
    COMPLETED:    [],
    CANCELLED:    [],
  }
  return allowed[from]?.includes(to) ?? false
}

export function classifyItemCondition(condition: ItemCondition): { label: string; creditEligible: boolean } {
  switch (condition) {
    case 'DAMAGED':   return { label: 'Rusak',       creditEligible: false }
    case 'UNOPENED':  return { label: 'Tersegel',    creditEligible: true }
    case 'OPENED':    return { label: 'Terbuka',     creditEligible: false }
    case 'EXPIRED':   return { label: 'Kadaluarsa',  creditEligible: false }
  }
}

export function calcVendorReturnRate(
  totalOrdered: number,
  totalReturned: number,
): number {
  if (totalOrdered === 0) return 0
  return Math.round((totalReturned / totalOrdered) * 10000) / 100
}

export function validateRTVItems(
  items: Array<{ productId: string; qty: number; unitCost: number }>,
): string | null {
  for (const item of items) {
    if (!item.productId) return 'productId diperlukan'
    if (isNaN(item.qty) || item.qty <= 0) return `qty harus > 0 untuk produk ${item.productId}`
    if (item.unitCost < 0) return `unitCost tidak boleh negatif untuk produk ${item.productId}`
  }
  return null
}

export function getRTVStatusNextStep(status: RTVStatus): string | null {
  const next: Partial<Record<RTVStatus, string>> = {
    DRAFT:        'SUBMITTED',
    SUBMITTED:    'ACKNOWLEDGED',
    ACKNOWLEDGED: 'SHIPPED',
    SHIPPED:      'COMPLETED',
  }
  return next[status] ?? null
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RTVItem {
  id: string
  rtvId: string
  storeId: string
  productId: string
  productName?: string
  sku?: string
  qty: number
  unitCost: number
  totalCost: number
  condition: ItemCondition
}

interface RTVOrder {
  id: string
  storeId: string
  vendorId?: string
  vendorName?: string
  status: RTVStatus
  reason: RTVReason
  totalItems: number
  totalValue: number
  creditNote?: number
  notes?: string
  createdAt: string
  items?: RTVItem[]
}

interface Product {
  id: string
  name: string
  sku?: string
}

interface RTVClientProps {
  storeId: string
  currency: string
  initialOrders: RTVOrder[]
  products: Product[]
}

// ─── Status / reason helpers ──────────────────────────────────────────────────

const STATUS_COLORS: Record<RTVStatus, string> = {
  DRAFT:        'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  SUBMITTED:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  ACKNOWLEDGED: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  SHIPPED:      'bg-purple-500/15 text-purple-400 border-purple-500/30',
  COMPLETED:    'bg-green-500/15 text-green-400 border-green-500/30',
  CANCELLED:    'bg-red-500/15 text-red-400 border-red-500/30',
}

const STATUS_LABELS: Record<RTVStatus, string> = {
  DRAFT:        'Draft',
  SUBMITTED:    'Diajukan',
  ACKNOWLEDGED: 'Dikonfirmasi',
  SHIPPED:      'Dikirim',
  COMPLETED:    'Selesai',
  CANCELLED:    'Dibatalkan',
}

const REASON_LABELS: Record<RTVReason, string> = {
  DEFECTIVE:  'Barang Rusak',
  EXCESS:     'Kelebihan Stok',
  WRONG_ITEM: 'Barang Salah',
  EXPIRED:    'Kadaluarsa',
}

const CONDITION_LABELS: Record<ItemCondition, string> = {
  DAMAGED:  'Rusak',
  UNOPENED: 'Tersegel',
  OPENED:   'Terbuka',
  EXPIRED:  'Kadaluarsa',
}

function StatusBadge({ status }: { status: RTVStatus }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs border font-medium', STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RTVClient({ storeId, currency, initialOrders, products }: RTVClientProps) {
  const [orders, setOrders] = useState<RTVOrder[]>(initialOrders)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Record<string, RTVItem[]>>({})

  // Form state
  const [formVendorId, setFormVendorId] = useState('')
  const [formReason, setFormReason] = useState<RTVReason>('DEFECTIVE')
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<Array<{
    productId: string; qty: string; unitCost: string; condition: ItemCondition
  }>>([{ productId: '', qty: '', unitCost: '', condition: 'DAMAGED' }])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/rtv-orders?storeId=${storeId}`)
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      setOrders(json as RTVOrder[])
    } finally {
      setLoading(false)
    }
  }, [storeId])

  const fetchItems = async (orderId: string) => {
    if (expandedItems[orderId]) return
    const res = await fetch(`/api/rtv-orders/${orderId}/items`)
    const json = await res.json() as any
    if (!json.error) {
      setExpandedItems(prev => ({ ...prev, [orderId]: json as RTVItem[] }))
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
    setFormItems(prev => [...prev, { productId: '', qty: '', unitCost: '', condition: 'DAMAGED' }])
  }

  const removeFormItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateFormItem = (idx: number, field: string, value: string) => {
    setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const handleCreate = async () => {
    const items = formItems.map(i => ({
      productId: i.productId,
      qty: parseFloat(i.qty) || 0,
      unitCost: parseFloat(i.unitCost) || 0,
      condition: i.condition,
    }))
    const err = validateRTVItems(items)
    if (err) { toast.error(err); return }

    const res = await fetch(`/api/rtv-orders?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendorId: formVendorId || undefined,
        reason: formReason,
        notes: formNotes || undefined,
        items,
      }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('RTV order dibuat')
    setShowForm(false)
    setFormVendorId(''); setFormReason('DEFECTIVE'); setFormNotes('')
    setFormItems([{ productId: '', qty: '', unitCost: '', condition: 'DAMAGED' }])
    await fetchOrders()
  }

  const handleAdvanceStatus = async (order: RTVOrder) => {
    const next = getRTVStatusNextStep(order.status)
    if (!next) return
    const res = await fetch(`/api/rtv-orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success(`Status diperbarui ke ${STATUS_LABELS[next as RTVStatus]}`)
    await fetchOrders()
  }

  const handleCancel = async (orderId: string) => {
    const res = await fetch(`/api/rtv-orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('RTV order dibatalkan')
    await fetchOrders()
  }

  const totalDraft      = orders.filter(o => o.status === 'DRAFT').length
  const totalInProgress = orders.filter(o => ['SUBMITTED', 'ACKNOWLEDGED', 'SHIPPED'].includes(o.status)).length
  const totalCompleted  = orders.filter(o => o.status === 'COMPLETED').length
  const totalValue      = orders.filter(o => o.status !== 'CANCELLED').reduce((s, o) => s + (o.totalValue ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Return to Vendor (RTV)</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Kembalikan barang defektif atau kelebihan stok ke supplier
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchOrders}
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
            Buat RTV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            { label: 'Draft',       value: totalDraft,      icon: AlertTriangle, color: '#a1a1aa' },
            { label: 'Diproses',    value: totalInProgress, icon: Clock,         color: '#f59e0b' },
            { label: 'Selesai',     value: totalCompleted,  icon: CheckCircle,   color: '#22c55e' },
            { label: 'Total Nilai', value: formatCurrency(totalValue, currency), icon: Package, color: 'var(--primary)' },
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
            <p className="text-xl font-bold truncate" style={{ color: 'var(--text-1)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="font-semibold text-lg" style={{ color: 'var(--text-1)' }}>Buat RTV Baru</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>ID Vendor</label>
              <input
                value={formVendorId}
                onChange={e => setFormVendorId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                placeholder="Opsional"
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-3)' }}>Alasan Return *</label>
              <select
                value={formReason}
                onChange={e => setFormReason(e.target.value as RTVReason)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              >
                {(Object.keys(REASON_LABELS) as RTVReason[]).map(r => (
                  <option key={r} value={r}>{REASON_LABELS[r]}</option>
                ))}
              </select>
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
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Item yang Dikembalikan</h3>
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
                      value={item.qty}
                      onChange={e => updateFormItem(idx, 'qty', e.target.value)}
                      placeholder="Qty"
                      className="w-full px-2 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                      min="1"
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
                  <div className="col-span-2">
                    <select
                      value={item.condition}
                      onChange={e => updateFormItem(idx, 'condition', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border text-xs"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                    >
                      {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map(c => (
                        <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
                      ))}
                    </select>
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
              Simpan RTV
            </button>
          </div>
        </div>
      )}

      {/* Order list */}
      <div className="space-y-3">
        {orders.length === 0 && (
          <div
            className="rounded-xl border p-12 text-center"
            style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
          >
            <Truck size={40} className="mx-auto mb-3 opacity-30" />
            <p>Belum ada RTV order</p>
          </div>
        )}
        {orders.map(order => {
          const items = expandedItems[order.id] ?? []
          const isExpanded = expandedId === order.id
          const nextStep = getRTVStatusNextStep(order.status)
          const canCancel = order.status !== 'COMPLETED' && order.status !== 'CANCELLED'

          return (
            <div
              key={order.id}
              className="rounded-xl border"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-3 p-4 flex-wrap">
                <button
                  onClick={() => handleToggleExpand(order.id)}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: 'var(--text-3)' }}
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                      #{order.id.slice(-8).toUpperCase()}
                    </span>
                    <StatusBadge status={order.status} />
                    <span
                      className="text-xs px-1.5 py-0.5 rounded border"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
                    >
                      {REASON_LABELS[order.reason]}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-1)' }}>
                    {order.totalItems} item
                    {' · '}
                    <span style={{ color: 'var(--primary)' }}>{formatCurrency(order.totalValue, currency)}</span>
                    {order.creditNote != null && order.creditNote > 0 && (
                      <> · <span style={{ color: '#22c55e' }}>Kredit: {formatCurrency(order.creditNote, currency)}</span></>
                    )}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {new Date(order.createdAt).toLocaleString('id-ID')}
                    {order.vendorId && <> · Vendor: {order.vendorId}</>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {nextStep && (
                    <button
                      onClick={() => handleAdvanceStatus(order)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: 'var(--primary)' }}
                    >
                      <CheckCircle size={12} />
                      {STATUS_LABELS[nextStep as RTVStatus]}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => handleCancel(order.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
                    >
                      <XCircle size={12} />
                      Batal
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded items */}
              {isExpanded && (
                <div
                  className="border-t px-4 py-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {items.length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-3)' }}>Memuat item...</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ color: 'var(--text-3)' }}>
                          <th className="text-left pb-2 font-medium">Produk</th>
                          <th className="text-right pb-2 font-medium">Qty</th>
                          <th className="text-right pb-2 font-medium">Harga Satuan</th>
                          <th className="text-right pb-2 font-medium">Total</th>
                          <th className="text-center pb-2 font-medium">Kondisi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(item => (
                          <tr key={item.id} style={{ color: 'var(--text-1)' }}>
                            <td className="py-1">
                              {item.productName ?? item.productId}
                              {item.sku && <span style={{ color: 'var(--text-3)' }}> · {item.sku}</span>}
                            </td>
                            <td className="text-right py-1">{item.qty}</td>
                            <td className="text-right py-1">{formatCurrency(item.unitCost, currency)}</td>
                            <td className="text-right py-1">{formatCurrency(item.totalCost, currency)}</td>
                            <td className="text-center py-1">
                              <span className={cn(
                                'px-1.5 py-0.5 rounded text-xs',
                                item.condition === 'UNOPENED'
                                  ? 'bg-green-500/15 text-green-400'
                                  : 'bg-red-500/15 text-red-400',
                              )}>
                                {CONDITION_LABELS[item.condition]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {order.notes && (
                    <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
                      Catatan: {order.notes}
                    </p>
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
