'use client'

import { useState } from 'react'
import { X, TrendingUp, TrendingDown, Plus, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Product {
  id: string
  name: string
  sku?: string | null
  stock: number
  lowStock: number
}

interface StockAdjustModalProps {
  product: Product
  onClose: () => void
  onSuccess: () => void
}

type AdjustType = 'RESTOCK' | 'ADJUSTMENT'

export default function StockAdjustModal({ product, onClose, onSuccess }: StockAdjustModalProps) {
  const [type, setType] = useState<AdjustType>('RESTOCK')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const qtyNum = parseInt(qty) || 0
  const effectiveQty = type === 'RESTOCK' ? Math.abs(qtyNum) : qtyNum
  const newStock = Math.max(0, product.stock + effectiveQty)

  const stockDiff = newStock - product.stock
  const stockDiffLabel = stockDiff > 0 ? `+${stockDiff}` : String(stockDiff)

  const handleSubmit = async () => {
    if (!qtyNum || qtyNum === 0) {
      setError('Quantity cannot be 0')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/inventory/${product.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          qty: effectiveQty,
          note: note || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error?.message || 'Failed to adjust stock')
        return
      }

      onSuccess()
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-stone-100 rounded-xl border border-stone-200 shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold text-stone-800">Adjust Stock</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product Info */}
        <div className="px-6 py-4 bg-stone-50 border-b border-stone-200">
          <div className="text-stone-800 font-medium">{product.name}</div>
          {product.sku && (
            <div className="text-gray-400 text-sm mt-0.5">SKU: {product.sku}</div>
          )}
          <div className="flex items-center gap-4 mt-2">
            <div className="text-sm text-gray-400">
              Current stock: <span className="text-stone-800 font-semibold">{product.stock}</span>
            </div>
            <div className="text-sm text-gray-400">
              Low stock alert: <span className="text-stone-800">{product.lowStock}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Type Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Adjustment Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setType('RESTOCK')}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-3 rounded-lg border font-medium transition-colors',
                  type === 'RESTOCK'
                    ? 'bg-green-600 border-green-500 text-white'
                    : 'bg-gray-700 border-stone-200 text-gray-300 hover:bg-gray-600'
                )}
              >
                <TrendingUp className="w-4 h-4" />
                Restock (+)
              </button>
              <button
                onClick={() => setType('ADJUSTMENT')}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-3 rounded-lg border font-medium transition-colors',
                  type === 'ADJUSTMENT'
                    ? 'bg-amber-500 border-amber-400 text-white'
                    : 'bg-gray-700 border-stone-200 text-gray-300 hover:bg-gray-600'
                )}
              >
                <TrendingDown className="w-4 h-4" />
                Adjustment (+/-)
              </button>
            </div>
          </div>

          {/* Qty Input */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Quantity
              {type === 'ADJUSTMENT' && (
                <span className="text-gray-500 ml-1">(use negative to reduce)</span>
              )}
            </label>
            <div className="flex items-center gap-2">
              {type === 'ADJUSTMENT' && (
                <button
                  onClick={() => setQty(q => {
                    const n = parseInt(q) || 0
                    return String(n > 0 ? -n : n)
                  })}
                  className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition-colors"
                >
                  {qtyNum >= 0 ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </button>
              )}
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Enter quantity"
                className="flex-1 px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Note Input */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Note <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for adjustment..."
              className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Stock Preview */}
          {qtyNum !== 0 && (
            <div className="bg-stone-50 rounded-lg p-4 space-y-2">
              <div className="text-sm font-medium text-gray-400">Preview</div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Current stock</span>
                <span className="text-stone-800 font-semibold">{product.stock}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Kembalian</span>
                <span className={cn(
                  'font-semibold',
                  stockDiff > 0 ? 'text-green-400' : stockDiff < 0 ? 'text-red-400' : 'text-gray-400'
                )}>
                  {stockDiffLabel}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-stone-200 pt-2 mt-1">
                <span className="text-stone-800 font-medium">Stok baru</span>
                <span className="text-stone-800 font-bold text-lg">{newStock}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-stone-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !qtyNum}
            className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {loading ? 'Saving...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
