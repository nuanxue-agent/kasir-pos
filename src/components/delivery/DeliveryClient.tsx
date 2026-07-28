'use client'

import { useEffect, useState, useCallback } from 'react'
import { useCurrentStore } from '@/context/StoreContext'
import {
  Truck,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  MapPin,
  Phone,
  UserCheck,
  Plus,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DeliveryStatus = 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED'

export interface Courier {
  id: string
  storeId: string
  name: string
  phone: string
  vehicleType: string
  active: boolean
}

export interface DeliveryOrder {
  id: string
  orderId: string
  storeId: string
  courierId: string | null
  address: string
  status: DeliveryStatus
  estimatedAt: string | null
  deliveredAt: string | null
  notes: string | null
  courierName?: string | null
}

export type OrderType = 'DELIVERY' | 'DINE_IN' | 'TAKEAWAY'

// ─── Fee zone constants ────────────────────────────────────────────────────────

export const DELIVERY_ZONES = [
  { label: 'Zone 1', maxKm: 5, fee: 5_000 },
  { label: 'Zone 2', maxKm: 10, fee: 10_000 },
  { label: 'Zone 3', maxKm: 20, fee: 20_000 },
] as const

export function calculateDeliveryFee(distanceKm: number): number {
  for (const zone of DELIVERY_ZONES) {
    if (distanceKm <= zone.maxKm) return zone.fee
  }
  return 25_000 // beyond zone 3
}

export function getZoneLabel(distanceKm: number): string {
  for (const zone of DELIVERY_ZONES) {
    if (distanceKm <= zone.maxKm) return zone.label
  }
  return 'Luar Zona'
}

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  PENDING: 'Menunggu',
  ASSIGNED: 'Ditugaskan',
  PICKED_UP: 'Diambil',
  DELIVERED: 'Terkirim',
  FAILED: 'Gagal',
}

const STATUS_COLORS: Record<DeliveryStatus, string> = {
  PENDING: 'border-amber-500/60 bg-amber-500/10',
  ASSIGNED: 'border-blue-500/60 bg-blue-500/10',
  PICKED_UP: 'border-violet-500/60 bg-violet-500/10',
  DELIVERED: 'border-emerald-500/60 bg-emerald-500/10',
  FAILED: 'border-red-500/60 bg-red-500/10',
}

const STATUS_BADGE: Record<DeliveryStatus, string> = {
  PENDING: 'bg-amber-500/20 text-amber-400',
  ASSIGNED: 'bg-blue-500/20 text-blue-400',
  PICKED_UP: 'bg-violet-500/20 text-violet-400',
  DELIVERED: 'bg-emerald-500/20 text-emerald-400',
  FAILED: 'bg-red-500/20 text-red-400',
}

const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus | null> = {
  PENDING: 'ASSIGNED',
  ASSIGNED: 'PICKED_UP',
  PICKED_UP: 'DELIVERED',
  DELIVERED: null,
  FAILED: null,
}

const NEXT_LABEL: Record<DeliveryStatus, string> = {
  PENDING: 'Tugaskan Kurir',
  ASSIGNED: 'Tandai Diambil',
  PICKED_UP: 'Tandai Terkirim',
  DELIVERED: '',
  FAILED: '',
}

// ─── Estimated minutes remaining helper ───────────────────────────────────────

function estimatedMinutesRemaining(estimatedAt: string | null): number | null {
  if (!estimatedAt) return null
  const diff = Math.floor((new Date(estimatedAt).getTime() - Date.now()) / 60_000)
  return diff
}

function formatEstimate(estimatedAt: string | null): string {
  const mins = estimatedMinutesRemaining(estimatedAt)
  if (mins === null) return '—'
  if (mins < 0) return 'Terlambat'
  if (mins === 0) return 'Sekarang'
  return `${mins} mnt lagi`
}

// ─── Assign Courier Modal ──────────────────────────────────────────────────────

