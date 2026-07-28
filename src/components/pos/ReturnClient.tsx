'use client'

import { useState, useCallback, useEffect } from 'react'
import { RotateCcw, Search, Check, X, Loader2, ChevronDown, ChevronUp, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReturnStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
export type RefundMethod = 'CASH' | 'WALLET' | 'STORE_CREDIT'

export interface ReturnItemLine {
  id: string
  returnId: string
  productId: string
  productName: string
  qty: number
  unitPrice: number
  subtotal: number
}

export interface ReturnRecord {
  id: string
  storeId: string
  orderId: string
  status: ReturnStatus
  reason: string
  refundMethod: RefundMethod
  totalRefund: number
  processedBy: string | null
  createdAt: string
  items?: ReturnItemLine[]
}

export interface OrderLine {
  id: string
  productId: string
  productName: string
  qty: number
  unitPrice: number
  subtotal: number
}

export interface OrderSummary {
  id: string
  storeId: string
  customerName: string | null
  total: number
  createdAt: string
  items: OrderLine[]
}

// ─── Pure helpers (exported for testing) ────────────────────────────────────

export function calcReturnTotal(items: { qty: number; unitPrice: number }[]): number {
  return items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
}

export function validateRefundMethod(method: string): method is RefundMethod {
  return ['CASH', 'WALLET', 'STORE_CREDIT'].includes(method)
}

export type StatusTransition = {
  from: ReturnStatus
  to: ReturnStatus
  allowed: boolean
}

export function isStatusTransitionAllowed(from: ReturnStatus, to: ReturnStatus): boolean {
  const allowed: Record<ReturnStatus, ReturnStatus[]> = {
    PENDING: ['APPROVED', 'REJECTED'],
    APPROVED: ['COMPLETED', 'REJECTED'],
    REJECTED: [],
    COMPLETED: [],
  }
  return allowed[from]?.includes(to) ?? false
}

export interface StockRestorationItem {
  productId: string
  qty: number
}

export function buildStockRestorations(
  items: { productId: string; qty: number }[],
): StockRestorationItem[] {
  // Merge duplicate productIds
  const map = new Map<string, number>()
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) ?? 0) + item.qty)
  }
  return Array.from(map.entries()).map(([productId, qty]) => ({ productId, qty }))
}

export function calcPartialReturnTotal(
  allItems: OrderLine[],
  selectedIds: Set<string>,
  overrideQtys: Map<string, number>,
): number {
  return allItems
    .filter(i => selectedIds.has(i.id))
    .reduce((sum, i) => {
      const qty = overrideQtys.get(i.id) ?? i.qty
      return sum + qty * i.unitPrice
    }, 0)
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ReturnClientProps {
  storeId: string
}

const RETURN_REASONS = [
  'Barang rusak / cacat',
  'Barang tidak sesuai pesanan',
  'Kelebihan pengiriman',
  'Pelanggan berubah pikiran',
  'Lainnya',
]

const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  CASH: 'Tunai',
  WALLET: 'Kredit Dompet',
  STORE_CREDIT: 'Kredit Toko (Voucher)',
}

