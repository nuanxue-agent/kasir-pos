'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Printer, RotateCcw, User, Receipt, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { printReceiptBrowser, type ReceiptData } from '@/lib/receipt'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string
  productId: string
  name: string
  variantName?: string | null
  price: number
  qty: number
  discount: number
  subtotal: number
}

export interface Payment {
  id: string
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'QRIS' | 'OTHER'
  amount: number
  reference?: string | null
  change: number
}

export interface OrderDetail {
  id: string
  number: string
  status: 'PENDING' | 'PAID' | 'VOIDED' | 'REFUNDED'
  subtotal: number
  discountAmt: number
  taxAmt: number
  total: number
  note?: string | null
  createdAt: string
  customerName?: string | null
  userName?: string | null
  items: OrderItem[]
  payments: Payment[]
}

// ─── Payment labels ───────────────────────────────────────────────────────────

export const PAYMENT_LABELS: Record<string, string> = {
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
  REFUNDED: 'bg-slate-100 text-[var(--text-2)]',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[status] ?? 'bg-slate-100 text-[var(--text-2)]'
      }`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orderId: string
  storeId: string
  currency: string
  role: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OrderDetailClient({ orderId, storeId, currency, role }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [confirmRefund, setConfirmRefund] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)

  const canRefund = ['OWNER', 'MANAGER'].includes(role)

  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useQuery<OrderDetail>({
    queryKey: ['order', orderId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch order')
      return res.json()
    },
  })

  const refundMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${orderId}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REFUNDED' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as any
        throw new Error(body.error ?? 'Failed to process refund')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setConfirmRefund(false)
      setRefundError(null)
      refetch()
    },
    onError: (err: any) => {
      setRefundError(err.message ?? 'Something went wrong')
    },
  })

  function handlePrint() {
    if (!order) return
    const totalPaid = order.payments.reduce((s, p) => s + p.amount, 0)
    const totalChange = order.payments.reduce((s, p) => s + p.change, 0)
    const primaryPayment = order.payments[0]

    const data: ReceiptData = {
      storeName: 'Kasir',
      orderNumber: order.number,
      date: formatDate(order.createdAt),
      cashier: order.userName ?? undefined,
      customerName: order.customerName ?? undefined,
      items: order.items.map(i => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        subtotal: i.subtotal,
      })),
      subtotal: order.subtotal,
      discountAmt: order.discountAmt,
      taxAmt: order.taxAmt,
      total: order.total,
      paid: totalPaid,
      change: totalChange,
      currency,
      paymentMethod: primaryPayment
        ? (PAYMENT_LABELS[primaryPayment.method] ?? primaryPayment.method)
        : undefined,
    }

    printReceiptBrowser(data)
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl animate-pulse space-y-4 p-6">
        <div className="h-8 w-48 rounded-lg bg-[var(--bg-muted)]" />
        <div className="h-64 rounded-xl bg-[var(--bg-muted)]" />
        <div className="h-32 rounded-xl bg-[var(--bg-muted)]" />
      </div>
    )
  }

  if (isError || !order) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <AlertTriangle className="h-10 w-10 text-red-400" />
          <p className="text-[var(--text-2)]">Order not found or failed to load.</p>
          <button
            onClick={() => refetch()}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--bg-subtle)]"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const totalPaid = order.payments.reduce((s, p) => s + p.amount, 0)
  const totalChange = order.payments.reduce((s, p) => s + p.change, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
        aria-label="Back to orders"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Orders
      </button>

      {/* Header card */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
              <Receipt className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-1)]">{order.number}</h1>
              <p className="text-sm text-[var(--text-3)]">{formatDate(order.createdAt)}</p>
            </div>
          </div>
          <StatusBadge status={order.status} />
        </div>

        {/* Customer / cashier */}
        {(order.customerName || order.userName) && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--border)] pt-4 text-sm sm:grid-cols-2">
            {order.userName && (
              <div className="flex items-center gap-2 text-[var(--text-2)]">
                <User className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
                <span className="font-medium">Kasir:</span>
                <span>{order.userName}</span>
              </div>
            )}
            {order.customerName && (
              <div className="flex items-center gap-2 text-[var(--text-2)]">
                <User className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
                <span className="font-medium">Pelanggan:</span>
                <span>{order.customerName}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
            Item Pesanan
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-subtle)] text-left">
                <th className="px-5 py-2.5 text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                  Produk
                </th>
                <th className="w-16 px-5 py-2.5 text-center text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                  Qty
                </th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                  Harga
                </th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {order.items.map(item => (
                <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                  <td className="px-5 py-3">
                    <p className="font-medium text-[var(--text-1)]">{item.name}</p>
                    {item.variantName && (
                      <p className="text-xs text-[var(--text-3)]">{item.variantName}</p>
                    )}
                    {item.discount > 0 && (
                      <p className="text-xs text-red-500">
                        -{formatCurrency(item.discount, currency)} disc.
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center text-[var(--text-2)]">{item.qty}</td>
                  <td className="px-5 py-3 text-right text-[var(--text-2)]">
                    {formatCurrency(item.price, currency)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-[var(--text-1)]">
                    {formatCurrency(item.subtotal, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment summary */}
      <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
          Ringkasan Pembayaran
        </h2>

        <div className="flex justify-between text-sm text-[var(--text-2)]">
          <span>Subtotal</span>
          <span>{formatCurrency(order.subtotal, currency)}</span>
        </div>
        {order.discountAmt > 0 && (
          <div className="flex justify-between text-sm text-red-500">
            <span>Diskon</span>
            <span>-{formatCurrency(order.discountAmt, currency)}</span>
          </div>
        )}
        {order.taxAmt > 0 && (
          <div className="flex justify-between text-sm text-[var(--text-2)]">
            <span>Pajak</span>
            <span>{formatCurrency(order.taxAmt, currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-semibold text-[var(--text-1)]">
          <span>Total</span>
          <span>{formatCurrency(order.total, currency)}</span>
        </div>

        {order.payments.length > 0 && (
          <div className="space-y-1.5 border-t border-[var(--border)] pt-2">
            {order.payments.map(p => (
              <div key={p.id} className="flex justify-between text-sm text-[var(--text-2)]">
                <span className="font-medium">
                  {PAYMENT_LABELS[p.method] ?? p.method}
                  {p.reference && (
                    <span className="ml-1 font-normal text-[var(--text-3)]">#{p.reference}</span>
                  )}
                </span>
                <span>{formatCurrency(p.amount, currency)}</span>
              </div>
            ))}
            {totalChange > 0 && (
              <div className="flex justify-between text-sm text-[var(--text-3)]">
                <span>Kembalian</span>
                <span>{formatCurrency(totalChange, currency)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Note */}
      {order.note && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
            Catatan
          </h2>
          <p className="text-sm text-[var(--text-2)]">{order.note}</p>
        </div>
      )}

      {/* Refund confirm banner */}
      {confirmRefund && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            Refund order {order.number}? Stok akan dikembalikan dan status berubah menjadi REFUNDED.
            Tindakan ini tidak dapat dibatalkan.
          </p>
          {refundError && <p className="text-xs text-red-600">{refundError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => refundMutation.mutate()}
              disabled={refundMutation.isPending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {refundMutation.isPending ? 'Memproses…' : 'Konfirmasi Refund'}
            </button>
            <button
              onClick={() => {
                setConfirmRefund(false)
                setRefundError(null)
              }}
              disabled={refundMutation.isPending}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-1)] transition-colors hover:bg-[var(--bg-subtle)]"
        >
          <Printer className="h-4 w-4" />
          Cetak Ulang Struk
        </button>

        {canRefund && order.status === 'PAID' && !confirmRefund && (
          <button
            onClick={() => setConfirmRefund(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
          >
            <RotateCcw className="h-4 w-4" />
            Refund
          </button>
        )}
      </div>
    </div>
  )
}
