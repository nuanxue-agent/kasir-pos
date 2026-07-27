'use client'

import { useState, useEffect } from 'react'
import { Users, UserPlus, Search, Loader2, Star, Download } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { exportToCSV } from '@/lib/export'
import { CustomerFormModal } from './CustomerFormModal'
import { CustomerDetailModal } from './CustomerDetailModal'

interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  points: number
  createdAt: string
  totalOrders: number
  totalSpent: number
}

interface CustomersPageClientProps {
  storeId: string
  currency: string
  userRole?: string
}

export function CustomersPageClient({ storeId, currency, userRole }: CustomersPageClientProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)

  const [showFormModal, setShowFormModal] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  const fetchCustomers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        storeId,
        page: String(page),
        limit: '20',
        ...(searchQuery ? { q: searchQuery } : {}),
      })
      const res = await fetch(`/api/customers?${params}`)
      if (res.ok) {
        const data = (await res.json()) as { customers: Customer[]; total: number; pages: number }
        setCustomers(data.customers)
        setTotal(data.total)
        setPages(data.pages)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [storeId, page, searchQuery])

  const handleSearch = (q: string) => {
    setSearchQuery(q)
    setPage(1)
  }

  const handleCustomerCreated = () => {
    setShowFormModal(false)
    fetchCustomers()
  }

  const handleExportCSV = () => {
    const rows = customers.map(c => ({
      Name: c.name,
      Phone: c.phone ?? '',
      Email: c.email ?? '',
      Address: c.address ?? '',
      Points: c.points,
      Orders: c.totalOrders,
      'Total Spent': c.totalSpent,
      Joined: formatDate(c.createdAt),
    }))
    exportToCSV(rows, `customers-${new Date().toISOString().slice(0, 10)}`, [
      'Name',
      'Phone',
      'Email',
      'Address',
      'Points',
      'Orders',
      'Total Spent',
      'Joined',
    ])
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2">
            <Users className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">Pelanggan</h1>
            <p className="text-sm text-[var(--text-2)]">
              {total} {total === 1 ? 'customer' : 'customers'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={customers.length === 0}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-stone-200 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={() => setShowFormModal(true)}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-white transition-colors hover:bg-amber-600"
          >
            <UserPlus className="h-4 w-4" />
            Add Customer
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-2)]" />
        <input
          type="search"
          placeholder="Search by name, phone, or email..."
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] py-2 pr-4 pl-10 text-[var(--text-1)] placeholder-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-muted)]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
          </div>
        ) : customers.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-stone-300" />
            <p className="text-[var(--text-2)]">
              {searchQuery ? 'No customers found' : 'No customers yet'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-stone-500">
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                      Email
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                      Points
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                      Total Spent
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {customers.map(customer => (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className="cursor-pointer transition-colors hover:bg-stone-200/50"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-slate-100">
                        {customer.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-2)]">
                        {customer.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-2)]">
                        {customer.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {customer.points}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-[var(--text-2)]">
                        {customer.totalOrders}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-slate-100">
                        {formatCurrency(customer.totalSpent, currency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-2)]">
                        {formatDate(customer.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
                <p className="text-sm text-[var(--text-2)]">
                  Page {page} of {pages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className={cn(
                      'rounded px-3 py-1 text-sm font-medium transition-colors',
                      page === 1
                        ? 'cursor-not-allowed bg-[var(--bg-muted)] text-[var(--text-3)]'
                        : 'bg-stone-200 text-[var(--text-2)] hover:bg-stone-300',
                    )}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className={cn(
                      'rounded px-3 py-1 text-sm font-medium transition-colors',
                      page === pages
                        ? 'cursor-not-allowed bg-[var(--bg-muted)] text-[var(--text-3)]'
                        : 'bg-stone-200 text-[var(--text-2)] hover:bg-stone-300',
                    )}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add customer modal */}
      {showFormModal && (
        <CustomerFormModal
          storeId={storeId}
          onClose={() => setShowFormModal(false)}
          onSuccess={handleCustomerCreated}
        />
      )}

      {/* Customer detail modal */}
      {selectedCustomerId && (
        <CustomerDetailModal
          customerId={selectedCustomerId}
          currency={currency}
          userRole={userRole}
          onClose={() => setSelectedCustomerId(null)}
          onUpdate={() => {
            setSelectedCustomerId(null)
            fetchCustomers()
          }}
        />
      )}
    </div>
  )
}
