'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, UserPlus, Search, Loader2, Star } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { CustomerFormModal } from './CustomerFormModal'

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
}

export function CustomersPageClient({ storeId, currency }: CustomersPageClientProps) {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)

  const [showFormModal, setShowFormModal] = useState(false)

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
        const data = await res.json() as any
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

  const handleRowClick = (customer: Customer) => {
    router.push(`/dashboard/customers/${customer.id}`)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <Users className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-800">Pelanggan</h1>
            <p className="text-sm text-stone-500">
              {total} {total === 1 ? 'customer' : 'customers'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowFormModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500 pointer-events-none" />
        <input
          type="search"
          placeholder="Search by name, phone, or email..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-stone-100 border border-stone-200 rounded-lg text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
        />
      </div>

      {/* Table */}
      <div className="bg-stone-100 border border-stone-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 text-amber-600 animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-500">
              {searchQuery ? 'No customers found' : 'No customers yet'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-500">
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 uppercase tracking-wider">
                      Points
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 uppercase tracking-wider">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                      Total Spent
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {customers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => handleRowClick(customer)}
                      className="hover:bg-stone-200/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-slate-100">
                        {customer.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-600">
                        {customer.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-600">
                        {customer.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full text-xs font-medium">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {customer.points}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-600 text-center">
                        {customer.totalOrders}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 font-medium text-right">
                        {formatCurrency(customer.totalSpent, currency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-500">
                        {formatDate(customer.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="px-4 py-3 border-t border-stone-200 flex items-center justify-between">
                <p className="text-sm text-stone-500">
                  Page {page} of {pages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className={cn(
                      'px-3 py-1 rounded text-sm font-medium transition-colors',
                      page === 1
                        ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                        : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                    )}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className={cn(
                      'px-3 py-1 rounded text-sm font-medium transition-colors',
                      page === pages
                        ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                        : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
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
    </div>
  )
}
