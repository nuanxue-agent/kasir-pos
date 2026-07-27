'use client'
// @ts-ignore — next/navigation is available in this Next.js version
import { useRouter } from 'next/navigation'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Receipt, Calendar, Search, Eye, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportToCSV } from '@/lib/export'
import { OrderDetailModal } from './OrderDetailModal'

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

export interface Order {
  id: string
  number: string
  status: 'PENDING' | 'PAID' | 'VOIDED' | 'REFUNDED'
  subtotal: number
  discountAmt: number
  taxAmt: number
  total: number
  note?: string | null
  createdAt: string
  customer?: { id: string; name: string } | null
  user?: { id: string; name: string } | null
  items: OrderItem[]
  payments: Payment[]
}

interface OrdersResponse {
  orders: Order[]
  total: number
  page: number
  pages: number
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  VOIDED: 'bg-red-100 text-red-600',
  REFUNDED: 'bg-slate-100 text-[var(--text-2)]',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? 'bg-slate-100 text-[var(--text-2)]'
      }`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'PAID' | 'VOIDED' | 'REFUNDED' | 'PENDING'

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Voided', value: 'VOIDED' },
  { label: 'Refunded', value: 'REFUNDED' },
]

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  storeId: string
  currency: string
  taxRate: number
}

export function OrdersPageClient({ storeId, currency, taxRate }: Props) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  // Build query params
  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ storeId, page: String(page), limit: '20' })
    if (statusFilter !== 'ALL') p.set('status', statusFilter)
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo) {
      // include full day for dateTo
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      p.set('dateTo', end.toISOString())
    }
    return p.toString()
  }, [storeId, page, statusFilter, dateFrom, dateTo])

  const { data, isLoading, isError, refetch } = useQuery<OrdersResponse>({
    queryKey: ['orders', storeId, statusFilter, dateFrom, dateTo, page],
    queryFn: async () => {
      const res = await fetch(`/api/orders?${buildParams()}`)
      if (!res.ok) throw new Error('Failed to fetch orders')
      return res.json()
    },
  })

  // Client-side search filter (by order number)
  const filteredOrders = (data?.orders ?? []).filter(
    o => search.trim() === '' || o.number.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const totalPages = data?.pages ?? 1

  function handleStatusChange(s: StatusFilter) {
    setStatusFilter(s)
    setPage(1)
  }

  function handleOrderVoided() {
    refetch()
    setSelectedOrder(null)
  }

  function handleExportCSV() {
    const rows = filteredOrders.map(o => ({
      'Order #': o.number,
      Date: formatDate(o.createdAt),
      Customer: o.customer?.name ?? 'Walk-in',
      Items: o.items.reduce((s, i) => s + i.qty, 0),
      Subtotal: o.subtotal,
      Discount: o.discountAmt,
      Tax: o.taxAmt,
      Total: o.total,
      Status: o.status,
      'Payment Method': o.payments.map(p => p.method).join(', '),
    }))
    exportToCSV(rows, `orders-${new Date().toISOString().slice(0, 10)}`, [
      'Order #',
      'Date',
      'Customer',
      'Items',
      'Subtotal',
      'Discount',
      'Tax',
      'Total',
      'Status',
      'Payment Method',
    ])
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="h-6 w-6 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">Pesanan</h1>
            <p className="text-sm text-[var(--text-2)]">Browse and manage all transactions</p>
          </div>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filteredOrders.length === 0}
          className="flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-stone-200 disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-amber-500 text-white'
                  : 'bg-[var(--bg-muted)] text-[var(--text-2)] hover:bg-stone-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + date range row */}
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder="Search order number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] py-2 pr-3 pl-9 text-sm focus:ring-2 focus:ring-amber-400/40 focus:outline-none"
            />
          </div>

          {/* Date from */}
          <div className="relative">
            <Calendar className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className="rounded-xl border border-[var(--border)] py-2 pr-3 pl-9 text-sm focus:ring-2 focus:ring-amber-400/40 focus:outline-none"
            />
          </div>

          {/* Date to */}
          <div className="relative">
            <Calendar className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="date"
              value={dateTo}
              onChange={e => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className="rounded-xl border border-[var(--border)] py-2 pr-3 pl-9 text-sm focus:ring-2 focus:ring-amber-400/40 focus:outline-none"
            />
          </div>

          {/* Clear */}
          {(dateFrom || dateTo || search || statusFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearch('')
                setDateFrom('')
                setDateTo('')
                setStatusFilter('ALL')
                setPage(1)
              }}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="py-16 text-center text-sm text-red-500">
            Failed to load orders.{' '}
            <button onClick={() => refetch()} className="underline">
              Retry
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--text-3)]">No orders found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-subtle)] text-left">
                  {['Order #', 'Date', 'Customer', 'Items', 'Total', 'Status', ''].map(h => (
                    <th
                      key={h}
                      className="px-5 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-[var(--text-2)] uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredOrders.map(order => (
                  <tr
                    key={order.id}
                    className="cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]/60"
                    onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                  >
                    <td className="px-5 py-3 font-medium text-indigo-600">{order.number}</td>
                    <td className="px-5 py-3 text-xs whitespace-nowrap text-[var(--text-2)]">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-[var(--text-1)]">
                      {order.customer?.name ?? (
                        <span className="text-[var(--text-3)] italic">Walk-in</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[var(--text-2)]">
                      {order.items.reduce((s, i) => s + i.qty, 0)} item
                      {order.items.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}
                    </td>
                    <td className="px-5 py-3 font-medium whitespace-nowrap text-[var(--text-1)]">
                      {formatCurrency(order.total, currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          router.push(`/dashboard/orders/${order.id}`)
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                        aria-label={`View order ${order.number}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--text-2)]">
          <span>
            Page {page} of {totalPages} &middot; {data?.total ?? 0} orders
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--bg-subtle)] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--bg-subtle)] disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          currency={currency}
          onClose={() => setSelectedOrder(null)}
          onVoided={handleOrderVoided}
        />
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg bg-[var(--bg-muted)]" />
      ))}
    </div>
  )
}
