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
  TrendingUp,
  Clock,
  Award,
  History,
} from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { CustomerFormModal } from './CustomerFormModal'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface PointsLogEntry {
  id: string
  delta: number
  reason: string
  createdAt: string
  type: string
}

interface TierDef {
  name: string
  minPoints: number
  discount: number
  color: string
  icon: string
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
  userRole?: string
  onClose: () => void
  onUpdate: () => void
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const pointsSchema = z.object({
  delta: z
    .number({ message: 'Enter a number' })
    .int('Must be a whole number')
    .refine(v => v !== 0, 'Cannot add 0 points')
    .refine(v => Math.abs(v) <= 100_000, 'Maximum ±100 000 points'),
  reason: z.string().min(1, 'Reason is required').max(200),
})
type PointsForm = z.infer<typeof pointsSchema>

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-emerald-500/20 text-emerald-300',
  PENDING: 'bg-yellow-500/20 text-yellow-300',
  VOIDED: 'bg-red-500/20 text-red-300',
  REFUNDED: 'bg-slate-500/20 text-stone-600',
}

// ─── Tier Badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: TierDef | null }) {
  if (!tier) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: tier.color }}
    >
      <span>{tier.icon}</span>
      {tier.name}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CustomerDetailModal({
  customerId,
  currency,
  userRole,
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

  // Enhanced data from /history endpoint
  const [stats, setStats] = useState<{
    visitCount: number
    totalSpent: number
    avgOrderValue: number
  } | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [pointsLog, setPointsLog] = useState<PointsLogEntry[]>([])
  const [currentTier, setCurrentTier] = useState<TierDef | null>(null)
  const [activeTab, setActiveTab] = useState<'orders' | 'points'>('orders')
  const [pointsExpiry, setPointsExpiry] = useState<{
    daysUntilExpiry: number | null
    expiresAt: string | null
    isExpired: boolean
    points: number
  } | null>(null)

  const isOwner = userRole === 'OWNER'
  const canAdjustPoints = userRole === 'OWNER' || userRole === 'MANAGER'

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PointsForm>({
    resolver: zodResolver(pointsSchema),
    defaultValues: { delta: 0, reason: '' },
  })

  const fetchCustomer = async () => {
    setLoading(true)
    try {
      // Fetch base customer data
      const [baseRes, histRes, expiryRes] = await Promise.all([
        fetch(`/api/customers/${customerId}`),
        fetch(`/api/customers/${customerId}/history`),
        fetch(`/api/customers/${customerId}/points-expiry`),
      ])
      if (baseRes.ok) {
        const base = (await baseRes.json()) as any
        setCustomer(base)
      }
      if (histRes.ok) {
        const hist = (await histRes.json()) as any
        setStats(hist.stats)
        setOrders(hist.orders ?? [])
        setPointsLog(hist.pointsLog ?? [])
        setCurrentTier(hist.currentTier ?? null)
      }
      if (expiryRes.ok) {
        const expiry = (await expiryRes.json()) as any
        setPointsExpiry(expiry)
      }
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
    const res = await fetch(`/api/customers/${customerId}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: values.delta, reason: values.reason }),
    })
    if (res.ok) {
      reset()
      setShowPointsForm(false)
      fetchCustomer()
    } else {
      const data = (await res.json()) as { error?: string }
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
      const data = (await res.json()) as { error?: string }
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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-stone-200 bg-[var(--bg-card)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-stone-800">Customer Details</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading || !customer ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
            </div>
          ) : (
            <div className="space-y-6 p-6">
              {/* Info card */}
              <div className="space-y-4 rounded-lg border border-stone-200 bg-stone-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-stone-800">{customer.name}</h3>
                    <p className="mt-0.5 text-sm text-stone-500">
                      Member since {formatDate(customer.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {/* Tier badge */}
                    <TierBadge tier={currentTier} />
                    {/* Points badge */}
                    <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
                      <Star className="h-4 w-4 fill-amber-300 text-amber-500" />
                      <span className="text-sm font-semibold text-amber-700">
                        {customer.points} pts
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact info */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {customer.phone && (
                    <div className="flex items-center gap-2 text-sm text-stone-600">
                      <Phone className="h-4 w-4 shrink-0 text-stone-400" />
                      {customer.phone}
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-2 text-sm text-stone-600">
                      <Mail className="h-4 w-4 shrink-0 text-stone-400" />
                      {customer.email}
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-start gap-2 text-sm text-stone-600 sm:col-span-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                      {customer.address}
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="rounded-lg border border-stone-100 bg-[var(--bg-card)] px-3 py-3">
                    <div className="mb-1 flex items-center gap-1.5">
                      <ShoppingBag className="h-3.5 w-3.5 text-stone-400" />
                      <p className="text-xs text-stone-500">Visits</p>
                    </div>
                    <p className="text-lg font-bold text-stone-800">
                      {stats?.visitCount ?? customer.totalOrders}
                    </p>
                  </div>
                  <div className="rounded-lg border border-stone-100 bg-[var(--bg-card)] px-3 py-3">
                    <div className="mb-1 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-stone-400" />
                      <p className="text-xs text-stone-500">Total Spent</p>
                    </div>
                    <p className="text-sm font-bold text-stone-800">
                      {formatCurrency(stats?.totalSpent ?? customer.totalSpent, currency)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-stone-100 bg-[var(--bg-card)] px-3 py-3">
                    <div className="mb-1 flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5 text-stone-400" />
                      <p className="text-xs text-stone-500">Avg Order</p>
                    </div>
                    <p className="text-sm font-bold text-stone-800">
                      {formatCurrency(stats?.avgOrderValue ?? 0, currency)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Points expiry warning */}
              {pointsExpiry && customer.points > 0 && pointsExpiry.daysUntilExpiry !== null && (
                <div
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm',
                    pointsExpiry.isExpired
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : pointsExpiry.daysUntilExpiry <= 30
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-stone-200 bg-stone-50 text-stone-600',
                  )}
                >
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    {pointsExpiry.isExpired ? (
                      <p className="font-medium">
                        {customer.points} poin telah kedaluwarsa karena tidak ada aktivitas selama 12 bulan.
                      </p>
                    ) : (
                      <p>
                        <span className="font-semibold">{customer.points} poin</span> kedaluwarsa dalam{' '}
                        <span className="font-semibold">{pointsExpiry.daysUntilExpiry} hari</span>
                        {pointsExpiry.expiresAt && (
                          <span className="text-xs opacity-70 ml-1">
                            ({new Date(pointsExpiry.expiresAt).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Manual Point Adjustment — OWNER only */}
              {canAdjustPoints && showPointsForm && (
                <form
                  onSubmit={handleSubmit(handleAddPoints)}
                  className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
                >
                  <p className="text-sm font-medium text-stone-800">Manual Point Adjustment</p>
                  <p className="text-xs text-stone-500">
                    Use positive numbers to add, negative to deduct. Current: {customer.points} pts
                  </p>
                  {pointsError && <p className="text-xs text-red-500">{pointsError}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">Points (±)</label>
                      <input
                        {...register('delta', { valueAsNumber: true })}
                        type="number"
                        placeholder="e.g. 50 or -20"
                        className={cn(
                          'w-full rounded-lg border bg-[var(--bg-card)] px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none',
                          errors.delta ? 'border-red-400' : 'border-stone-200',
                        )}
                      />
                      {errors.delta && (
                        <p className="mt-1 text-xs text-red-500">{errors.delta.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-stone-500">Reason</label>
                      <input
                        {...register('reason')}
                        type="text"
                        placeholder="e.g. Compensation"
                        className={cn(
                          'w-full rounded-lg border bg-[var(--bg-card)] px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none',
                          errors.reason ? 'border-red-400' : 'border-stone-200',
                        )}
                      />
                      {errors.reason && (
                        <p className="mt-1 text-xs text-red-500">{errors.reason.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPointsForm(false)
                        reset()
                      }}
                      className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-200"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Tabs: Orders / Points History */}
              <div>
                <div className="mb-4 flex gap-1 border-b border-stone-200">
                  <button
                    onClick={() => setActiveTab('orders')}
                    className={cn(
                      'flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                      activeTab === 'orders'
                        ? 'border-amber-500 text-amber-600'
                        : 'border-transparent text-stone-500 hover:text-stone-700',
                    )}
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    Transaction History
                  </button>
                  <button
                    onClick={() => setActiveTab('points')}
                    className={cn(
                      'flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                      activeTab === 'points'
                        ? 'border-amber-500 text-amber-600'
                        : 'border-transparent text-stone-500 hover:text-stone-700',
                    )}
                  >
                    <History className="h-3.5 w-3.5" />
                    Points Log
                  </button>
                </div>

                {/* Transaction History */}
                {activeTab === 'orders' && (
                  <>
                    {orders.length === 0 ? (
                      <div className="rounded-lg border border-stone-200 bg-stone-50 py-8 text-center">
                        <ShoppingBag className="mx-auto mb-2 h-8 w-8 text-stone-300" />
                        <p className="text-sm text-stone-500">No orders yet</p>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-stone-200 bg-stone-100">
                              <th className="px-4 py-2.5 text-left text-xs font-medium tracking-wider text-stone-500 uppercase">
                                Order
                              </th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium tracking-wider text-stone-500 uppercase">
                                Status
                              </th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium tracking-wider text-stone-500 uppercase">
                                Total
                              </th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium tracking-wider text-stone-500 uppercase">
                                Date
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-200">
                            {orders.map(order => (
                              <tr
                                key={order.id}
                                className="transition-colors hover:bg-stone-100/70"
                              >
                                <td className="px-4 py-2.5 text-sm font-medium text-stone-800">
                                  {order.number}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span
                                    className={cn(
                                      'inline-block rounded px-2 py-0.5 text-xs font-medium',
                                      STATUS_STYLES[order.status] ?? 'bg-slate-100 text-stone-500',
                                    )}
                                  >
                                    {order.status}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm font-medium text-stone-800">
                                  {formatCurrency(order.total, currency)}
                                </td>
                                <td className="px-4 py-2.5 text-sm text-stone-500">
                                  {formatDate(order.createdAt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* Points History Log */}
                {activeTab === 'points' && (
                  <>
                    {pointsLog.length === 0 ? (
                      <div className="rounded-lg border border-stone-200 bg-stone-50 py-8 text-center">
                        <Star className="mx-auto mb-2 h-8 w-8 text-stone-300" />
                        <p className="text-sm text-stone-500">No points history yet</p>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-stone-200 bg-stone-100">
                              <th className="px-4 py-2.5 text-left text-xs font-medium tracking-wider text-stone-500 uppercase">
                                Reason
                              </th>
                              <th className="px-4 py-2.5 text-center text-xs font-medium tracking-wider text-stone-500 uppercase">
                                Points
                              </th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium tracking-wider text-stone-500 uppercase">
                                Date
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-200">
                            {pointsLog.map(entry => (
                              <tr
                                key={entry.id}
                                className="transition-colors hover:bg-stone-100/70"
                              >
                                <td className="px-4 py-2.5 text-sm text-stone-700">
                                  {entry.reason}
                                </td>
                                <td className="px-4 py-2.5 text-center text-sm font-medium">
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-0.5',
                                      entry.delta >= 0 ? 'text-emerald-600' : 'text-red-500',
                                    )}
                                  >
                                    {entry.delta >= 0 ? '+' : ''}
                                    {entry.delta}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-sm text-stone-500">
                                  {formatDate(entry.createdAt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Delete error */}
              {deleteError && <p className="text-center text-sm text-red-500">{deleteError}</p>}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {!loading && customer && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-200 px-6 py-4">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </button>
            <div className="flex gap-2">
              {canAdjustPoints && (
                <button
                  onClick={() => {
                    setShowPointsForm(v => !v)
                    setActiveTab('points')
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
                >
                  <Plus className="h-4 w-4" />
                  {isOwner ? 'Manual Point Adjustment' : 'Adjust Points'}
                </button>
              )}
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
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
