'use client'

import { useState } from 'react'
import { useCartStore } from '@/store/cart'
import { formatCurrency } from '@/lib/utils'
import { X, Banknote, CreditCard, Smartphone, ArrowLeftRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PembayaranModalProps {
  storeId: string
  taxRate: number
  currency: string
  staffId: string
  onClose: () => void
  onSuccess: (orderId: string) => void
}

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QRIS' | 'OTHER'

const PAYMENT_METHODS = [
  { id: 'CASH' as PaymentMethod, label: 'Tunai', icon: Banknote, color: 'text-green-400' },
  { id: 'CARD' as PaymentMethod, label: 'Card', icon: CreditCard, color: 'text-blue-400' },
  { id: 'QRIS' as PaymentMethod, label: 'QRIS', icon: Smartphone, color: 'text-purple-400' },
  { id: 'TRANSFER' as PaymentMethod, label: 'Transfer', icon: ArrowLeftRight, color: 'text-orange-400' },
]

export default function PembayaranModal({
  storeId, taxRate, currency, staffId, onClose, onSuccess
}: PembayaranModalProps) {
  const { items, customerId, discountId, discountAmt, note, total, subtotal, taxAmt, clearCart } = useCartStore()
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [cashGiven, setTunaiGiven] = useState('')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fmt = (n: number) => formatCurrency(n, currency)
  const orderTotal = total(taxRate)
  const cashAmount = parseFloat(cashGiven) || 0
  const change = method === 'CASH' ? Math.max(0, cashAmount - orderTotal) : 0

  const quickTunai = [
    Math.ceil(orderTotal / 10000) * 10000,
    Math.ceil(orderTotal / 50000) * 50000,
    Math.ceil(orderTotal / 100000) * 100000,
  ].filter((v, i, a) => a.indexOf(v) === i && v >= orderTotal)

  const handlePembayaran = async () => {
    if (method === 'CASH' && cashAmount < orderTotal) {
      setError('Tunai given is less than total')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          customerId,
          discountId,
          note,
          items: items.map(i => ({
            productId: i.productId,
            variantId: i.variantId,
            name: i.name,
            variantName: i.variantName,
            price: i.price,
            qty: i.qty,
            discount: i.discount,
          })),
          payments: [{
            method,
            amount: method === 'CASH' ? cashAmount : orderTotal,
            reference: reference || undefined,
            change,
          }],
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Pembayaran failed')
        return
      }

      const order = await res.json()
      clearCart()
      onSuccess(order.id)
    } catch (e) {
      setError('Network error, please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold text-stone-800">Pembayaran</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Order summary */}
          <div className="bg-stone-100 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm text-stone-500">
              <span>Subtotal</span><span>{fmt(subtotal())}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-sm text-green-400">
                <span>Discount</span><span>-{fmt(discountAmt)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-sm text-stone-500">
                <span>Pajak ({(taxRate * 100).toFixed(0)}%)</span><span>{fmt(taxAmt(taxRate))}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-stone-800 pt-2 border-t border-stone-200">
              <span>Total</span><span>{fmt(orderTotal)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">Metode Pembayaran</p>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(({ id, label, icon: Icon, color }) => (
                <button
                  key={id}
                  onClick={() => setMethod(id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-all text-sm',
                    method === id
                      ? 'border-indigo-500 bg-amber-500/10 text-amber-600'
                      : 'border-stone-200 bg-stone-100 text-stone-500 hover:border-stone-200'
                  )}
                >
                  <Icon size={18} className={method === id ? 'text-amber-600' : color} />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tunai input */}
          {method === 'CASH' && (
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">Tunai Given</p>
              <input
                type="number"
                value={cashGiven}
                onKembalian={e => setTunaiGiven(e.target.value)}
                placeholder={fmt(orderTotal)}
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {/* Quick amounts */}
              <div className="flex gap-2 mt-2">
                {quickTunai.slice(0, 3).map(amount => (
                  <button
                    key={amount}
                    onClick={() => setTunaiGiven(String(amount))}
                    className="flex-1 text-xs py-1.5 rounded bg-stone-100 border border-stone-200 text-stone-600 hover:border-stone-400 transition-colors"
                  >
                    {fmt(amount)}
                  </button>
                ))}
              </div>
              {cashAmount >= orderTotal && (
                <div className="mt-3 flex justify-between text-sm font-medium">
                  <span className="text-stone-500">Kembalian</span>
                  <span className="text-green-400">{fmt(change)}</span>
                </div>
              )}
            </div>
          )}

          {/* Reference for card/transfer */}
          {(method === 'CARD' || method === 'TRANSFER') && (
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">
                {method === 'CARD' ? 'Card Reference' : 'Transfer Reference'} (optional)
              </p>
              <input
                type="text"
                value={reference}
                onKembalian={e => setReference(e.target.value)}
                placeholder="Contoh: 4 digit terakhir, nomor ref"
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Confirm button */}
          <button
            onClick={handlePembayaran}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-stone-200 disabled:text-stone-500 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Processing...</span>
            ) : (
              <>
                <Check size={18} />
                <span>Confirm Payment — {fmt(orderTotal)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
