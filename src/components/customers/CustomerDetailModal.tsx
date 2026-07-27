'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  X,
  Phone,
  Mail,
  Star,
  ShoppingBag,
  MapPin,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { CustomerFormModal } from './CustomerFormModal'

interface OrderItem {
  name: string
  qty: number
  price: number
  subtotal: number
}

interface Order {
  id: string
  number: string
  status: string
  total: number
  createdAt: string
  items: OrderItem[]
}

interface CustomerDetail {
  id: string
  storeId: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  points: number
  createdAt: string
  totalOrders: number
  totalSpent: number
  orders: Order[]
}

interface CustomerDetailModalProps {
  customerId: string
  currency: string
  onClose: () => void
  onUpdate: () => void
}

const pointsSchema = z.object({
  delta: z
    .number({ invalid_type_error: 'Enter a number' })
    .int('Must be a whole number')
    .refine((v) => v !== 0, 'Cannot add 0 points'),
})
type PointsForm = z.infer<typeof pointsSchema>

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-emerald-500/20 text-emerald-300',
  PENDING: 'bg-yellow-500/20 text-yellow-300',
  VOIDED: 'bg-red-500/20 text-red-300',
  REFUNDED: 'bg-slate-500/20 text-slate-300',
}

export function CustomerDetailModal({
  customerId,
  currency,
  onClose,
  onUpdate,
}: CustomerDetailModalProps) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPointsForm, setShowPointsForm] = useState(false)
  const [pointsError, setPointsError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PointsForm>({
    resolver: zodResolver(pointsSchema),
  })

  const fetchCustomer = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers/${customerId}`)
      if (res.ok) setCustomer(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomer()
  }, [customerId])

  const handleEditSuccess = () => {
    setShowEditModal(false)
    fetchCustomer()
    onUpdate()
  }

  const handleAddPoints = async (values: PointsForm) => {
    setPointsError(null)
    const newPoints = (customer?.points ?? 0) + values.delta
    const res = await fetch(`/api/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: Math.max(0, newPoints) }),
    })
    if (res.ok) {
      reset()
      setShowPointsForm(false)
      fetchCustomer()
    } else {
      const data = await res.json()
      setPointsError(data.error ?? 'Failed to update points')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this customer? This cannot be undone.')) return
    setDeleting(true)
    setDeleteError(null)
    const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' })
    if (res.ok) {
      onUpdate()
      onClose()
    } else {
      const data = await res.json()
      setDeleteError(data.error ?? 'Failed to delete customer')
      setDeleting(false)
    }
  }

  // Show nested edit modal on top
  if (showEditModal && customer) {
    return (
      <CustomerFormModal
        storeId={customer.storeId}
        customer={customer}
        onClose={() => setShowEditModal(false)}
        onSuccess={handleEditSuccess}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <h2 className="text-lg font-semibold text-slate-100">Customer Details</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading || !customer ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Info card */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-100">{customer.name}</h3>
                    <p className="text-sm text-slate-400 mt-0.5">
                      Member since {formatDate(customer.createdAt)}
                    </p>
                  </div>
                  {/* Points badge */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/30 rounded-lg shrink-0">
                    <Star className="h-4 w-4 text-indigo-300 fill-indigo-300" />
                    <span className="text-sm font-semibold text-indigo-200">
                      {customer.points} pts
                    </span>
                  </div>
                </div>

                {/* Contact info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customer.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Phone className="h-4 w-4 text-slate-500 shrink-0" />
                      {customer.phone}
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Mail className="h-4 w-4 text-slate-500 shrink-0" />
                      {customer.email}
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-start gap-2 text-sm text-slate-300 sm:col-span-2">
                      <MapPin className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                      {customer.address}
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-slate-900/60 rounded-lg px-4 py-3">
                    <p className="text-xs text-slate-500 mb-1">Total Orders</p>
                    <p className="text-lg font-bold text-slate-100">{customer.totalOrders}</p>
                  </div>
                  <div className="bg-slate-900/60 rounded-lg px-4 py-3">
                    <p className="text-xs text-slate-500 mb-1">Total Spent</p>
                    <p className="text-lg font-bold text-slate-100">
                      {formatCurrency(customer.totalSpent, currency)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Add Points form */}
              {showPointsForm && (
                <form
                  onSubmit={handleSubmit(handleAddPoints)}
                  className="bg-slate-800 border border-indigo-500/30 rounded-lg p-4 space-y-3"
                >
                  <p className="text-sm font-medium text-slate-200">Adjust Points</p>
                  <p className="text-xs text-slate-400">
                    Use positive numbers to add, negative to deduct. Current: {customer.points} pts
                  </p>
                  {pointsError && (
                    <p className="text-xs text-red-400">{pointsError}</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      {...register('delta', { valueAsNumber: true })}
                      type="number"
                      placeholder="e.g. 50 or -20"
                      className={cn(
                        'flex-1 px-3 py-2 bg-slate-900 border rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm',
                        errors.delta ? 'border-red-500' : 'border-slate-600'
                      )}
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowPointsForm(false); reset() }}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {errors.delta && (
                    <p className="text-xs text-red-400">{errors.delta.message}</p>
                  )}
                </form>
              )}

              {/* Recent orders */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingBag className="h-4 w-4 text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-300">Recent Orders</h4>
                </div>

                {customer.orders.length === 0 ? (
                  <div className="text-center py-8 bg-slate-800 border border-slate-700 rounded-lg">
                    <ShoppingBag className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No orders yet</p>
                  </div>
                ) : (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-900/50">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Order
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Total
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {customer.orders.map((order) => (
                          <tr key={order.id} className="hover:bg-slate-700/40 transition-colors">
                            <td className="px-4 py-2.5 text-sm font-medium text-slate-100">
                              {order.number}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={cn(
                                  'inline-block px-2 py-0.5 rounded text-xs font-medium',
                                  STATUS_STYLES[order.status] ?? 'bg-slate-500/20 text-slate-300'
                                )}
                              >
                                {order.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-slate-100 font-medium text-right">
                              {formatCurrency(order.total, currency)}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-slate-400">
                              {formatDate(order.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Delete error */}
              {deleteError && (
                <p className="text-sm text-red-400 text-center">{deleteError}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {!loading && customer && (
          <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between gap-3 shrink-0">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPointsForm((v) => !v) }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                Adjust Points
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
