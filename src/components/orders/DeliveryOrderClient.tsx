'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  MapPin,
  Clock,
  User,
  Package,
  X,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export type DeliveryStatus = 'PENDING' | 'PREPARING' | 'ON_DELIVERY' | 'DELIVERED' | 'CANCELLED'

interface DeliveryOrder {
  id: string
  storeId: string
  orderId: string
  customerId: string | null
  customerName: string | null
  address: string
  status: DeliveryStatus
  driverId: string | null
  driverName: string | null
  estimatedMinutes: number | null
  distanceKm: number | null
  itemsSummary: string | null
  total: number
  orderNumber: string | null
  createdAt: string
}

interface Employee {
  id: string
  name: string
  role: string
  phone: string | null
}

interface DeliveryOrderClientProps {
  storeId: string
  currency: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; cls: string; icon: React.ReactNode }> =
  {
    PENDING: {
      label: 'Menunggu',
      cls: 'bg-yellow-100 text-yellow-700',
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    PREPARING: {
      label: 'Disiapkan',
      cls: 'bg-blue-100 text-blue-700',
      icon: <Package className="w-3.5 h-3.5" />,
    },
    ON_DELIVERY: {
      label: 'Dikirim',
      cls: 'bg-purple-100 text-purple-700',
      icon: <Truck className="w-3.5 h-3.5" />,
    },
    DELIVERED: {
      label: 'Terkirim',
      cls: 'bg-emerald-100 text-emerald-700',
      icon: <CheckCircle className="w-3.5 h-3.5" />,
    },
    CANCELLED: {
      label: 'Dibatalkan',
      cls: 'bg-red-100 text-red-600',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
  }

const STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus | null> = {
  PENDING: 'PREPARING',
  PREPARING: 'ON_DELIVERY',
  ON_DELIVERY: 'DELIVERED',
  DELIVERED: null,
  CANCELLED: null,
}

const TABS: Array<{ value: DeliveryStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Semua' },
  { value: 'PENDING', label: 'Menunggu' },
  { value: 'PREPARING', label: 'Disiapkan' },
  { value: 'ON_DELIVERY', label: 'Dikirim' },
  { value: 'DELIVERED', label: 'Terkirim' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
]

const ic =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency }).format(amount)
}

function elapsedLabel(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  if (diff < 60) return `${diff} mnt lalu`
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return `${h}j ${m}m lalu`
}

// ── Assign Driver Modal ────────────────────────────────────────────────────────

