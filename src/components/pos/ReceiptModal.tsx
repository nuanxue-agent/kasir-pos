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
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-modal-title"
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      >
        {/* Modal shell */}
        <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
          {/* Header — hidden on print */}
          <div className="no-print flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-indigo-400" aria-hidden="true" />
              <h2 id="receipt-modal-title" className="text-sm font-semibold text-[var(--text-1)]">
                Receipt
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close receipt"
              className="text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Receipt body */}
          <div className="max-h-[70vh] overflow-y-auto p-5">
            <div className="receipt-content rounded-xl bg-[var(--bg-card)] p-5 text-xs text-[var(--text-1)]">
              {/* Store name */}
              <div className="mb-3 text-center">
                <p className="text-sm font-bold tracking-widest uppercase">{storeName}</p>
                <div className="my-2 border-t border-dashed border-stone-400" />
              </div>

              {/* Order info */}
              <div className="mb-3 space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-[var(--text-2)]">No.</span>
                  <span className="font-semibold">{receipt.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-2)]">Date</span>
                  <span>{dateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-2)]">Time</span>
                  <span>{timeStr}</span>
                </div>
              </div>

              <div className="my-2 border-t border-dashed border-stone-400" />

              {/* Items */}
              <table className="mb-1 w-full" aria-label="Order items">
                <thead>
                  <tr className="text-[var(--text-2)]">
                    <th className="pb-1 text-left font-normal">Item</th>
                    <th className="w-8 pb-1 text-center font-normal">Qty</th>
                    <th className="pb-1 text-right font-normal">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-0.5 pr-2">
                        <p className="leading-tight">{item.name}</p>
                        <p className="text-[10px] text-[var(--text-3)]">
                          {fmt(item.price, currency)} × {item.qty}
                        </p>
                      </td>
                      <td className="py-0.5 text-center">{item.qty}</td>
                      <td className="py-0.5 text-right font-medium">
                        {fmt(item.subtotal, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="my-2 border-t border-dashed border-stone-400" />

              {/* Totals */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[var(--text-2)]">
                  <span>Subtotal</span>
                  <span>{fmt(receipt.subtotal, currency)}</span>
                </div>
                {(receipt.discountAmt ?? 0) > 0 && (
                  <div className="flex justify-between text-[var(--text-2)]">
                    <span>Diskon</span>
                    <span>- {fmt(receipt.discountAmt!, currency)}</span>
                  </div>
                )}
                {taxRate > 0 && receipt.taxAmt > 0 && (
                  <div className="flex justify-between text-[var(--text-2)]">
                    <span>Tax ({(taxRate * 100).toFixed(0)}%)</span>
                    <span>{fmt(receipt.taxAmt, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-stone-300 pt-1 text-sm font-bold">
                  <span>TOTAL</span>
                  <span>{fmt(receipt.total, currency)}</span>
                </div>
              </div>

              <div className="my-2 border-t border-dashed border-stone-400" />

              {/* Payment */}
              {primaryPayment && (
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[var(--text-2)]">
                    <span>Payment</span>
                    <span>{METHOD_LABELS[primaryPayment.method] ?? primaryPayment.method}</span>
                  </div>
                  <div className="flex justify-between text-[var(--text-2)]">
                    <span>Paid</span>
                    <span>{fmt(primaryPayment.amount, currency)}</span>
                  </div>
                  {primaryPayment.change > 0 && (
                    <div className="flex justify-between text-[var(--text-2)]">
                      <span>Kembalian</span>
                      <span>{fmt(primaryPayment.change, currency)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Receipt note */}
              {receiptNote && (
                <>
                  <div className="my-2 border-t border-dashed border-stone-400" />
                  <p className="text-center text-[10px] leading-snug text-[var(--text-2)]">
                    {receiptNote}
                  </p>
                </>
              )}

              {/* Footer */}
              <div className="mt-2 border-t border-dashed border-stone-400 pt-2 text-center text-[10px] text-[var(--text-3)]">
                Thank you for your purchase!
              </div>
            </div>
          </div>

          {/* Action buttons — hidden on print */}
          <div className="no-print flex gap-3 border-t border-white/5 px-5 py-4">
            <button
              onClick={() => window.print()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-opacity hover:opacity-90"
            >
              <Printer className="h-4 w-4" />
              Print Receipt
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
