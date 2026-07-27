'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Star,
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  Gift,
  Pencil,
  MessageCircle,
  Loader2,
  Crown,
  Award,
  Gem,
  User,
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
  items?: OrderItem[]
}

interface PointsEntry {
  id: string
  type: 'EARN' | 'REDEEM' | 'ADJUST'
  points: number
  note: string | null
  orderId: string | null
  createdAt: string
}

interface CustomerDetail {
  id: string
  storeId: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  points: number
  tier: string | null
  totalPoints: number
  createdAt: string
  orders?: Order[]
}

interface CustomerDetailClientProps {
  customerId: string
  storeId: string
  currency: string
  initialCustomer: CustomerDetail | null
}

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  BRONZE: {
    label: 'Bronze',
    color: 'bg-amber-700/20 text-amber-700 border-amber-700/30',
    icon: <Award className="h-3 w-3" />,
  },
  SILVER: {
    label: 'Silver',
    color: 'bg-slate-400/20 text-slate-500 border-slate-400/30',
    icon: <Star className="h-3 w-3" />,
  },
  GOLD: {
    label: 'Gold',
    color: 'bg-yellow-400/20 text-yellow-600 border-yellow-400/30',
    icon: <Crown className="h-3 w-3" />,
  },
  PLATINUM: {
    label: 'Platinum',
    color: 'bg-cyan-400/20 text-cyan-600 border-cyan-400/30',
    icon: <Gem className="h-3 w-3" />,
  },
}

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-emerald-500/20 text-emerald-600',
  PENDING: 'bg-yellow-500/20 text-yellow-600',
  VOIDED: 'bg-red-500/20 text-red-500',
  REFUNDED: 'bg-slate-500/20 text-slate-500',
}