function AssignDriverModal({
  order,
  storeId,
  onClose,
  onAssigned,
}: {
  order: DeliveryOrder
  storeId: string
  onClose: () => void
  onAssigned: () => void
}) {
  const [selectedDriver, setSelectedDriver] = useState(order.driverId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: employeesRaw, isLoading } = useQuery({
    queryKey: ['employees', storeId],
    queryFn: () => fetch(`/api/employees?storeId=${storeId}`).then(r => r.json()),
  })

  const drivers: Employee[] = ((employeesRaw as any[]) ?? []).filter(
    (e: Employee) => e.role === 'DRIVER',
  )

  async function handleAssign() {
    if (!selectedDriver) return setError('Pilih driver terlebih dahulu')
    setError('')
    setSaving(true)
    const res = await fetch(`/api/delivery-orders/${order.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: selectedDriver }),
    })
    setSaving(false)
    if (res.ok) {
      onAssigned()
    } else {
      const data = await res.json().catch(() => ({}))
      setError((data as any).error ?? 'Gagal assign driver')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[var(--text-1)]">Pilih Driver</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
        ) : drivers.length === 0 ? (
          <p className="text-sm text-[var(--text-3)] text-center py-4">
            Tidak ada driver terdaftar. Tambahkan karyawan dengan role DRIVER.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {drivers.map(d => (
              <button
                key={d.id}
                onClick={() => setSelectedDriver(d.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                  selectedDriver === d.id
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-[var(--border)] hover:border-amber-300',
                )}
              >
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-1)]">{d.name}</p>
                  {d.phone && <p className="text-xs text-[var(--text-3)]">{d.phone}</p>}
                </div>
                {selectedDriver === d.id && (
                  <CheckCircle className="w-4 h-4 text-amber-500 ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleAssign}
            disabled={saving || !selectedDriver}
            className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Assign
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Order Card ─────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  currency,
  storeId,
  onRefresh,
}: {
  order: DeliveryOrder
  currency: string
  storeId: string
  onRefresh: () => void
}) {
  const [showAssign, setShowAssign] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  const cfg = STATUS_CONFIG[order.status]
  const nextStatus = STATUS_TRANSITIONS[order.status]

  async function advanceStatus() {
    if (!nextStatus) return
    setAdvancing(true)
    await fetch(`/api/delivery-orders/${order.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    setAdvancing(false)
    onRefresh()
  }

  async function cancelOrder() {
    if (!confirm('Batalkan pesanan ini?')) return
    await fetch(`/api/delivery-orders/${order.id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    })
    onRefresh()
  }

  return (
    <>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 hover:shadow-md transition-shadow">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm text-[var(--text-1)]">
              {order.orderNumber ?? `#${order.id.slice(-6).toUpperCase()}`}
            </p>
            <p className="text-xs text-[var(--text-3)] mt-0.5">{elapsedLabel(order.createdAt)}</p>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              cfg.cls,
            )}
          >
            {cfg.icon}
            {cfg.label}
          </span>
        </div>

        {/* Customer */}
        <div className="flex items-center gap-2 text-sm text-[var(--text-2)]">
          <User className="w-4 h-4 flex-shrink-0 text-[var(--text-3)]" />
          <span>{order.customerName ?? 'Pelanggan tidak dikenal'}</span>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2 text-sm text-[var(--text-2)]">
          <MapPin className="w-4 h-4 flex-shrink-0 text-[var(--text-3)] mt-0.5" />
          <span className="line-clamp-2">{order.address}</span>
        </div>

        {/* Items summary */}
        {order.itemsSummary && (
          <div className="flex items-start gap-2 text-sm text-[var(--text-2)]">
            <Package className="w-4 h-4 flex-shrink-0 text-[var(--text-3)] mt-0.5" />
            <span className="line-clamp-1 text-xs text-[var(--text-3)]">{order.itemsSummary}</span>
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-4 text-xs text-[var(--text-3)]">
          {order.distanceKm != null && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {order.distanceKm.toFixed(1)} km
            </span>
          )}
          {order.estimatedMinutes != null && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              ETA ~{order.estimatedMinutes} mnt
            </span>
          )}
          {order.driverName && (
            <span className="flex items-center gap-1">
              <Truck className="w-3 h-3" />
              {order.driverName}
            </span>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
          <span className="text-sm font-semibold text-[var(--text-1)]">
            {formatCurrency(order.total, currency)}
          </span>
          <div className="flex items-center gap-2">
            {/* Assign driver button — show when no driver and not terminal */}
            {!order.driverId &&
              order.status !== 'DELIVERED' &&
              order.status !== 'CANCELLED' && (
                <button
                  onClick={() => setShowAssign(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-50 transition-colors"
                >
                  Assign Driver
                </button>
              )}

            {/* Cancel */}
            {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
              <button
                onClick={cancelOrder}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
              >
                Batal
              </button>
            )}

            {/* Advance status */}
            {nextStatus && (
              <button
                onClick={advanceStatus}
                disabled={advancing}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {advancing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                {STATUS_CONFIG[nextStatus].label}
              </button>
            )}
          </div>
        </div>
      </div>

      {showAssign && (
        <AssignDriverModal
          order={order}
          storeId={storeId}
          onClose={() => setShowAssign(false)}
          onAssigned={() => {
            setShowAssign(false)
            onRefresh()
          }}
        />
      )}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DeliveryOrderClient({ storeId, currency }: DeliveryOrderClientProps) {
  const [activeTab, setActiveTab] = useState<DeliveryStatus | 'ALL'>('ALL')
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['delivery-orders', storeId, activeTab],
    queryFn: () => {
      const url =
        activeTab === 'ALL'
          ? `/api/delivery-orders?storeId=${storeId}`
          : `/api/delivery-orders?storeId=${storeId}&status=${activeTab}`
      return fetch(url).then(r => r.json())
    },
    refetchInterval: 30_000,
  })

  const orders: DeliveryOrder[] = Array.isArray(data) ? data : []

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['delivery-orders', storeId] })
  }

  // Count per status for badges
  const { data: allData } = useQuery({
    queryKey: ['delivery-orders', storeId, 'ALL'],
    queryFn: () => fetch(`/api/delivery-orders?storeId=${storeId}`).then(r => r.json()),
    refetchInterval: 30_000,
  })
  const allOrders: DeliveryOrder[] = Array.isArray(allData) ? allData : []
  const countByStatus = allOrders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Page header */}
      <div className="sticky top-0 z-10 bg-[var(--bg-base)] border-b border-[var(--border)] px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-amber-500" />
            <h1 className="font-semibold text-[var(--text-1)]">Pengiriman</h1>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors text-[var(--text-3)]"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Status tabs */}
        <div className="max-w-5xl mx-auto mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map(tab => {
            const count = tab.value === 'ALL' ? allOrders.length : (countByStatus[tab.value] ?? 0)
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  activeTab === tab.value
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-card)]',
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold',
                      activeTab === tab.value ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600',
                    )}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-[var(--text-3)]">Memuat pesanan…</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <XCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-[var(--text-3)]">Gagal memuat data</p>
            <button
              onClick={() => refetch()}
              className="text-sm text-amber-600 hover:underline"
            >
              Coba lagi
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Truck className="w-10 h-10 text-stone-300" />
            <p className="text-sm text-[var(--text-3)]">Belum ada pesanan pengiriman</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                currency={currency}
                storeId={storeId}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
