'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X,
  Printer,
  XCircle,
  User,
  Receipt,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Minus,
  Plus,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Order, OrderItem } from './OrderManagementClient'

// ─── Payment method labels ────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Bank Transfer',
  QRIS: 'QRIS',
  OTHER: 'Other',
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  VOIDED: 'bg-red-100 text-red-600',
  REFUNDED: 'bg-slate-100 text-stone-500',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[status] ?? 'bg-slate-100 text-stone-500'
      }`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

interface TimelineEvent {
  label: string
  at?: string
  active: boolean
  icon: React.ReactNode
}

function OrderTimeline({ order }: { order: Order }) {
  const events: TimelineEvent[] = [
    {
      label: 'Created',
      at: order.createdAt,
      active: true,
      icon: <Clock className="h-4 w-4" />,
    },
    {
      label: 'Paid',
      at: order.status !== 'PENDING' ? order.createdAt : undefined,
      active: order.status !== 'PENDING',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      label: order.status === 'VOIDED' ? 'Voided' : 'Refunded',
      active: order.status === 'REFUNDED' || order.status === 'VOIDED',
      icon: <AlertCircle className="h-4 w-4" />,
    },
  ]

  return (
    <div className="px-6 py-4 border-t border-stone-100">
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
        Timeline
      </h3>
      <ol className="flex items-center gap-0">
        {events.map((ev, i) => (
          <li key={i} className="flex flex-1 items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                  ev.active
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                    : 'border-stone-200 bg-white text-stone-300'
                }`}
              >
                {ev.icon}
              </div>
              <span
                className={`mt-1 text-xs font-medium ${
                  ev.active ? 'text-stone-700' : 'text-stone-300'
                }`}
              >
                {ev.label}
              </span>
              {ev.at && ev.active && (
                <span className="text-[10px] text-stone-400">
                  {formatDate(ev.at)}
                </span>
              )}
            </div>
            {i < events.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1 mb-6 ${
                  events[i + 1].active ? 'bg-indigo-200' : 'bg-stone-100'
                }`}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

// ─── Refund panel ─────────────────────────────────────────────────────────────

interface RefundPanelProps {
  order: Order
  currency: string
  onRefunded: (updated: Order) => void
  onCancel: () => void
}

function RefundPanel({ order, currency, onRefunded, onCancel }: RefundPanelProps) {
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [qtys, setQtys] = useState<Record<string, number>>(
    Object.fromEntries(order.items.map(i => [i.id, i.qty])),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function adjustQty(id: string, delta: number) {
    const item = order.items.find(i => i.id === id)
    if (!item) return
    setQtys(prev => ({
      ...prev,
      [id]: Math.max(0, Math.min(item.qty, (prev[id] ?? item.qty) + delta)),
    }))
  }

  // Compute refund total for display
  const refundTotal =
    mode === 'full'
      ? order.total
      : order.items.reduce((sum, item) => {
          const qty = qtys[item.id] ?? 0
          const unitNet = item.subtotal / item.qty
          return sum + unitNet * qty
        }, 0)

  async function submit() {
    setLoading(true)
    setError(null)
    try {
      const body =
        mode === 'partial'
          ? { items: order.items.map(i => ({ id: i.id, qty: qtys[i.id] ?? 0 })).filter(i => i.qty > 0) }
          : undefined

      const res = await fetch(`/api/orders/${order.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as any
        throw new Error(j.error ?? 'Refund failed')
      }
      const updated: Order = await res.json()
      onRefunded(updated)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-6 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4">
      <h4 className="text-sm font-semibold text-amber-800">Refund Order</h4>

      {/* Mode toggle */}
      <div className="flex gap-2">
        {(['full', 'partial'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m
                ? 'bg-amber-500 text-white'
                : 'bg-white border border-amber-200 text-amber-700 hover:bg-amber-100'
            }`}
          >
            {m === 'full' ? 'Full refund' : 'Partial refund'}
          </button>
        ))}
      </div>

      {/* Partial item qty editor */}
      {mode === 'partial' && (
        <div className="rounded-lg border border-amber-200 bg-white divide-y divide-stone-50 text-sm">
          {order.items.map(item => (
            <div key={item.id} className="flex items-center justify-between px-3 py-2">
              <span className="text-stone-700 flex-1 truncate pr-2">
                {item.name}
                {item.variantName && (
                  <span className="text-stone-400 ml-1">({item.variantName})</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustQty(item.id, -1)}
                  className="flex h-6 w-6 items-center justify-center rounded border border-stone-200 hover:bg-stone-100 disabled:opacity-40"
                  disabled={(qtys[item.id] ?? 0) <= 0}
                  aria-label={`Decrease qty for ${item.name}`}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-8 text-center font-medium">
                  {qtys[item.id] ?? 0}
                </span>
                <button
                  onClick={() => adjustQty(item.id, 1)}
                  className="flex h-6 w-6 items-center justify-center rounded border border-stone-200 hover:bg-stone-100 disabled:opacity-40"
                  disabled={(qtys[item.id] ?? 0) >= item.qty}
                  aria-label={`Increase qty for ${item.name}`}
                >
                  <Plus className="h-3 w-3" />
                </button>
                <span className="w-24 text-right text-stone-500">
                  / {item.qty} ordered
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Refund summary */}
      <div className="flex justify-between text-sm font-medium text-amber-900">
        <span>Refund amount:</span>
        <span>{formatCurrency(refundTotal, currency)}</span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={loading || (mode === 'partial' && Object.values(qtys).every(q => q === 0))}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirm Refund
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  order: Order
  currency: string
  onClose: () => void
  onVoided: () => void
  onRefunded?: () => void
}

export function OrderDetailModal({
  order: initialOrder,
  currency,
  onClose,
  onVoided,
  onRefunded,
}: Props) {
  const [order, setOrder] = useState(initialOrder)
  const [panel, setPanel] = useState<'void' | 'refund' | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Trap body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  async function handleVoid() {
    setVoiding(true)
    setVoidError(null)
    try {
      const res = await fetch(`/api/orders/${order.id}/void`, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as any
        throw new Error(body.error ?? 'Failed to void order')
      }
      onVoided()
    } catch (err: any) {
      setVoidError(err.message ?? 'Something went wrong')
    } finally {
      setVoiding(false)
    }
  }

  function handleRefunded(updated: Order) {
    setOrder(updated)
    setPanel(null)
    onRefunded?.()
  }

  const totalPaid = order.payments.reduce((s, p) => s + p.amount, 0)
  const totalChange = order.payments.reduce((s, p) => s + p.change, 0)

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order.number}`}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between border-b border-stone-100 px-6 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                <Receipt className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-stone-800">
                  {order.number}
                </h2>
                <p className="text-xs text-stone-400">{formatDate(order.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              <button
                onClick={onClose}
                className="ml-2 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* ── Meta row ── */}
          <div className="grid grid-cols-2 gap-4 border-b border-gray-50 px-6 py-4 text-sm">
            <div className="flex items-center gap-2 text-stone-600">
              <User className="h-4 w-4 shrink-0 text-stone-400" />
              <span className="font-medium">Cashier:</span>
              <span>{order.user?.name ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-stone-600">
              <User className="h-4 w-4 shrink-0 text-stone-400" />
              <span className="font-medium">Customer:</span>
              <span>
                {order.customer?.name ?? (
                  <em className="text-stone-400">Walk-in</em>
                )}
              </span>
            </div>
          </div>

          {/* ── Items table ── */}
          <div className="px-6 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Items
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs text-stone-400">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="w-12 pb-2 text-center font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Price</th>
                  <th className="pb-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {order.items.map(item => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-stone-700">{item.name}</p>
                      {item.variantName && (
                        <p className="text-xs text-stone-400">{item.variantName}</p>
                      )}
                      {item.discount > 0 && (
                        <p className="text-xs text-red-500">
                          -{formatCurrency(item.discount, currency)} disc.
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 text-center text-stone-600">
                      {item.qty}
                    </td>
                    <td className="py-2.5 text-right text-stone-600">
                      {formatCurrency(item.price, currency)}
                    </td>
                    <td className="py-2.5 text-right font-medium text-stone-700">
                      {formatCurrency(item.subtotal, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Totals ── */}
          <div className="space-y-1.5 border-t border-stone-100 px-6 py-4 text-sm">
            <div className="flex justify-between text-stone-600">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal, currency)}</span>
            </div>
            {order.discountAmt > 0 && (
              <div className="flex justify-between text-red-500">
                <span>Diskon</span>
                <span>-{formatCurrency(order.discountAmt, currency)}</span>
              </div>
            )}
            {order.taxAmt > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Pajak</span>
                <span>{formatCurrency(order.taxAmt, currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-stone-100 pt-1 text-base font-semibold text-stone-800">
              <span>Total</span>
              <span>{formatCurrency(order.total, currency)}</span>
            </div>
          </div>

          {/* ── Payments ── */}
          <div className="border-t border-stone-100 px-6 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Payment
            </h3>
            <div className="space-y-2">
              {order.payments.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-stone-700">
                      {PAYMENT_LABELS[p.method] ?? p.method}
                    </span>
                    {p.reference && (
                      <span className="text-xs text-stone-400">#{p.reference}</span>
                    )}
                  </div>
                  <span className="font-medium text-stone-700">
                    {formatCurrency(p.amount, currency)}
                  </span>
                </div>
              ))}
              {totalChange > 0 && (
                <div className="flex justify-between border-t border-gray-50 pt-1 text-sm text-stone-500">
                  <span>Kembalian</span>
                  <span>{formatCurrency(totalChange, currency)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Note ── */}
          {order.note && (
            <div className="border-t border-stone-100 px-6 py-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                Note
              </h3>
              <p className="text-sm text-stone-600">{order.note}</p>
            </div>
          )}

          {/* ── Timeline ── */}
          <OrderTimeline order={order} />

          {/* ── Void confirm panel ── */}
          {panel === 'void' && (
            <div className="mx-6 mb-4 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">
                Void order {order.number}? This will restore stock and cannot be
                undone.
              </p>
              {voidError && <p className="text-xs text-red-600">{voidError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleVoid}
                  disabled={voiding}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {voiding && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Void
                </button>
                <button
                  onClick={() => { setPanel(null); setVoidError(null) }}
                  disabled={voiding}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Refund panel ── */}
          {panel === 'refund' && (
            <RefundPanel
              order={order}
              currency={currency}
              onRefunded={handleRefunded}
              onCancel={() => setPanel(null)}
            />
          )}

          {/* ── Footer actions ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-6 pt-2 pb-6">
            {/* Left: print */}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              <Printer className="h-4 w-4" />
              Reprint Receipt
            </button>

            {/* Right: action buttons */}
            <div className="flex gap-2">
              {order.status === 'PAID' && panel !== 'refund' && (
                <button
                  onClick={() => setPanel('refund')}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  <RotateCcw className="h-4 w-4" />
                  Refund
                </button>
              )}
              {order.status === 'PENDING' && panel !== 'void' && (
                <button
                  onClick={() => setPanel('void')}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                >
                  <XCircle className="h-4 w-4" />
                  Void Order
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
