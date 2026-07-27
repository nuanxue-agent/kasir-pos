'use client'

import { useState } from 'react'
import { useCartStore } from '@/store/cart'
import { formatCurrency } from '@/lib/utils'
import { X, Banknote, CreditCard, Smartphone, ArrowLeftRight, Check, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  printReceiptBrowser,
  isSerialAvailable,
  printReceiptSerial,
  type ReceiptData,
} from '@/lib/receipt'

interface PembayaranModalProps {
  storeId: string
  taxRate: number
  currency: string
  staffId: string
  storeName?: string
  storeAddress?: string
  storePhone?: string
  receiptNote?: string
  cashierName?: string
  onClose: () => void
  onSuccess: (orderId: string) => void
}

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QRIS' | 'OTHER'

const PAYMENT_METHODS = [
  { id: 'CASH' as PaymentMethod, label: 'Tunai', icon: Banknote, color: 'text-green-400' },
  { id: 'CARD' as PaymentMethod, label: 'Card', icon: CreditCard, color: 'text-violet-500' },
  { id: 'QRIS' as PaymentMethod, label: 'QRIS', icon: Smartphone, color: 'text-purple-400' },
  {
    id: 'TRANSFER' as PaymentMethod,
    label: 'Transfer',
    icon: ArrowLeftRight,
    color: 'text-orange-400',
  },
]

export default function PembayaranModal({
  storeId,
  taxRate,
  currency,
  staffId,
  onClose,
  onSuccess,
  storeName = 'Lakoo Store',
  storeAddress,
  storePhone,
  receiptNote,
  cashierName,
}: PembayaranModalProps) {
  const { items, customerId, discountId, discountAmt, note, total, subtotal, taxAmt, clearCart } =
    useCartStore()
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
          payments: [
            {
              method,
              amount: method === 'CASH' ? cashAmount : orderTotal,
              reference: reference || undefined,
              change,
            },
          ],
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as any
        setError(data.error || 'Pembayaran failed')
        return
      }

      const order = (await res.json()) as any
      clearCart()

      // ── Auto-print receipt ───────────────────────────────────────────────
      const receiptData: ReceiptData = {
        storeName,
        storeAddress,
        storePhone,
        receiptNote,
        orderNumber: order.number ?? order.id,
        date: new Date().toLocaleString(),
        cashier: cashierName,
        items: items.map(i => ({
          name: i.variantName ? `${i.name} (${i.variantName})` : i.name,
          qty: i.qty,
          price: i.price,
          subtotal: i.price * i.qty - (i.discount ?? 0),
        })),
        subtotal: subtotal(),
        taxAmt: taxAmt(taxRate),
        discountAmt: discountAmt,
        total: orderTotal,
        paid: method === 'CASH' ? cashAmount : undefined,
        change: method === 'CASH' ? change : undefined,
        currency,
        paymentMethod: method,
      }
      printReceiptBrowser(receiptData)

      onSuccess(order.id)
    } catch (e) {
      setError('Network error, please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 id="checkout-modal-title" className="text-lg font-semibold text-[var(--text-1)]">
            Pembayaran
          </h2>
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Order summary */}
          <div className="space-y-2 rounded-lg bg-[var(--bg-muted)] p-4">
            <div className="flex justify-between text-sm text-[var(--text-2)]">
              <span>Subtotal</span>
              <span>{fmt(subtotal())}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-sm text-green-400">
                <span>Diskon</span>
                <span>-{fmt(discountAmt)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-sm text-[var(--text-2)]">
                <span>Pajak ({(taxRate * 100).toFixed(0)}%)</span>
                <span>{fmt(taxAmt(taxRate))}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[var(--border)] pt-2 text-lg font-bold text-[var(--text-1)]">
              <span>Total</span>
              <span>{fmt(orderTotal)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <p className="mb-2 text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
              Metode Pembayaran
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(({ id, label, icon: Icon, color }) => (
                <button
                  key={id}
                  onClick={() => setMethod(id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border py-3 text-sm transition-all',
                    method === id
                      ? 'border-indigo-500 bg-amber-500/10 text-amber-600'
                      : 'border-[var(--border)] bg-[var(--bg-muted)] text-[var(--text-2)] hover:border-[var(--border)]',
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
              <p className="mb-2 text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                Tunai Given
              </p>
              <input
                type="number"
                value={cashGiven}
                onChange={(e: any) => setTunaiGiven(e.target.value)}
                placeholder={fmt(orderTotal)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
              {/* Quick amounts */}
              <div className="mt-2 flex gap-2">
                {quickTunai.slice(0, 3).map(amount => (
                  <button
                    key={amount}
                    onClick={() => setTunaiGiven(String(amount))}
                    className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-muted)] py-1.5 text-xs text-[var(--text-2)] transition-colors hover:border-stone-400"
                  >
                    {fmt(amount)}
                  </button>
                ))}
              </div>
              {cashAmount >= orderTotal && (
                <div className="mt-3 flex justify-between text-sm font-medium">
                  <span className="text-[var(--text-2)]">Kembalian</span>
                  <span className="text-green-400">{fmt(change)}</span>
                </div>
              )}
            </div>
          )}

          {/* Reference for card/transfer */}
          {(method === 'CARD' || method === 'TRANSFER') && (
            <div>
              <p className="mb-2 text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                {method === 'CARD' ? 'Card Reference' : 'Transfer Reference'} (optional)
              </p>
              <input
                type="text"
                value={reference}
                onChange={(e: any) => setReference(e.target.value)}
                placeholder="Contoh: 4 digit terakhir, nomor ref"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-400/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          {/* Confirm button */}
          <button
            onClick={handlePembayaran}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-semibold text-white transition-colors hover:bg-green-500 disabled:bg-stone-200 disabled:text-[var(--text-2)]"
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