type Tab = 'purchases' | 'points'

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerDetailClient({
  customerId,
  storeId,
  currency,
  initialCustomer,
}: CustomerDetailClientProps) {
  const router = useRouter()
  const [customer, setCustomer] = useState<CustomerDetail | null>(initialCustomer)
  const [orders, setOrders] = useState<Order[]>([])
  const [pointsHistory, setPointsHistory] = useState<PointsEntry[]>([])
  const [loading, setLoading] = useState(!initialCustomer)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [pointsLoading, setPointsLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('purchases')
  const [showEditModal, setShowEditModal] = useState(false)

  // ── Fetch customer detail ──────────────────────────────────────────────────
  const fetchCustomer = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers/${customerId}?storeId=${storeId}`)
      if (res.ok) setCustomer(await res.json())
    } finally {
      setLoading(false)
    }
  }

  // ── Fetch orders ───────────────────────────────────────────────────────────
  const fetchOrders = async () => {
    setOrdersLoading(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/orders?storeId=${storeId}`)
      if (res.ok) setOrders(await res.json())
    } finally {
      setOrdersLoading(false)
    }
  }

  // ── Fetch points history ───────────────────────────────────────────────────
  const fetchPoints = async () => {
    setPointsLoading(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/points?storeId=${storeId}`)
      if (res.ok) setPointsHistory(await res.json())
    } finally {
      setPointsLoading(false)
    }
  }

  useEffect(() => {
    if (!initialCustomer) fetchCustomer()
    fetchOrders()
    fetchPoints()
  }, [customerId])

  // ── WhatsApp link ──────────────────────────────────────────────────────────
  const handleWhatsApp = () => {
    if (!customer?.phone) return
    const phone = customer.phone.replace(/\D/g, '').replace(/^0/, '62')
    const msg = encodeURIComponent(
      `Halo ${customer.name}, terima kasih sudah berbelanja di toko kami! 😊`
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  const tierInfo = customer?.tier ? TIER_CONFIG[customer.tier] : null

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <User className="h-12 w-12 text-stone-300" />
        <p className="text-stone-500">Customer not found</p>
        <button
          onClick={() => router.push('/dashboard/customers')}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
        >
          Back to Customers
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/dashboard/customers')}
        className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Customers
      </button>

      {/* Profile header */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Avatar + info */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-amber-600">
                {customer.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-stone-800">{customer.name}</h1>
                {tierInfo && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                      tierInfo.color
                    )}
                  >
                    {tierInfo.icon}
                    {tierInfo.label}
                  </span>
                )}
              </div>
              <p className="text-sm text-stone-500">
                Member since {formatDate(customer.createdAt)}
              </p>
              <div className="flex items-center gap-3 flex-wrap mt-1">
                {customer.phone && (
                  <span className="flex items-center gap-1 text-sm text-stone-600">
                    <Phone className="h-3.5 w-3.5 text-stone-400" />
                    {customer.phone}
                  </span>
                )}
                {customer.email && (
                  <span className="flex items-center gap-1 text-sm text-stone-600">
                    <Mail className="h-3.5 w-3.5 text-stone-400" />
                    {customer.email}
                  </span>
                )}
                {customer.address && (
                  <span className="flex items-center gap-1 text-sm text-stone-600">
                    <MapPin className="h-3.5 w-3.5 text-stone-400" />
                    {customer.address}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Points balance */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <Star className="h-5 w-5 text-amber-500 fill-amber-400" />
              <span className="text-xl font-bold text-amber-700">{customer.points}</span>
              <span className="text-sm text-amber-600">pts</span>
            </div>
            {customer.totalPoints !== undefined && (
              <p className="text-xs text-stone-400">{customer.totalPoints} total earned</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-5 pt-4 border-t border-stone-100">
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit Profile
          </button>
          {customer.phone && (
            <button
              onClick={handleWhatsApp}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-sm font-medium transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              Send WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-stone-200">
          <button
            onClick={() => setTab('purchases')}
            className={cn(
              'flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === 'purchases'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            )}
          >
            <ShoppingBag className="h-4 w-4" />
            Purchase History
          </button>
          <button
            onClick={() => setTab('points')}
            className={cn(
              'flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === 'points'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            )}
          >
            <Gift className="h-4 w-4" />
            Points History
          </button>
        </div>

        <div className="p-4">
          {/* Purchase history tab */}
          {tab === 'purchases' && (
            <>
              {ordersLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-10">
                  <ShoppingBag className="h-10 w-10 text-stone-200 mx-auto mb-3" />
                  <p className="text-stone-400 text-sm">No purchases yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-100">
                        <th className="pb-2.5 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider">
                          Order
                        </th>
                        <th className="pb-2.5 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="pb-2.5 text-right text-xs font-semibold text-stone-400 uppercase tracking-wider">
                          Total
                        </th>
                        <th className="pb-2.5 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider pl-4">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-stone-50 transition-colors">
                          <td className="py-3 font-medium text-stone-800">{order.number}</td>
                          <td className="py-3">
                            <span
                              className={cn(
                                'inline-block px-2 py-0.5 rounded text-xs font-medium',
                                STATUS_STYLES[order.status] ?? 'bg-slate-100 text-slate-500'
                              )}
                            >
                              {order.status}
                            </span>
                          </td>
                          <td className="py-3 text-right font-semibold text-stone-800">
                            {formatCurrency(order.total, currency)}
                          </td>
                          <td className="py-3 text-stone-500 pl-4">{formatDate(order.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Points history tab */}
          {tab === 'points' && (
            <>
              {pointsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                </div>
              ) : pointsHistory.length === 0 ? (
                <div className="text-center py-10">
                  <Gift className="h-10 w-10 text-stone-200 mx-auto mb-3" />
                  <p className="text-stone-400 text-sm">No points activity yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pointsHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-3 px-4 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                            entry.type === 'EARN'
                              ? 'bg-emerald-100 text-emerald-600'
                              : entry.type === 'REDEEM'
                              ? 'bg-red-100 text-red-500'
                              : 'bg-amber-100 text-amber-600'
                          )}
                        >
                          {entry.type === 'EARN' ? '+' : entry.type === 'REDEEM' ? '−' : '~'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-stone-700">
                            {entry.note ??
                              (entry.type === 'EARN'
                                ? 'Points earned'
                                : entry.type === 'REDEEM'
                                ? 'Points redeemed'
                                : 'Points adjusted')}
                          </p>
                          <p className="text-xs text-stone-400">{formatDate(entry.createdAt)}</p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'text-sm font-bold',
                          entry.type === 'EARN'
                            ? 'text-emerald-600'
                            : entry.type === 'REDEEM'
                            ? 'text-red-500'
                            : 'text-amber-600'
                        )}
                      >
                        {entry.type === 'EARN' ? '+' : entry.type === 'REDEEM' ? '−' : ''}
                        {Math.abs(entry.points)} pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <CustomerFormModal
          storeId={storeId}
          customer={customer}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false)
            fetchCustomer()
          }}
        />
      )}
    </div>
  )
}