function AssignModal({
  order,
  couriers,
  onAssign,
  onClose,
}: {
  order: DeliveryOrder
  couriers: Courier[]
  onAssign: (orderId: string, courierId: string) => Promise<void>
  onClose: () => void
}) {
  const [selected, setSelected] = useState(order.courierId ?? '')
  const [saving, setSaving] = useState(false)

  const active = couriers.filter(c => c.active)

  async function handleAssign() {
    if (!selected) return
    setSaving(true)
    try {
      await onAssign(order.id, selected)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tugaskan kurir"
    >
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 shadow-xl">
        <h2 className="text-base font-semibold text-[var(--text-1)]">Tugaskan Kurir</h2>
        <p className="text-xs text-[var(--text-3)]">Pesanan #{order.orderId.slice(-8)}</p>

        {active.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">Tidak ada kurir aktif.</p>
        ) : (
          <ul className="space-y-2 max-h-60 overflow-y-auto">
            {active.map(c => (
              <li key={c.id}>
                <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-[var(--border)] p-3 hover:bg-[var(--bg-subtle)] transition-colors">
                  <input
                    type="radio"
                    name="courier"
                    value={c.id}
                    checked={selected === c.id}
                    onChange={() => setSelected(c.id)}
                    className="accent-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-1)] truncate">{c.name}</p>
                    <p className="text-xs text-[var(--text-3)]">{c.vehicleType} · {c.phone}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleAssign}
            disabled={!selected || saving}
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
            {saving ? 'Menyimpan…' : 'Tugaskan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delivery Card ─────────────────────────────────────────────────────────────

function DeliveryCard({
  order,
  onAdvance,
  onMarkFailed,
  onAssign,
  couriers,
  advancing,
}: {
  order: DeliveryOrder
  onAdvance: (o: DeliveryOrder) => void
  onMarkFailed: (o: DeliveryOrder) => void
  onAssign: (orderId: string, courierId: string) => Promise<void>
  couriers: Courier[]
  advancing: boolean
}) {
  const [showAssign, setShowAssign] = useState(false)
  const next = NEXT_STATUS[order.status]
  const terminal = order.status === 'DELIVERED' || order.status === 'FAILED'

  return (
    <>
      <article
        className={cn(
          'rounded-xl border-2 p-4 space-y-3 transition-colors',
          STATUS_COLORS[order.status],
        )}
        aria-label={`Pesanan pengiriman ${order.orderId.slice(-8)}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-[var(--text-1)]">#{order.orderId.slice(-8)}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_BADGE[order.status])}>
            {STATUS_LABEL[order.status]}
          </span>
        </div>

        {/* Address */}
        <div className="flex items-start gap-1.5 text-xs text-[var(--text-2)]">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[var(--text-3)]" aria-hidden="true" />
          <span className="line-clamp-2">{order.address}</span>
        </div>

        {/* Courier info */}
        {order.courierName ? (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-2)]">
            <Truck className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden="true" />
            <span>{order.courierName}</span>
          </div>
        ) : (
          <p className="text-xs text-amber-500 italic">Belum ada kurir</p>
        )}

        {/* Estimated delivery */}
        {order.estimatedAt && order.status !== 'DELIVERED' && order.status !== 'FAILED' && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{formatEstimate(order.estimatedAt)}</span>
          </div>
        )}

        {/* Delivered at */}
        {order.deliveredAt && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Terkirim {new Date(order.deliveredAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <p className="text-xs text-[var(--text-3)] italic border-t border-[var(--border)] pt-2">
            {order.notes}
          </p>
        )}

        {/* Actions */}
        {!terminal && (
          <div className="flex gap-2 pt-1">
            {order.status === 'PENDING' && (
              <button
                onClick={() => setShowAssign(true)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Tugaskan Kurir
              </button>
            )}
            {next && order.status !== 'PENDING' && (
              <button
                onClick={() => onAdvance(order)}
                disabled={advancing}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                {advancing ? 'Memperbarui…' : NEXT_LABEL[order.status]}
              </button>
            )}
            {order.status !== 'PENDING' && (
              <button
                onClick={() => onMarkFailed(order)}
                disabled={advancing}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                aria-label="Tandai gagal"
              >
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </article>

      {showAssign && (
        <AssignModal
          order={order}
          couriers={couriers}
          onAssign={onAssign}
          onClose={() => setShowAssign(false)}
        />
      )}
    </>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function DeliveryClient() {
  const currentStore = useCurrentStore()
  const storeId = currentStore?.id ?? ''

  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [tab, setTab] = useState<'active' | 'done'>('active')

  const fetchAll = useCallback(async () => {
    if (!storeId) return
    try {
      const [ordersRes, couriersRes] = await Promise.all([
        fetch(`/api/delivery/orders?storeId=${storeId}`),
        fetch(`/api/delivery/couriers?storeId=${storeId}`),
      ])
      const ordersData = await ordersRes.json() as { data?: DeliveryOrder[] }
      const couriersData = await couriersRes.json() as { data?: Courier[] }
      if (ordersData.data) setOrders(ordersData.data)
      if (couriersData.data) setCouriers(couriersData.data)
    } catch {
      // silently retry
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }, [storeId])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30_000)
    return () => clearInterval(interval)
  }, [fetchAll])

  async function advanceStatus(order: DeliveryOrder) {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setAdvancing(order.id)
    try {
      const body: Record<string, unknown> = { status: next }
      if (next === 'DELIVERED') body.deliveredAt = new Date().toISOString()
      await fetch(`/api/delivery/orders/${order.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setOrders(prev =>
        prev.map(o =>
          o.id === order.id
            ? { ...o, status: next, deliveredAt: next === 'DELIVERED' ? new Date().toISOString() : o.deliveredAt }
            : o,
        ),
      )
    } finally {
      setAdvancing(null)
    }
  }

  async function markFailed(order: DeliveryOrder) {
    setAdvancing(order.id)
    try {
      await fetch(`/api/delivery/orders/${order.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FAILED' }),
      })
      setOrders(prev =>
        prev.map(o => (o.id === order.id ? { ...o, status: 'FAILED' } : o)),
      )
    } finally {
      setAdvancing(null)
    }
  }

  async function assignCourier(deliveryOrderId: string, courierId: string) {
    const courier = couriers.find(c => c.id === courierId)
    const estimatedAt = new Date(Date.now() + 45 * 60_000).toISOString()
    await fetch(`/api/delivery/orders/${deliveryOrderId}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ASSIGNED', courierId, estimatedAt }),
    })
    setOrders(prev =>
      prev.map(o =>
        o.id === deliveryOrderId
          ? { ...o, status: 'ASSIGNED', courierId, courierName: courier?.name ?? null, estimatedAt }
          : o,
      ),
    )
  }

  const TERMINAL: DeliveryStatus[] = ['DELIVERED', 'FAILED']
  const active = orders.filter(o => !TERMINAL.includes(o.status))
  const done = orders.filter(o => TERMINAL.includes(o.status))

  const displayed = tab === 'active' ? active : done

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Truck className="h-7 w-7 text-blue-500" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold text-[var(--text-1)]">Pengiriman</h1>
            <p className="text-xs text-[var(--text-3)]">
              Refresh otomatis tiap 30 detik · Terakhir: {lastRefresh.toLocaleTimeString('id-ID')}
            </p>
          </div>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'] as DeliveryStatus[]).map(s => {
          const count = orders.filter(o => o.status === s).length
          return (
            <div
              key={s}
              className={cn(
                'rounded-xl border p-4 text-center',
                STATUS_COLORS[s],
              )}
            >
              <p className="text-2xl font-bold text-[var(--text-1)]">{count}</p>
              <p className={cn('text-xs font-medium mt-0.5', STATUS_BADGE[s].replace('bg-', 'text-').split(' ')[0])}>{STATUS_LABEL[s]}</p>
            </div>
          )
        })}
      </div>

      {/* Zone fee legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {DELIVERY_ZONES.map(z => (
          <span
            key={z.label}
            className="rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1 text-[var(--text-2)]"
          >
            {z.label} (&lt;{z.maxKm}km) — Rp{z.fee.toLocaleString('id-ID')}
          </span>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-1 w-fit">
        {(['active', 'done'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            {t === 'active' ? `Aktif (${active.length})` : `Selesai (${done.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-hidden="true" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <Package className="h-14 w-14 text-[var(--text-4)]" aria-hidden="true" />
          <p className="text-[var(--text-2)] font-medium">
            {tab === 'active' ? 'Tidak ada pesanan pengiriman aktif' : 'Belum ada pengiriman selesai'}
          </p>
          <p className="text-xs text-[var(--text-3)]">
            Pesanan dengan tipe Delivery akan muncul di sini
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayed.map(order => (
            <DeliveryCard
              key={order.id}
              order={order}
              onAdvance={advanceStatus}
              onMarkFailed={markFailed}
              onAssign={assignCourier}
              couriers={couriers}
              advancing={advancing === order.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
