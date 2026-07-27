'use client'

import { useState } from 'react'
import { Printer, X, Share2, Copy, Check } from 'lucide-react'

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
  /** Customer phone — used for WhatsApp sharing */
  customerPhone?: string | null
  /** Customer email — used for email sharing */
  customerEmail?: string | null
  /** Customer name — shown after checkout */
  customerName?: string | null
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

/** Build a plain-text receipt for sharing / clipboard */
function buildShareText(
  receipt: ReceiptData,
  storeName: string,
  currency: string,
  taxRate: number,
): string {
  const dateObj = new Date(receipt.createdAt)
  const dateStr = dateObj.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timeStr = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

  const lines: string[] = []
  lines.push(`🧾 ${storeName}`)
  lines.push('─'.repeat(28))
  lines.push(`No. ${receipt.number}`)
  lines.push(`${dateStr} ${timeStr}`)
  if (receipt.customerName) lines.push(`Customer: ${receipt.customerName}`)
  lines.push('─'.repeat(28))
  lines.push('📦 Items:')
  for (const item of receipt.items) {
    lines.push(`  ${item.name}`)
    lines.push(`  ${item.qty} × ${fmt(item.price, currency)} = ${fmt(item.subtotal, currency)}`)
  }
  lines.push('─'.repeat(28))
  lines.push(`Subtotal: ${fmt(receipt.subtotal, currency)}`)
  if ((receipt.discountAmt ?? 0) > 0) lines.push(`Diskon: -${fmt(receipt.discountAmt!, currency)}`)
  if (taxRate > 0 && receipt.taxAmt > 0)
    lines.push(`Pajak (${(taxRate * 100).toFixed(0)}%): ${fmt(receipt.taxAmt, currency)}`)
  lines.push(`💰 TOTAL: ${fmt(receipt.total, currency)}`)
  for (const p of receipt.payments) {
    lines.push(`  ${METHOD_LABELS[p.method] ?? p.method}: ${fmt(p.amount, currency)}`)
    if (p.change > 0) lines.push(`  Kembalian: ${fmt(p.change, currency)}`)
  }
  lines.push('─'.repeat(28))
  lines.push('Terima kasih! 🙏')
  return lines.join('\n')
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
  const [copied, setCopied] = useState(false)

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

  const shareText = buildShareText(receipt, storeName, currency, taxRate)
  const encodedText = encodeURIComponent(shareText)

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `Receipt ${receipt.number}`, text: shareText })
        return
      } catch {
        // fall through to clipboard
      }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — silent fail
    }
  }

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
                {receipt.customerName && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-2)]">Customer</span>
                    <span>{receipt.customerName}</span>
                  </div>
                )}
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
          <div className="no-print flex flex-col gap-2 border-t border-white/5 px-5 py-4">
            {/* Row 1: Print + Close */}
            <div className="flex gap-3">
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

            {/* Row 2: WhatsApp + Email (conditional on customer contact) */}
            {(receipt.customerPhone || receipt.customerEmail) && (
              <div className="flex gap-2">
                {receipt.customerPhone && (
                  <a
                    href={`https://wa.me/?text=${encodedText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-600/40 bg-emerald-600/10 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-600/20"
                    aria-label="Send receipt via WhatsApp"
                  >
                    📲 WhatsApp
                  </a>
                )}
                {receipt.customerEmail && (
                  <a
                    href={`mailto:${receipt.customerEmail}?subject=Receipt%20${encodeURIComponent(receipt.number)}&body=${encodedText}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-600/40 bg-sky-600/10 py-2 text-sm font-medium text-sky-400 transition-colors hover:bg-sky-600/20"
                    aria-label="Send receipt via email"
                  >
                    📧 Email
                  </a>
                )}
              </div>
            )}

            {/* Row 3: Share / Copy */}
            <button
              onClick={handleShare}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]"
              aria-label="Share receipt"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  Share receipt
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
