'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Receipt,
  Calendar,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
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
  PAID:     'bg-emerald-100 text-emerald-700',
  PENDING:  'bg-yellow-100 text-yellow-700',
  VOIDED:   'bg-red-100 text-red-600',
  REFUNDED: 'bg-slate-100 text-slate-500',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-500'
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch]             = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [page, setPage]                 = useState(1)
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
  const filteredOrders = (data?.orders ?? []).filter((o) =>
    search.trim() === '' ||
    o.number.toLowerCase().includes(search.trim().toLowerCase())
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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500">Browse and manage all transactions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + date range row */}
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search order number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Date from */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Date to */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
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
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="py-16 text-center text-sm text-red-500">
            Failed to load orders.{' '}
            <button onClick={() => refetch()} className="underline">Retry</button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Order #', 'Date', 'Customer', 'Items', 'Total', 'Status', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50/60 transition-colors cursor-pointer"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="px-5 py-3 font-medium text-indigo-600">
                      {order.number}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {order.customer?.name ?? (
                        <span className="italic text-gray-400">Walk-in</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {order.items.reduce((s, i) => s + i.qty, 0)} item
                      {order.items.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">
                      {formatCurrency(order.total, currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedOrder(order) }}
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
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
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page} of {totalPages} &middot; {data?.total ?? 0} orders
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
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
    <div className="p-5 space-y-3 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded-lg" />
      ))}
    </div>
  )
}
