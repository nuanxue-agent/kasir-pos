'use client'

import { X, Printer } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptItem {
  name: string
  qty: number
  price: number
  subtotal: number
}

export interface ReceiptPayment {
  method: string
  amount: number
  change: number
}

export interface ReceiptData {
  id: string
  number: string
  createdAt: string
  items: ReceiptItem[]
  payments: ReceiptPayment[]
  subtotal: number
  taxAmt: number
  total: number
  discountAmt?: number
}

interface ReceiptModalProps {
  receipt: ReceiptData
  storeName: string
  currency: string
  taxRate: number
  receiptNote?: string | null
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(n)
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  QRIS: 'QRIS',
  TRANSFER: 'Bank Transfer',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReceiptModal({
  receipt,
  storeName,
  currency,
  taxRate,
  receiptNote,
  onClose,
}: ReceiptModalProps) {
  const dateObj = new Date(receipt.createdAt)
  const dateStr = dateObj.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timeStr = dateObj.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const primaryPayment = receipt.payments[0]

  return (
    <>
      {/* ── Print-specific styles ── */}
      <style>{`
        @media print {
          body > *:not(#receipt-print-root) { display: none !important; }
          #receipt-print-root { display: block !important; }
          #receipt-print-root .no-print { display: none !important; }
          #receipt-print-root .receipt-content {
            width: 72mm;
            margin: 0 auto;
            padding: 0;
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            color: #000;
            background: #fff;
          }
        }
        @media screen {
          #receipt-print-root .receipt-content {
            font-family: 'Courier New', Courier, monospace;
          }
        }
      `}</style>

      {/* ── Screen overlay ── */}
      <div
        id="receipt-print-root"
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      >
        {/* Modal shell */}
        <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-2xl overflow-hidden">
          {/* Header — hidden on print */}
          <div className="no-print flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-stone-800">Receipt</h2>
            </div>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 transition-colors"
              aria-label="Close receipt"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Receipt body */}
          <div className="p-5 overflow-y-auto max-h-[70vh]">
            <div className="receipt-content bg-white rounded-xl p-5 text-stone-800 text-xs">
              {/* Store name */}
              <div className="text-center mb-3">
                <p className="font-bold text-sm uppercase tracking-widest">{storeName}</p>
                <div className="border-t border-dashed border-stone-400 my-2" />
              </div>

              {/* Order info */}
              <div className="space-y-0.5 mb-3">
                <div className="flex justify-between">
                  <span className="text-stone-500">No.</span>
                  <span className="font-semibold">{receipt.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Date</span>
                  <span>{dateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Time</span>
                  <span>{timeStr}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-stone-400 my-2" />

              {/* Items */}
              <table className="w-full mb-1" aria-label="Order items">
                <thead>
                  <tr className="text-stone-500">
                    <th className="text-left font-normal pb-1">Item</th>
                    <th className="text-center font-normal pb-1 w-8">Qty</th>
                    <th className="text-right font-normal pb-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-0.5 pr-2">
                        <p className="leading-tight">{item.name}</p>
                        <p className="text-stone-400 text-[10px]">
                          {fmt(item.price, currency)} × {item.qty}
                        </p>
                      </td>
                      <td className="text-center py-0.5">{item.qty}</td>
                      <td className="text-right py-0.5 font-medium">
                        {fmt(item.subtotal, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-dashed border-stone-400 my-2" />

              {/* Totals */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span>{fmt(receipt.subtotal, currency)}</span>
                </div>
                {(receipt.discountAmt ?? 0) > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Diskon</span>
                    <span>- {fmt(receipt.discountAmt!, currency)}</span>
                  </div>
                )}
                {taxRate > 0 && receipt.taxAmt > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Tax ({(taxRate * 100).toFixed(0)}%)</span>
                    <span>{fmt(receipt.taxAmt, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-stone-300">
                  <span>TOTAL</span>
                  <span>{fmt(receipt.total, currency)}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-stone-400 my-2" />

              {/* Payment */}
              {primaryPayment && (
                <div className="space-y-0.5">
                  <div className="flex justify-between text-stone-600">
                    <span>Payment</span>
                    <span>{METHOD_LABELS[primaryPayment.method] ?? primaryPayment.method}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Paid</span>
                    <span>{fmt(primaryPayment.amount, currency)}</span>
                  </div>
                  {primaryPayment.change > 0 && (
                    <div className="flex justify-between text-stone-600">
                      <span>Kembalian</span>
                      <span>{fmt(primaryPayment.change, currency)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Receipt note */}
              {receiptNote && (
                <>
                  <div className="border-t border-dashed border-stone-400 my-2" />
                  <p className="text-center text-stone-500 text-[10px] leading-snug">{receiptNote}</p>
                </>
              )}

              {/* Footer */}
              <div className="border-t border-dashed border-stone-400 mt-2 pt-2 text-center text-stone-400 text-[10px]">
                Thank you for your purchase!
              </div>
            </div>
          </div>

          {/* Action buttons — hidden on print */}
          <div className="no-print flex gap-3 px-5 py-4 border-t border-white/5">
            <button
              onClick={() => window.print()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/20"
            >
              <Printer className="h-4 w-4" />
              Print Receipt
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-600 text-sm font-medium hover:text-stone-800 hover:bg-stone-100 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
