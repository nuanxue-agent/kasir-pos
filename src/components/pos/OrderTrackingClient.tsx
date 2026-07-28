'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Clock, Package, Truck, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrackingStatus =
  | 'PENDING'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'

export interface OrderTrackingData {
  id: string
  orderId: string
  storeId: string
  token: string
  status: TrackingStatus
  updatedAt: string
  createdAt: string
  estimatedMinutes: number | null
  notes: string | null
  storeName?: string | null
  timeline?: TimelineEntry[]
}

export interface TimelineEntry {
  status: TrackingStatus
  timestamp: string
  notes?: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<TrackingStatus, string> = {
  PENDING: 'Menunggu Konfirmasi',
  PREPARING: 'Sedang Diproses',
  READY: 'Siap Diambil',
  OUT_FOR_DELIVERY: 'Dalam Pengiriman',
  DELIVERED: 'Selesai',
}

export const STATUS_DESCRIPTIONS: Record<TrackingStatus, string> = {
  PENDING: 'Pesanan kamu sedang menunggu konfirmasi dari toko.',
  PREPARING: 'Pesanan kamu sedang disiapkan oleh tim kami.',
  READY: 'Pesanan kamu siap! Silakan ambil di toko.',
  OUT_FOR_DELIVERY: 'Pesanan kamu sedang dalam perjalanan menuju lokasimu.',
  DELIVERED: 'Pesanan kamu telah selesai. Terima kasih!',
}

const STATUS_ORDER: TrackingStatus[] = [
  'PENDING',
  'PREPARING',
  'READY',
  'DELIVERED',
]

const STATUS_ICONS: Record<TrackingStatus, React.ComponentType<{ className?: string }>> = {
  PENDING: Clock,
  PREPARING: Package,
  READY: CheckCircle,
  OUT_FOR_DELIVERY: Truck,
  DELIVERED: CheckCircle,
}

// ── Pure Logic Exports (for unit tests) ───────────────────────────────────────

export function getStatusStep(status: TrackingStatus): number {
  const idx = STATUS_ORDER.indexOf(status)
  // OUT_FOR_DELIVERY sits between READY and DELIVERED in display
  if (status === 'OUT_FOR_DELIVERY') return 2
  return idx === -1 ? 0 : idx
}

const STATUS_DEFAULT_MINUTES: Record<TrackingStatus, number> = {
  PENDING: 20,
  PREPARING: 15,
  READY: 0,
  OUT_FOR_DELIVERY: 30,
  DELIVERED: 0,
}

/**
 * Returns a human-readable estimated time string, or null if no estimate applies.
 * - DELIVERED → null (already done)
 * - READY with no explicit minutes → null
 * - time already elapsed → "Sebentar lagi"
 * - future → "~N menit lagi"
 */
export function calculateEstimatedTime(
  status: TrackingStatus,
  createdAt: string,
  estimatedMinutes: number | null,
): string | null {
  if (status === 'DELIVERED') return null

  const defaultMins = STATUS_DEFAULT_MINUTES[status]
  const mins = estimatedMinutes ?? defaultMins

  if (mins <= 0) return null

  const created = new Date(createdAt).getTime()
  const now = Date.now()
  const elapsedMinutes = (now - created) / 60000
  const remaining = Math.round(mins - elapsedMinutes)

  if (remaining <= 0) return 'Sebentar lagi'
  return `~${remaining} menit lagi`
}

// ── Staff Update Component ────────────────────────────────────────────────────

interface StaffUpdateFormProps {
  trackingId: string
  currentStatus: TrackingStatus
  onUpdated: () => void
}

function StaffUpdateForm({ trackingId, currentStatus, onUpdated }: StaffUpdateFormProps) {
  const [status, setStatus] = useState<TrackingStatus>(currentStatus)
  const [notes, setNotes] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const VALID_NEXT: Record<TrackingStatus, TrackingStatus[]> = {
    PENDING: ['PREPARING', 'DELIVERED'],
    PREPARING: ['READY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
    READY: ['DELIVERED'],
    OUT_FOR_DELIVERY: ['DELIVERED'],
    DELIVERED: [],
  }

  const nextStatuses = VALID_NEXT[currentStatus]

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/order-tracking/${trackingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          notes: notes || undefined,
          estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : undefined,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Status pesanan diperbarui')
      onUpdated()
    } catch {
      toast.error('Gagal memperbarui status')
    } finally {
      setSaving(false)
    }
  }

  if (nextStatuses.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>
        Pesanan sudah selesai.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>
          Status Baru
        </label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value as TrackingStatus)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
        >
          {nextStatuses.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>
          Estimasi (menit, opsional)
        </label>
        <input
          type="number"
          min={0}
          value={estimatedMinutes}
          onChange={e => setEstimatedMinutes(e.target.value)}
          placeholder="cth: 15"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>
          Catatan (opsional)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Tambahkan catatan untuk pelanggan..."
          className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
          style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving || status === currentStatus}
        className="w-full rounded-lg py-2 text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--primary)' }}
      >
        {saving ? 'Menyimpan...' : 'Perbarui Status'}
      </button>
    </div>
  )
}