export default function ReturnClient({ storeId }: ReturnClientProps) {
  const [view, setView] = useState<'list' | 'new'>('list')
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New return form state
  const [orderSearch, setOrderSearch] = useState('')
  const [foundOrder, setFoundOrder] = useState<OrderSummary | null>(null)
  const [searchingOrder, setSearchingOrder] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [returnQtys, setReturnQtys] = useState<Map<string, number>>(new Map())
  const [reason, setReason] = useState(RETURN_REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('CASH')
  const [submitting, setSubmitting] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchReturns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/returns?storeId=${storeId}`)
      const data = await res.json() as { error?: string } | ReturnRecord[]
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Gagal memuat data retur')
      } else {
        setReturns(data as ReturnRecord[])
      }
    } catch {
      setError('Kesalahan jaringan')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchReturns()
  }, [fetchReturns])

  const searchOrder = async () => {
    if (!orderSearch.trim()) return
    setSearchingOrder(true)
    setFoundOrder(null)
    setSelectedItems(new Set())
    setReturnQtys(new Map())
    try {
      const res = await fetch(`/api/orders/${orderSearch.trim()}?storeId=${storeId}`)
      const data = await res.json() as any
      if (res.ok) {
        setFoundOrder(data)
      } else {
        setError(data.error ?? 'Order tidak ditemukan')
      }
    } catch {
      setError('Kesalahan jaringan')
    } finally {
      setSearchingOrder(false)
    }
  }

  const toggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
        setReturnQtys(q => { const m = new Map(q); m.delete(itemId); return m })
      } else {
        next.add(itemId)
        setReturnQtys(q => new Map(q).set(itemId, maxQty))
      }
      return next
    })
  }

  const setQty = (itemId: string, qty: number, maxQty: number) => {
    const clamped = Math.max(1, Math.min(qty, maxQty))
    setReturnQtys(q => new Map(q).set(itemId, clamped))
  }

  const computedTotal = foundOrder
    ? calcPartialReturnTotal(foundOrder.items, selectedItems, returnQtys)
    : 0

  const handleSubmit = async () => {
    if (!foundOrder || selectedItems.size === 0) return
    setSubmitting(true)
    setError(null)
    const finalReason = reason === 'Lainnya' ? customReason.trim() || 'Lainnya' : reason
    const items = foundOrder.items
      .filter(i => selectedItems.has(i.id))
      .map(i => ({
        productId: i.productId,
        productName: i.productName,
        qty: returnQtys.get(i.id) ?? i.qty,
        unitPrice: i.unitPrice,
      }))
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          orderId: foundOrder.id,
          reason: finalReason,
          refundMethod,
          items,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Gagal membuat retur')
      } else {
        setView('list')
        setFoundOrder(null)
        setOrderSearch('')
        setSelectedItems(new Set())
        setReturnQtys(new Map())
        fetchReturns()
      }
    } catch {
      setError('Kesalahan jaringan')
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (id: string, status: ReturnStatus) => {
    try {
      const res = await fetch(`/api/returns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, storeId }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Gagal memperbarui status')
      } else {
        fetchReturns()
      }
    } catch {
      setError('Kesalahan jaringan')
    }
  }

  const statusBadge = (s: ReturnStatus) => {
    const map: Record<ReturnStatus, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-blue-100 text-blue-800',
      REJECTED: 'bg-red-100 text-red-800',
      COMPLETED: 'bg-green-100 text-green-800',
    }
    const labels: Record<ReturnStatus, string> = {
      PENDING: 'Menunggu',
      APPROVED: 'Disetujui',
      REJECTED: 'Ditolak',
      COMPLETED: 'Selesai',
    }
    return (
      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', map[s])}>
        {labels[s]}
      </span>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-[var(--text-1)]" />
          <h1 className="text-xl font-semibold text-[var(--text-1)]">Retur &amp; Refund</h1>
        </div>
        <div className="flex gap-2">
          {view === 'list' ? (
            <button
              onClick={() => { setView('new'); setError(null) }}
              className="px-3 py-1.5 bg-[var(--accent)] text-white rounded text-sm font-medium hover:opacity-90"
            >
              + Retur Baru
            </button>
          ) : (
            <button
              onClick={() => { setView('list'); setFoundOrder(null); setError(null) }}
              className="px-3 py-1.5 border border-[var(--border)] rounded text-sm hover:bg-[var(--bg-hover)]"
            >
              Batal
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-2)]" />
            </div>
          ) : returns.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-2)]">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Belum ada retur</p>
            </div>
          ) : (
            returns.map(r => (
              <div
                key={r.id}
                className="border border-[var(--border)] rounded-lg bg-[var(--bg-card)] overflow-hidden"
              >
                <div
                  className="flex items-center justify-between p-3 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-1)]">
                        Order #{r.orderId.slice(-8)}
                      </p>
                      <p className="text-xs text-[var(--text-2)]">
                        {new Date(r.createdAt).toLocaleDateString('id-ID')} ·{' '}
                        {REFUND_METHOD_LABELS[r.refundMethod]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[var(--text-1)]">
                      Rp {r.totalRefund.toLocaleString('id-ID')}
                    </span>
                    {statusBadge(r.status)}
                    {expandedId === r.id
                      ? <ChevronUp className="w-4 h-4 text-[var(--text-2)]" />
                      : <ChevronDown className="w-4 h-4 text-[var(--text-2)]" />}
                  </div>
                </div>

                {expandedId === r.id && (
                  <div className="border-t border-[var(--border)] p-3 space-y-2">
                    <p className="text-xs text-[var(--text-2)]">Alasan: {r.reason}</p>
                    {r.items && r.items.length > 0 && (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[var(--text-2)]">
                            <th className="text-left pb-1">Produk</th>
                            <th className="text-right pb-1">Qty</th>
                            <th className="text-right pb-1">Harga</th>
                            <th className="text-right pb-1">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.items.map(it => (
                            <tr key={it.id} className="text-[var(--text-1)]">
                              <td className="py-0.5">{it.productName}</td>
                              <td className="text-right">{it.qty}</td>
                              <td className="text-right">Rp {it.unitPrice.toLocaleString('id-ID')}</td>
                              <td className="text-right">Rp {it.subtotal.toLocaleString('id-ID')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {r.status === 'PENDING' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => updateStatus(r.id, 'APPROVED')}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:opacity-90"
                        >
                          <Check className="w-3 h-3" /> Setujui
                        </button>
                        <button
                          onClick={() => updateStatus(r.id, 'REJECTED')}
                          className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-xs hover:opacity-90"
                        >
                          <X className="w-3 h-3" /> Tolak
                        </button>
                      </div>
                    )}
                    {r.status === 'APPROVED' && (
                      <button
                        onClick={() => updateStatus(r.id, 'COMPLETED')}
                        className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:opacity-90"
                      >
                        <Check className="w-3 h-3" /> Selesaikan &amp; Kembalikan Stok
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* New return form */}
      {view === 'new' && (
        <div className="space-y-4">
          {/* Order search */}
          <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-card)] space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Cari Order Asli</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="ID Order atau nomor transaksi..."
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchOrder()}
                className="flex-1 px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--bg-input)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
              />
              <button
                onClick={searchOrder}
                disabled={searchingOrder}
                className="px-3 py-2 bg-[var(--accent)] text-white rounded text-sm hover:opacity-90 disabled:opacity-50"
              >
                {searchingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            {foundOrder && (
              <div className="pt-2 border-t border-[var(--border)]">
                <p className="text-xs text-[var(--text-2)] mb-2">
                  Order #{foundOrder.id.slice(-8)} ·{' '}
                  {foundOrder.customerName ?? 'Tamu'} ·{' '}
                  Rp {foundOrder.total.toLocaleString('id-ID')} ·{' '}
                  {new Date(foundOrder.createdAt).toLocaleDateString('id-ID')}
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--text-2)] text-xs">
                      <th className="text-left pb-1 w-6">✓</th>
                      <th className="text-left pb-1">Produk</th>
                      <th className="text-right pb-1">Harga</th>
                      <th className="text-right pb-1 w-24">Qty Retur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foundOrder.items.map(item => {
                      const selected = selectedItems.has(item.id)
                      const qty = returnQtys.get(item.id) ?? item.qty
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            'cursor-pointer transition-colors',
                            selected ? 'bg-blue-50' : 'hover:bg-[var(--bg-hover)]',
                          )}
                          onClick={() => toggleItem(item.id, item.qty)}
                        >
                          <td className="py-1 pl-1">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleItem(item.id, item.qty)}
                              className="w-3.5 h-3.5"
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                          <td className="py-1 text-[var(--text-1)]">{item.productName}</td>
                          <td className="text-right text-[var(--text-2)] text-xs">
                            Rp {item.unitPrice.toLocaleString('id-ID')}
                          </td>
                          <td className="text-right py-1" onClick={e => e.stopPropagation()}>
                            {selected ? (
                              <input
                                type="number"
                                min={1}
                                max={item.qty}
                                value={qty}
                                onChange={e => setQty(item.id, Number(e.target.value), item.qty)}
                                className="w-16 text-right border border-[var(--border)] rounded px-1 py-0.5 text-sm bg-[var(--bg-input)]"
                              />
                            ) : (
                              <span className="text-[var(--text-3)] text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Reason + refund method */}
          {foundOrder && selectedItems.size > 0 && (
            <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-card)] space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                  Alasan Retur
                </label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full border border-[var(--border)] rounded px-2 py-1.5 text-sm bg-[var(--bg-input)] text-[var(--text-1)]"
                >
                  {RETURN_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {reason === 'Lainnya' && (
                  <input
                    type="text"
                    placeholder="Tulis alasan..."
                    value={customReason}
                    onChange={e => setCustomReason(e.target.value)}
                    className="mt-2 w-full border border-[var(--border)] rounded px-2 py-1.5 text-sm bg-[var(--bg-input)] text-[var(--text-1)]"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                  Metode Refund
                </label>
                <div className="flex gap-2">
                  {(Object.keys(REFUND_METHOD_LABELS) as RefundMethod[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setRefundMethod(m)}
                      className={cn(
                        'flex-1 py-1.5 rounded border text-xs font-medium transition-colors',
                        refundMethod === m
                          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                          : 'bg-[var(--bg-card)] text-[var(--text-1)] border-[var(--border)] hover:bg-[var(--bg-hover)]',
                      )}
                    >
                      {REFUND_METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-sm text-[var(--text-2)]">Total Refund</span>
                <span className="text-lg font-bold text-[var(--text-1)]">
                  Rp {computedTotal.toLocaleString('id-ID')}
                </span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || selectedItems.size === 0}
                className="w-full py-2 bg-[var(--accent)] text-white rounded font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Ajukan Retur
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
