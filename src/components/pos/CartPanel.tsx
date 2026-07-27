'use client'

import { useState, useCallback } from 'react'
import { useCartStore } from '@/store/cart'
import { formatCurrency } from '@/lib/utils'
import { Minus, Plus, Trash2, Tag, User, FileText, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CartPanelProps {
  storeId: string
  taxRate: number
  currency: string
  onCheckout: () => void
}

export default function CartPanel({ storeId, taxRate, currency, onCheckout }: CartPanelProps) {
  const {
    items,
    discountCode,
    discountAmt,
    note,
    updateQty,
    removeItem,
    setNote,
    clearCart,
    subtotal,
    taxAmt,
    total,
  } = useCartStore()

  const fmt = (n: number) => formatCurrency(n, currency)

  return (
    <div className="flex flex-col h-full bg-white border-l border-stone-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
        <h2 className="text-sm font-semibold text-stone-800">Current Order</h2>
        {items.length > 0 && (
          <button
            onClick={clearCart}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-stone-500">
            <Tag size={40} strokeWidth={1} />
            <p className="text-sm">Add items to start an order</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {items.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-700 truncate">{item.name}</p>
                    {item.variantName && (
                      <p className="text-xs text-stone-500">{item.variantName}</p>
                    )}
                    <p className="text-xs text-stone-500">{fmt(item.price)}</p>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors mt-0.5"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      className="w-6 h-6 rounded bg-stone-200 hover:bg-stone-300 flex items-center justify-center text-stone-700 transition-colors"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-sm text-stone-700 w-6 text-center">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      className="w-6 h-6 rounded bg-stone-200 hover:bg-stone-300 flex items-center justify-center text-stone-700 transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <span className="text-sm font-medium text-stone-700">{fmt(item.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Note */}
      {items.length > 0 && (
        <div className="px-4 py-2 border-t border-stone-200">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add order note..."
            rows={2}
            className="w-full bg-stone-50 text-sm text-stone-800 placeholder-stone-400 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
      )}

      {/* Totals */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-t border-stone-200 space-y-1.5">
          <div className="flex justify-between text-sm text-stone-500">
            <span>Subtotal</span>
            <span>{fmt(subtotal())}</span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-sm text-green-400">
              <span>Discount {discountCode && `(${discountCode})`}</span>
              <span>-{fmt(discountAmt)}</span>
            </div>
          )}
          {taxRate > 0 && (
            <div className="flex justify-between text-sm text-stone-500">
              <span>Tax ({(taxRate * 100).toFixed(0)}%)</span>
              <span>{fmt(taxAmt(taxRate))}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-stone-800 pt-1 border-t border-stone-200">
            <span>Total</span>
            <span>{fmt(total(taxRate))}</span>
          </div>
        </div>
      )}

      {/* Checkout button */}
      <div className="px-4 py-3 border-t border-stone-200">
        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className={cn(
            'w-full py-3 rounded-lg font-semibold text-sm transition-all',
            items.length === 0
              ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
              : 'bg-amber-500 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 active:scale-98'
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <CreditCard size={16} />
            <span>Checkout — {fmt(total(taxRate))}</span>
          </div>
        </button>
      </div>
    </div>
  )
}