// ── Staff Order Tracking Dashboard Component ──────────────────────────────────

interface OrderTrackingClientProps {
  storeId: string
  currency: string
}

export default function OrderTrackingClient({ storeId }: OrderTrackingClientProps) {
  const [orders, setOrders] = useState<OrderTrackingData[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TrackingStatus | 'ALL'>('ALL')

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/order-tracking?storeId=${storeId}`)
      const json = await res.json() as any
      if (json.error) return
      setOrders(json as OrderTrackingData[])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 15000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  const filtered = statusFilter === 'ALL'
    ? orders
    : orders.filter(o => o.status === statusFilter)

  const statusCounts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
          Pelacakan Pesanan
        </h1>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(['ALL', 'PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === s
                ? 'text-white'
                : 'border',
            )}
            style={
              statusFilter === s
                ? { background: 'var(--primary)' }
                : { borderColor: 'var(--border)', color: 'var(--text-2)' }
            }
          >
            {s === 'ALL' ? 'Semua' : STATUS_LABELS[s]}
            {s !== 'ALL' && statusCounts[s] ? ` (${statusCounts[s]})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center" style={{ color: 'var(--text-3)' }}>Memuat...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--text-3)' }}>
          Tidak ada pesanan ditemukan
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const Icon = STATUS_ICONS[order.status] as any
            const isExpanded = expandedId === order.id
            const estTime = calculateEstimatedTime(order.status, order.createdAt, order.estimatedMinutes)

            return (
              <div
                key={order.id}
                className="rounded-xl border overflow-hidden"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full flex items-center justify-between gap-4 p-4 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-5 w-5 shrink-0" style={{ color: 'var(--primary)' }} />
                    <div className="min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--text-1)' }}>
                        Pesanan #{order.orderId.slice(-8).toUpperCase()}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                        {STATUS_LABELS[order.status]}
                        {estTime ? ` · ${estTime}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-3)' }}>
                    {new Date(order.updatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>

                {isExpanded && (
                  <div
                    className="border-t px-4 pb-4 pt-3 space-y-4"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {/* Timeline */}
                    {order.timeline && order.timeline.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
                          Riwayat Status
                        </p>
                        <div className="space-y-2">
                          {[...order.timeline]
                            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                            .map((entry, i) => (
                              <div key={i} className="flex items-start gap-3 text-sm">
                                <div
                                  className="mt-0.5 h-2 w-2 rounded-full shrink-0"
                                  style={{ background: 'var(--primary)' }}
                                />
                                <div>
                                  <span style={{ color: 'var(--text-1)' }}>{STATUS_LABELS[entry.status]}</span>
                                  <span className="ml-2 text-xs" style={{ color: 'var(--text-3)' }}>
                                    {new Date(entry.timestamp).toLocaleString('id-ID')}
                                  </span>
                                  {entry.notes && (
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{entry.notes}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Staff update form */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
                        Perbarui Status
                      </p>
                      <StaffUpdateForm
                        trackingId={order.id}
                        currentStatus={order.status}
                        onUpdated={fetchOrders}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Public Customer Tracking View ─────────────────────────────────────────────

interface OrderTrackingViewProps {
  token: string
  initialData: OrderTrackingData | null
}

export function OrderTrackingView({ token, initialData }: OrderTrackingViewProps) {
  const [data, setData] = useState<OrderTrackingData | null>(initialData)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/track/${token}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Pesanan tidak ditemukan. Periksa kembali link pelacakan kamu.')
        } else {
          setError('Gagal memuat status pesanan.')
        }
        return
      }
      const json = await res.json() as any
      setData(json as OrderTrackingData)
      setLastUpdated(new Date())
      setError(null)
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!initialData) fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [fetchData, initialData])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-1)' }}>
        <div className="text-center space-y-3">
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: 'var(--primary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>Memuat status pesanan...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-1)' }}>
        <div className="max-w-sm w-full text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto" style={{ color: 'var(--text-3)' }} />
          <p style={{ color: 'var(--text-2)' }}>{error ?? 'Pesanan tidak ditemukan.'}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--primary)' }}
          >
            Coba Lagi
          </button>
        </div>
      </div>
    )
  }

  const currentStep = getStatusStep(data.status)
  const estTime = calculateEstimatedTime(data.status, data.createdAt, data.estimatedMinutes)

  // Timeline steps to show (skip OUT_FOR_DELIVERY unless it was reached)
  const displaySteps: TrackingStatus[] = data.status === 'OUT_FOR_DELIVERY'
    ? ['PENDING', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED']
    : ['PENDING', 'PREPARING', 'READY', 'DELIVERED']

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: 'var(--bg-1)' }}>
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          {data.storeName && (
            <p className="text-sm font-medium" style={{ color: 'var(--primary)' }}>{data.storeName}</p>
          )}
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
            Status Pesanan
          </h1>
          <p className="text-sm font-mono" style={{ color: 'var(--text-3)' }}>
            #{data.orderId.slice(-8).toUpperCase()}
          </p>
        </div>

        {/* Status card */}
        <div
          className="rounded-2xl p-6 text-center space-y-3 border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {(() => {
            const Icon = STATUS_ICONS[data.status] as any
            return <Icon className="h-12 w-12 mx-auto" style={{ color: 'var(--primary)' }} />
          })()}
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
            {STATUS_LABELS[data.status]}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            {STATUS_DESCRIPTIONS[data.status]}
          </p>
          {estTime && (
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium"
              style={{ background: 'var(--bg-2)', color: 'var(--text-1)' }}
            >
              <Clock className="h-4 w-4" />
              {estTime}
            </div>
          )}
          {data.notes && (
            <p className="text-sm italic border-t pt-3 mt-3" style={{ color: 'var(--text-2)', borderColor: 'var(--border)' }}>
              {data.notes}
            </p>
          )}
        </div>

        {/* Progress steps */}
        <div
          className="rounded-2xl p-5 border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="relative">
            {/* Track line */}
            <div
              className="absolute left-4 top-4 bottom-4 w-0.5"
              style={{ background: 'var(--border)' }}
            />
            <div className="space-y-4">
              {displaySteps.map((step, idx) => {
                const stepIndex = displaySteps.indexOf(step)
                const isDone = currentStep > idx || data.status === step
                const isCurrent = data.status === step
                const Icon = STATUS_ICONS[step]
                const entry = data.timeline
                  ?.filter(t => t.status === step)
                  ?.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

                return (
                  <div key={step} className="flex items-start gap-4 relative">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 z-10',
                        isDone ? 'text-white' : '',
                      )}
                      style={{
                        background: isDone ? 'var(--primary)' : 'var(--bg-2)',
                        borderColor: isDone ? 'var(--primary)' : 'var(--border)',
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="pt-1">
                      <p
                        className="text-sm font-medium"
                        style={{ color: isCurrent ? 'var(--primary)' : isDone ? 'var(--text-1)' : 'var(--text-3)' }}
                      >
                        {STATUS_LABELS[step]}
                      </p>
                      {entry && (
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {new Date(entry.timestamp).toLocaleString('id-ID', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs" style={{ color: 'var(--text-3)' }}>
          Diperbarui otomatis · terakhir {lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
