'use client'

import { useState, useCallback } from 'react'
import { X, Split, Merge, Users, GripVertical, Check, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string
  orderId: string
  productId: string | null
  variantId: string | null
  name: string
  variantName: string | null
  price: number
  qty: number
  discount: number
  subtotal: number
}

export interface Order {
  id: string
  storeId: string
  number: string
  status: string
  tableId: string | null
  tableNumber: number | null
  subtotal: number
  discountAmt: number
  taxAmt: number
  total: number
  items: OrderItem[]
}

export type SplitMode = 'items' | 'seats' | 'merge'

interface SubOrder {
  id: string
  label: string
  items: Array<OrderItem & { splitQty: number }>
  total: number
}

interface OrderSplitClientProps {
  order: Order
  /** Other open orders at the same table, for merge */
  tableOrders?: Order[]
  storeId: string
  currency: string
  onClose: () => void
  onSuccess?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${currency} ${n.toLocaleString('id-ID')}`
  }
}

function calcSubtotal(items: Array<OrderItem & { splitQty: number }>): number {
  return items.reduce((s, i) => s + (i.price - i.discount) * i.splitQty, 0)
}

/**
 * Distribute items across `count` sub-orders as evenly as possible.
 * Each item row is split proportionally; fractional qty goes to earlier buckets.
 */
export function distributeEvenly(
  items: OrderItem[],
  count: number,
): Array<Array<{ item: OrderItem; qty: number }>> {
  if (count <= 0) return []
  const buckets: Array<Array<{ item: OrderItem; qty: number }>> = Array.from(
    { length: count },
    () => [],
  )
  for (const item of items) {
    const base = Math.floor(item.qty / count)
    const remainder = item.qty % count
    for (let i = 0; i < count; i++) {
      const qty = base + (i < remainder ? 1 : 0)
      if (qty > 0) {
        buckets[i].push({ item, qty })
      }
    }
  }
  return buckets
}

/**
 * Validate that split items don't exceed original quantities.
 * Returns null if valid, or an error message string.
 */
export function validateSplitItems(
  original: OrderItem[],
  splits: Array<{ orderItemId: string; qty: number }>,
): string | null {
  for (const s of splits) {
    const orig = original.find(i => i.id === s.orderItemId)
    if (!orig) return `Item ${s.orderItemId} not found in order`
    if (s.qty <= 0) return `Qty for item "${orig.name}" must be > 0`
    if (s.qty > orig.qty) return `Split qty for "${orig.name}" exceeds ordered qty (${orig.qty})`
  }
  return null
}

/**
 * Calculate reconciliation: verify split totals match original total (before tax).
 * Returns { ok, diff } where diff is the rounding remainder.
 */
export function reconcileSplitAmounts(
  originalSubtotal: number,
  subOrders: SubOrder[],
): { ok: boolean; diff: number } {
  const splitTotal = subOrders.reduce((s, so) => s + so.total, 0)
  const diff = Math.abs(originalSubtotal - splitTotal)
  // Allow up to 1 unit rounding tolerance
  return { ok: diff <= 1, diff }
}

/**
 * Validate a merge: both orders must be PENDING/open, same store.
 */
export function validateMerge(
  source: Order,
  target: Order,
  storeId: string,
): string | null {
  if (source.id === target.id) return 'Cannot merge an order with itself'
  if (source.storeId !== storeId || target.storeId !== storeId)
    return 'Orders must belong to the same store'
  if (source.status !== 'PENDING') return `Source order must be PENDING (got ${source.status})`
  if (target.status !== 'PENDING') return `Target order must be PENDING (got ${target.status})`
  return null
}

/**
 * Calculate merged order total (sum of both order totals).
 */
export function calcMergedTotal(a: Order, b: Order): number {
  return a.total + b.total
}

// ─── Split-by-Items Panel ─────────────────────────────────────────────────────

function ItemSplitPanel({
  order,
  currency,
  onConfirm,
  loading,
}: {
  order: Order
  currency: string
  onConfirm: (items: Array<{ orderItemId: string; qty: number }>, newTableId?: string) => void
  loading: boolean
}) {
  // qty to move for each item (default 0 = keep in original)
  const [splitQtys, setSplitQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(order.items.map(i => [i.id, 0])),
  )

  const handleQtyChange = (id: string, val: number, max: number) => {
    setSplitQtys(prev => ({ ...prev, [id]: Math.max(0, Math.min(val, max)) }))
  }

  const splitItems = order.items
    .filter(i => splitQtys[i.id] > 0)
    .map(i => ({ orderItemId: i.id, qty: splitQtys[i.id] }))

  const splitSubtotal = order.items.reduce(
    (s, i) => s + (i.price - i.discount) * (splitQtys[i.id] ?? 0),
    0,
  )
  const remainSubtotal = order.subtotal - splitSubtotal

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--text-3)]">
        Pilih jumlah item yang ingin dipindah ke sub-order baru.
      </p>

      <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {order.items.map(item => (
          <div key={item.id} className="flex items-center gap-3 px-3 py-2">
            <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text-1)]">{item.name}</p>
              {item.variantName && (
                <p className="text-xs text-[var(--text-3)]">{item.variantName}</p>
              )}
            </div>
            <span className="text-xs text-[var(--text-3)] mr-2">
              {fmt(item.price, currency)} × {item.qty}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="w-6 h-6 rounded border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)] text-sm font-bold flex items-center justify-center"
                onClick={() => handleQtyChange(item.id, (splitQtys[item.id] ?? 0) - 1, item.qty)}
              >
                −
              </button>
              <span className="w-6 text-center text-sm tabular-nums">
                {splitQtys[item.id] ?? 0}
              </span>
              <button
                type="button"
                className="w-6 h-6 rounded border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)] text-sm font-bold flex items-center justify-center"
                onClick={() => handleQtyChange(item.id, (splitQtys[item.id] ?? 0) + 1, item.qty)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Totals preview */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-[var(--bg-subtle)] p-3 border border-[var(--border)]">
          <p className="text-xs text-[var(--text-3)] mb-1">Order Asli (sisa)</p>
          <p className="font-semibold text-[var(--text-1)]">{fmt(remainSubtotal, currency)}</p>
        </div>
        <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
          <p className="text-xs text-blue-400 mb-1">Sub-order Baru</p>
          <p className="font-semibold text-blue-700">{fmt(splitSubtotal, currency)}</p>
        </div>
      </div>

      <button
        type="button"
        disabled={splitItems.length === 0 || loading}
        onClick={() => onConfirm(splitItems)}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
          splitItems.length > 0 && !loading
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-[var(--bg-subtle)] text-[var(--text-3)] cursor-not-allowed',
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Split className="h-4 w-4" />
        )}
        Pisahkan {splitItems.length} Item
      </button>
    </div>
  )
}

// ─── Split-by-Seats Panel ─────────────────────────────────────────────────────

function SeatSplitPanel({
  order,
  currency,
  onConfirm,
  loading,
}: {
  order: Order
  currency: string
  onConfirm: (seatCount: number) => void
  loading: boolean
}) {
  const [seats, setSeats] = useState(2)

  const buckets = distributeEvenly(order.items, seats)
  const perSeatTotal = buckets.map(b =>
    b.reduce((s, { item, qty }) => s + (item.price - item.discount) * qty, 0),
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--text-3)]">
        Bagi tagihan secara merata berdasarkan jumlah tamu.
      </p>

      {/* Seat count selector */}
      <div className="flex items-center gap-3">
        <Users className="h-5 w-5 text-[var(--text-3)]" />
        <span className="text-sm text-[var(--text-2)]">Jumlah tamu:</span>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            className="w-8 h-8 rounded-full border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)] text-lg font-bold flex items-center justify-center"
            onClick={() => setSeats(s => Math.max(2, s - 1))}
          >
            −
          </button>
          <span className="w-8 text-center font-semibold text-[var(--text-1)] tabular-nums">{seats}</span>
          <button
            type="button"
            className="w-8 h-8 rounded-full border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)] text-lg font-bold flex items-center justify-center"
            onClick={() => setSeats(s => Math.min(20, s + 1))}
          >
            +
          </button>
        </div>
      </div>

      {/* Per-seat preview */}
      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
        {perSeatTotal.map((total, i) => (
          <div key={i} className="rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] p-2.5">
            <p className="text-xs text-[var(--text-3)] mb-0.5">Tamu {i + 1}</p>
            <p className="text-sm font-semibold text-[var(--text-1)]">{fmt(total, currency)}</p>
            <p className="text-xs text-[var(--text-3)]">
              {buckets[i]?.reduce((s, b) => s + b.qty, 0) ?? 0} item
            </p>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => onConfirm(seats)}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
          !loading
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-[var(--bg-subtle)] text-[var(--text-3)] cursor-not-allowed',
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Users className="h-4 w-4" />
        )}
        Bagi ke {seats} Tamu
      </button>
    </div>
  )
}

// ─── Merge Panel ──────────────────────────────────────────────────────────────

function MergePanel({
  order,
  tableOrders,
  currency,
  onConfirm,
  loading,
}: {
  order: Order
  tableOrders: Order[]
  currency: string
  onConfirm: (targetOrderId: string) => void
  loading: boolean
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const others = tableOrders.filter(o => o.id !== order.id && o.status === 'PENDING')

  const selected = others.find(o => o.id === selectedId)
  const mergedTotal = selected ? calcMergedTotal(order, selected) : 0

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--text-3)]">
        Gabungkan order ini dengan order lain di meja yang sama.
      </p>

      {others.length === 0 ? (
        <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 rounded-lg p-3 border border-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Tidak ada order lain yang bisa digabung di meja ini.
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {others.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedId(o.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                selectedId === o.id ? 'bg-blue-50' : 'hover:bg-[var(--bg-subtle)]',
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                  selectedId === o.id
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-[var(--border-mid)]',
                )}
              >
                {selectedId === o.id && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-1)]">{o.number}</p>
                <p className="text-xs text-[var(--text-3)]">{o.items.length} item</p>
              </div>
              <span className="text-sm font-semibold text-[var(--text-2)]">
                {fmt(o.total, currency)}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
          <p className="text-green-600 font-medium">Total setelah digabung</p>
          <p className="text-green-800 font-bold text-lg mt-0.5">{fmt(mergedTotal, currency)}</p>
        </div>
      )}

      <button
        type="button"
        disabled={!selectedId || loading}
        onClick={() => selectedId && onConfirm(selectedId)}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
          selectedId && !loading
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-[var(--bg-subtle)] text-[var(--text-3)] cursor-not-allowed',
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Merge className="h-4 w-4" />
        )}
        Gabung Order
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrderSplitClient({
  order,
  tableOrders = [],
  storeId,
  currency,
  onClose,
  onSuccess,
}: OrderSplitClientProps) {
  const [mode, setMode] = useState<SplitMode>('items')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const baseUrl = `/api/orders/${order.id}`

  const handleSplitItems = useCallback(
    async (items: Array<{ orderItemId: string; qty: number }>, newTableId?: string) => {
      setError(null)
      // Client-side validation
      const valErr = validateSplitItems(order.items, items)
      if (valErr) { setError(valErr); return }

      setLoading(true)
      try {
        const res = await fetch(`${baseUrl}/split?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, newTableId }),
        })
        const data = await res.json() as { error?: string; splitOrder?: { number: string } }
        if (!res.ok) throw new Error(data.error ?? 'Split gagal')
        setSuccessMsg(`Sub-order ${data.splitOrder?.number ?? 'baru'} berhasil dibuat`)
        onSuccess?.()
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    },
    [order, storeId, baseUrl, onSuccess],
  )

  const handleSplitBySeats = useCallback(
    async (seatCount: number) => {
      setError(null)
      if (seatCount < 2) { setError('Jumlah tamu minimal 2'); return }

      // Build split items for seat 1 (move to new order) — items are distributed evenly
      const buckets = distributeEvenly(order.items, seatCount)
      // Create seatCount - 1 new sub-orders (first bucket stays in original)
      setLoading(true)
      try {
        for (let i = 1; i < buckets.length; i++) {
          const items = buckets[i].map(({ item, qty }) => ({ orderItemId: item.id, qty }))
          if (items.length === 0) continue
          const res = await fetch(`${baseUrl}/split?storeId=${storeId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items }),
          })
          const data = await res.json() as { error?: string }
          if (!res.ok) throw new Error(data.error ?? `Split tamu ${i + 1} gagal`)
        }
        setSuccessMsg(`Order dibagi ke ${seatCount} tamu`)
        onSuccess?.()
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    },
    [order, storeId, baseUrl, onSuccess],
  )

  const handleMerge = useCallback(
    async (targetOrderId: string) => {
      setError(null)
      setLoading(true)
      try {
        const res = await fetch(`${baseUrl}/merge?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetOrderId }),
        })
        const data = await res.json() as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Merge gagal')
        setSuccessMsg('Order berhasil digabung')
        onSuccess?.()
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    },
    [storeId, baseUrl, onSuccess],
  )

  const tabs: Array<{ id: SplitMode; label: string; icon: React.ReactNode }> = [
    { id: 'items', label: 'Per Item', icon: <Split className="h-3.5 w-3.5" /> },
    { id: 'seats', label: 'Per Tamu', icon: <Users className="h-3.5 w-3.5" /> },
    { id: 'merge', label: 'Gabung', icon: <Merge className="h-3.5 w-3.5" /> },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Split / Gabung Order"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div>
            <h2 className="font-semibold text-[var(--text-1)] text-base">Split / Gabung Order</h2>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              {order.number} · {fmt(order.total, currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-2)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-2 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setMode(tab.id); setError(null); setSuccessMsg(null) }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                mode === tab.id
                  ? 'bg-[var(--bg-card)] text-blue-600 shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {/* Success / Error messages */}
          {successMsg && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              <Check className="h-4 w-4 shrink-0" />
              {successMsg}
            </div>
          )}
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {mode === 'items' && (
            <ItemSplitPanel
              order={order}
              currency={currency}
              onConfirm={handleSplitItems}
              loading={loading}
            />
          )}
          {mode === 'seats' && (
            <SeatSplitPanel
              order={order}
              currency={currency}
              onConfirm={handleSplitBySeats}
              loading={loading}
            />
          )}
          {mode === 'merge' && (
            <MergePanel
              order={order}
              tableOrders={tableOrders}
              currency={currency}
              onConfirm={handleMerge}
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  )
}
