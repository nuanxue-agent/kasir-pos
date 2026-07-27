'use client'

// OrderManagementClient — full order list with bulk actions, refund modal, export
// Route: /dashboard/orders

import { useRouter } from 'next/navigation'
import { useState, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Receipt,
  Calendar,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Printer,
  XCircle,
  CheckSquare,
  Square,
  RotateCcw,
  Loader2,
} from 'lucide-react'
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

// ─── Status filter tabs ───────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'PAID' | 'VOIDED' | 'REFUNDED' | 'PENDING'

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Voided', value: 'VOIDED' },
  { label: 'Refunded', value: 'REFUNDED' },
]

// ─── Payment method label ─────────────────────────────────────────────────────

const PAY_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Transfer',
  QRIS: 'QRIS',
  OTHER: 'Other',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  storeId: string
  currency: string
  taxRate: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OrderManagementClient({ storeId, currency, taxRate }: Props) {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkVoiding, setBulkVoiding] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  // Build query params
  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ storeId, page: String(page), limit: '20' })
    if (statusFilter !== 'ALL') p.set('status', statusFilter)
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo) {
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

  // Client-side search: order number OR customer name
  const filteredOrders = (data?.orders ?? []).filter(o => {
    if (search.trim() === '') return true
    const q = search.trim().toLowerCase()
    return (
      o.number.toLowerCase().includes(q) ||
      (o.customer?.name ?? '').toLowerCase().includes(q)
    )
  })

  const totalPages = data?.pages ?? 1

  function handleStatusChange(s: StatusFilter) {
    setStatusFilter(s)
    setPage(1)
    setSelected(new Set())
  }

  function handleOrderMutated() {
    refetch()
    setSelectedOrder(null)
    setSelected(new Set())
  }

  // ── Bulk selection helpers ──────────────────────────────────────────────────

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filteredOrders.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredOrders.map(o => o.id)))
    }
  }

  // ── Bulk void ──────────────────────────────────────────────────────────────

  async function handleBulkVoid() {
    const voidable = filteredOrders.filter(
      o => selected.has(o.id) && o.status === 'PENDING',
    )
    if (voidable.length === 0) {
      setBulkError('No PENDING orders selected to void.')
      return
    }
    setBulkVoiding(true)
    setBulkError(null)
    try {
      await Promise.all(
        voidable.map(o =>
          fetch(`/api/orders/${o.id}/void`, { method: 'POST' }).then(r => {
            if (!r.ok) throw new Error(`Failed to void ${o.number}`)
          }),
        ),
      )
      refetch()
      setSelected(new Set())
    } catch (e: any) {
      setBulkError(e.message ?? 'Bulk void failed')
    } finally {
      setBulkVoiding(false)
    }
  }

  // ── Bulk export CSV ────────────────────────────────────────────────────────

  function handleBulkExportCSV() {
    const target = selected.size > 0
      ? filteredOrders.filter(o => selected.has(o.id))
      : filteredOrders
    exportOrdersCSV(target, currency)
  }

  // ── Export CSV (all filtered) ──────────────────────────────────────────────

  function handleExportCSV() {
    exportOrdersCSV(filteredOrders, currency)
  }

  // ── Export PDF (print) ─────────────────────────────────────────────────────

  function handleExportPDF() {
    window.print()
  }

  // ── Clear filters ──────────────────────────────────────────────────────────

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setStatusFilter('ALL')
    setPage(1)
    setSelected(new Set())
  }

  const hasFilters = search || dateFrom || dateTo || statusFilter !== 'ALL'
  const allSelected =
    filteredOrders.length > 0 && selected.size === filteredOrders.length

  return (
    <div ref={printRef} className="mx-auto max-w-7xl space-y-6 p-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="h-6 w-6 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">Pesanan</h1>
            <p className="text-sm text-[var(--text-2)]">
              Browse and manage all transactions
            </p>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={handleExportCSV}
            disabled={filteredOrders.length === 0}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-stone-200 disabled:opacity-40"
            title="Export filtered orders as CSV"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={filteredOrders.length === 0}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-stone-200 disabled:opacity-40"
            title="Print order list as PDF"
          >
            <Printer className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm print:hidden">
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

        {/* Search + date range */}
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder="Search order number or customer…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full rounded-xl border border-[var(--border)] py-2 pr-3 pl-9 text-sm focus:ring-2 focus:ring-amber-400/40 focus:outline-none"
            />
          </div>

          <div className="relative">
            <Calendar className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1) }}
              className="rounded-xl border border-[var(--border)] py-2 pr-3 pl-9 text-sm focus:ring-2 focus:ring-amber-400/40 focus:outline-none"
              aria-label="Date from"
            />
          </div>

          <div className="relative">
            <Calendar className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1) }}
              className="rounded-xl border border-[var(--border)] py-2 pr-3 pl-9 text-sm focus:ring-2 focus:ring-amber-400/40 focus:outline-none"
              aria-label="Date to"
            />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk actions bar ───────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 print:hidden">
          <span className="text-sm font-medium text-amber-800">
            {selected.size} selected
          </span>
          <button
            onClick={handleBulkVoid}
            disabled={bulkVoiding}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {bulkVoiding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            Bulk Void (PENDING only)
          </button>
          <button
            onClick={handleBulkExportCSV}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-muted)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-stone-200"
          >
            <FileText className="h-3.5 w-3.5" />
            Export Selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            Clear selection
          </button>
          {bulkError && (
            <p className="w-full text-xs text-red-600">{bulkError}</p>
          )}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
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
          <div className="py-16 text-center text-sm text-[var(--text-3)]">
            No orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-subtle)] text-left">
                  {/* Checkbox column — hidden in print */}
                  <th className="w-10 px-4 py-3 print:hidden">
                    <button
                      onClick={toggleAll}
                      className="text-[var(--text-2)] hover:text-[var(--text-1)]"
                      aria-label={allSelected ? 'Deselect all' : 'Select all'}
                    >
                      {allSelected ? (
                        <CheckSquare className="h-4 w-4 text-amber-500" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  {[
                    'Order #',
                    'Date',
                    'Customer',
                    'Items',
                    'Total',
                    'Status',
                    'Payment',
                    '',
                  ].map(h => (
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
                {filteredOrders.map(order => {
                  const itemCount = order.items.reduce((s, i) => s + i.qty, 0)
                  const payMethods = order.payments
                    .map(p => PAY_LABEL[p.method] ?? p.method)
                    .join(', ')
                  return (
                    <tr
                      key={order.id}
                      className={`cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]/60 ${
                        selected.has(order.id) ? 'bg-amber-50/60' : ''
                      }`}
                      onClick={() => setSelectedOrder(order)}
                    >
                      {/* Checkbox */}
                      <td
                        className="px-4 py-3 print:hidden"
                        onClick={e => {
                          e.stopPropagation()
                          toggleRow(order.id)
                        }}
                      >
                        {selected.has(order.id) ? (
                          <CheckSquare className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Square className="h-4 w-4 text-[var(--text-3)]" />
                        )}
                      </td>
                      <td className="px-5 py-3 font-medium text-indigo-600">
                        {order.number}
                      </td>
                      <td className="px-5 py-3 text-xs whitespace-nowrap text-[var(--text-2)]">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-1)]">
                        {order.customer?.name ?? (
                          <span className="italic text-[var(--text-3)]">
                            Walk-in
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-2)]">
                        {itemCount} item{itemCount !== 1 ? 's' : ''}
                      </td>
                      <td className="px-5 py-3 font-medium whitespace-nowrap text-[var(--text-1)]">
                        {formatCurrency(order.total, currency)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-2)]">
                        {payMethods || '—'}
                      </td>
                      <td className="px-5 py-3 text-right print:hidden">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedOrder(order)
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          aria-label={`View order ${order.number}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--text-2)] print:hidden">
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

      {/* ── Order detail modal ─────────────────────────────────────────────── */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          currency={currency}
          onClose={() => setSelectedOrder(null)}
          onVoided={handleOrderMutated}
          onRefunded={handleOrderMutated}
        />
      )}
    </div>
  )
}

// ─── Export helper ─────────────────────────────────────────────────────────────

function exportOrdersCSV(orders: Order[], currency: string) {
  const rows = orders.map(o => ({
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
