'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Printer, XCircle, User, Receipt } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Order } from './OrdersPageClient'

// ─── Payment method labels ────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  CASH:     'Cash',
  CARD:     'Card',
  TRANSFER: 'Bank Transfer',
  QRIS:     'QRIS',
  OTHER:    'Other',
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  PAID:     'bg-emerald-100 text-emerald-700',
  PENDING:  'bg-yellow-100 text-yellow-700',
  VOIDED:   'bg-red-100 text-red-600',
  REFUNDED: 'bg-slate-100 text-slate-500',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-500'
      }`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  order: Order
  currency: string
  onClose: () => void
  onVoided: () => void
}

export function OrderDetailModal({ order: initialOrder, currency, onClose, onVoided }: Props) {
  const [order, setOrder]         = useState(initialOrder)
  const [confirming, setConfirming] = useState(false)
  const [voiding, setVoiding]     = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)
  const overlayRef                = useRef<HTMLDivElement>(null)

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
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleVoid() {
    setVoiding(true)
    setVoidError(null)
    try {
      const res = await fetch(`/api/orders/${order.id}/void`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to void order')
      }
      const updated: Order = await res.json()
      setOrder(updated)
      setConfirming(false)
      onVoided()
    } catch (err: any) {
      setVoidError(err.message ?? 'Something went wrong')
    } finally {
      setVoiding(false)
    }
  }

  const totalPaid   = order.payments.reduce((s, p) => s + p.amount, 0)
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
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{order.number}</h2>
                <p className="text-xs text-gray-400">{formatDate(order.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              <button
                onClick={onClose}
                className="ml-2 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* ── Meta row ── */}
          <div className="px-6 py-4 grid grid-cols-2 gap-4 text-sm border-b border-gray-50">
            <div className="flex items-center gap-2 text-gray-600">
              <User className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="font-medium">Cashier:</span>
              <span>{order.user?.name ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <User className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="font-medium">Customer:</span>
              <span>{order.customer?.name ?? <em className="text-gray-400">Walk-in</em>}</span>
            </div>
          </div>

          {/* ── Items table ── */}
          <div className="px-6 py-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Items
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium text-center w-12">Qty</th>
                  <th className="pb-2 font-medium text-right">Price</th>
                  <th className="pb-2 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-gray-800">{item.name}</p>
                      {item.variantName && (
                        <p className="text-xs text-gray-400">{item.variantName}</p>
                      )}
                      {item.discount > 0 && (
                        <p className="text-xs text-red-500">
                          -{formatCurrency(item.discount, currency)} disc.
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 text-center text-gray-600">{item.qty}</td>
                    <td className="py-2.5 text-right text-gray-600">
                      {formatCurrency(item.price, currency)}
                    </td>
                    <td className="py-2.5 text-right font-medium text-gray-800">
                      {formatCurrency(item.subtotal, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Totals ── */}
          <div className="px-6 py-4 border-t border-gray-100 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal, currency)}</span>
            </div>
            {order.discountAmt > 0 && (
              <div className="flex justify-between text-red-500">
                <span>Discount</span>
                <span>-{formatCurrency(order.discountAmt, currency)}</span>
              </div>
            )}
            {order.taxAmt > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Tax</span>
                <span>{formatCurrency(order.taxAmt, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-gray-900 text-base pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>{formatCurrency(order.total, currency)}</span>
            </div>
          </div>

          {/* ── Payments ── */}
          <div className="px-6 py-4 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Payment
            </h3>
            <div className="space-y-2">
              {order.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">
                      {PAYMENT_LABELS[p.method] ?? p.method}
                    </span>
                    {p.reference && (
                      <span className="text-xs text-gray-400">#{p.reference}</span>
                    )}
                  </div>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(p.amount, currency)}
                  </span>
                </div>
              ))}
              {totalChange > 0 && (
                <div className="flex justify-between text-sm text-gray-500 pt-1 border-t border-gray-50">
                  <span>Change</span>
                  <span>{formatCurrency(totalChange, currency)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Note ── */}
          {order.note && (
            <div className="px-6 py-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Note
              </h3>
              <p className="text-sm text-gray-600">{order.note}</p>
            </div>
          )}

          {/* ── Void confirm ── */}
          {confirming && (
            <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-sm font-medium text-red-700">
                Void order {order.number}? This will restore stock and cannot be undone.
              </p>
              {voidError && (
                <p className="text-xs text-red-600">{voidError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleVoid}
                  disabled={voiding}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {voiding ? 'Voiding…' : 'Confirm Void'}
                </button>
                <button
                  onClick={() => { setConfirming(false); setVoidError(null) }}
                  disabled={voiding}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Footer actions ── */}
          <div className="px-6 pb-6 pt-2 flex justify-between items-center border-t border-gray-100 gap-3 flex-wrap">
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </button>
            </div>

            {order.status === 'PAID' && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-medium hover:bg-red-100"
              >
                <XCircle className="h-4 w-4" />
                Void Order
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
