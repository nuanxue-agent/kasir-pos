'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock, CheckCircle2, ChefHat, Package, Loader2, RefreshCw, QrCode } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrackingStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED'

export interface OrderTrackingItem {
  id: string
  name: string
  qty: number
  price: number
}

export interface OrderTrackingData {
  orderId: string
  orderNumber: string
  status: TrackingStatus
  items: OrderTrackingItem[]
  estimatedMinutes: number | null
  createdAt: string
  storeName?: string
}

// ─── OrderTracking DB table schema (lazy init, used server-side) ──────────────
// CREATE TABLE IF NOT EXISTS OrderTracking (
//   id TEXT PRIMARY KEY,
//   orderId TEXT NOT NULL,
//   publicToken TEXT NOT NULL UNIQUE,
//   storeId TEXT NOT NULL,
//   createdAt TEXT NOT NULL
// )

// ─── Status helpers ───────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<TrackingStatus, string> = {
  PENDING: 'Menunggu Konfirmasi',
  PREPARING: 'Sedang Diproses',
  READY: 'Siap Diambil',
  DELIVERED: 'Selesai',
}

export const STATUS_DESCRIPTIONS: Record<TrackingStatus, string> = {
  PENDING: 'Pesanan Anda telah diterima dan sedang menunggu konfirmasi.',
  PREPARING: 'Pesanan Anda sedang disiapkan oleh tim kami.',
  READY: 'Pesanan Anda sudah siap! Silakan ambil atau tunggu pengiriman.',
  DELIVERED: 'Pesanan Anda telah selesai. Terima kasih!',
}

const STATUS_ORDER: TrackingStatus[] = ['PENDING', 'PREPARING', 'READY', 'DELIVERED']

export function getStatusStep(status: TrackingStatus): number {
  return STATUS_ORDER.indexOf(status)
}

export function calculateEstimatedTime(
  status: TrackingStatus,
  createdAt: string,
  estimatedMinutes: number | null,
): string | null {
  if (status === 'DELIVERED') return null
  if (!estimatedMinutes) {
    // Default estimates by status
    const defaults: Partial<Record<TrackingStatus, number>> = {
      PENDING: 20,
      PREPARING: 15,
      READY: 0,
    }
    const mins = defaults[status]
    if (mins === undefined || mins === 0) return null
    const created = new Date(createdAt)
    const ready = new Date(created.getTime() + mins * 60 * 1000)
    const now = new Date()
    const diff = Math.max(0, Math.round((ready.getTime() - now.getTime()) / 60000))
    return diff > 0 ? `~${diff} menit lagi` : 'Sebentar lagi'
  }
  const created = new Date(createdAt)
  const ready = new Date(created.getTime() + estimatedMinutes * 60 * 1000)
  const now = new Date()
  const diff = Math.max(0, Math.round((ready.getTime() - now.getTime()) / 60000))
  return diff > 0 ? `~${diff} menit lagi` : 'Sebentar lagi'
}

// ─── QR Code stub ─────────────────────────────────────────────────────────────

interface QRCodeStubProps {
  url: string
}

export function QRCodeStub({ url }: QRCodeStubProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32 border-2 border-[var(--border-mid)] rounded-lg flex items-center justify-center bg-[var(--bg-card)]">
        <QrCode className="w-16 h-16 text-[var(--text-3)]" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-[var(--bg-card)]/90 rounded-lg">
          <span className="text-xs text-center text-[var(--text-3)] px-2 break-all">{url}</span>
        </div>
      </div>
      <p className="text-xs text-[var(--text-3)]">Scan untuk lacak pesanan</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-600 underline break-all text-center max-w-[200px]"
      >
        {url}
      </a>
    </div>
  )
}

// ─── Status step indicator ────────────────────────────────────────────────────

interface StatusStepperProps {
  currentStatus: TrackingStatus
}

function StatusStepper({ currentStatus }: StatusStepperProps) {
  const currentStep = getStatusStep(currentStatus)

  const icons = [Clock, ChefHat, Package, CheckCircle2]

  return (
    <div className="flex items-center justify-between w-full px-2">
      {STATUS_ORDER.map((status, i) => {
        const Icon = icons[i]
        const done = i < currentStep
        const active = i === currentStep
        const future = i > currentStep

        return (
          <div key={status} className="flex flex-col items-center flex-1">
            {/* Connector */}
            <div className="flex items-center w-full">
              {i > 0 && (
                <div
                  className={cn(
                    'h-1 flex-1 transition-colors duration-500',
                    done || active ? 'bg-green-500' : 'bg-[var(--bg-muted)]',
                  )}
                />
              )}
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 shrink-0',
                  done && 'bg-green-500 border-green-500 text-white',
                  active && 'bg-blue-500 border-blue-500 text-white scale-110',
                  future && 'bg-[var(--bg-subtle)] border-[var(--border-mid)] text-[var(--text-3)]',
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              {i < STATUS_ORDER.length - 1 && (
                <div
                  className={cn(
                    'h-1 flex-1 transition-colors duration-500',
                    done ? 'bg-green-500' : 'bg-[var(--bg-muted)]',
                  )}
                />
              )}
            </div>
            {/* Label */}
            <span
              className={cn(
                'text-[10px] mt-1 text-center font-medium leading-tight',
                active && 'text-blue-600',
                done && 'text-green-600',
                future && 'text-[var(--text-3)]',
              )}
            >
              {STATUS_LABELS[status]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main public tracking view ────────────────────────────────────────────────

interface OrderTrackingViewProps {
  token: string
  initialData?: OrderTrackingData | null
}

export function OrderTrackingView({ token, initialData }: OrderTrackingViewProps) {
  const [data, setData] = useState<OrderTrackingData | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(initialData ? new Date() : null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStatus = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      else setRefreshing(true)
      try {
        const res = await fetch(`/api/track/${token}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as { error?: string })) as { error?: string }
          setError(body?.error ?? 'Pesanan tidak ditemukan')
          return
        }
        const json = await res.json() as OrderTrackingData
        setData(json)
        setError(null)
        setLastUpdated(new Date())
      } catch {
        setError('Gagal memuat status pesanan. Coba lagi.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [token],
  )

  // Initial load
  useEffect(() => {
    if (!initialData) fetchStatus(false)
  }, [fetchStatus, initialData])

  // Auto-refresh every 15s
  useEffect(() => {
    const id = setInterval(() => fetchStatus(true), 15_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-subtle)]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-subtle)] p-4">
        <div className="text-center space-y-3">
          <p className="text-red-500 font-medium">{error ?? 'Pesanan tidak ditemukan'}</p>
          <button
            onClick={() => fetchStatus(false)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    )
  }

  const estimatedTime = calculateEstimatedTime(data.status, data.createdAt, data.estimatedMinutes)

  return (
    <div className="min-h-screen bg-[var(--bg-subtle)] flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--text-1)]">
            {data.storeName ?? 'Status Pesanan'}
          </h1>
          <p className="text-[var(--text-3)] text-sm mt-1">
            Pesanan #{data.orderNumber}
          </p>
        </div>

        {/* Status card */}
        <div className="bg-[var(--bg-card)] rounded-2xl shadow-sm border border-[var(--border)] p-6 space-y-6">
          {/* Stepper */}
          <StatusStepper currentStatus={data.status} />

          {/* Current status description */}
          <div className="text-center space-y-1">
            <p className="font-semibold text-[var(--text-1)]">{STATUS_LABELS[data.status]}</p>
            <p className="text-sm text-[var(--text-3)]">{STATUS_DESCRIPTIONS[data.status]}</p>
            {estimatedTime && (
              <p className="text-sm font-medium text-blue-600 flex items-center justify-center gap-1">
                <Clock className="w-4 h-4" />
                {estimatedTime}
              </p>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="bg-[var(--bg-card)] rounded-2xl shadow-sm border border-[var(--border)] p-6">
          <h2 className="font-semibold text-[var(--text-1)] mb-3">Item Pesanan</h2>
          <ul className="space-y-2">
            {data.items.map((item) => (
              <li key={item.id} className="flex justify-between text-sm">
                <span className="text-[var(--text-2)]">
                  {item.name}{' '}
                  <span className="text-[var(--text-3)]">×{item.qty}</span>
                </span>
                <span className="text-[var(--text-2)] font-medium">
                  Rp {(item.price * item.qty).toLocaleString('id-ID')}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Refresh indicator */}
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-3)]">
          {refreshing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          <span>
            {lastUpdated
              ? `Diperbarui ${lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Auto-refresh setiap 15 detik'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard: Generate tracking link ───────────────────────────────────────

interface GenerateTrackingLinkProps {
  orderId: string
  orderNumber: string
  storeId: string
}

export function GenerateTrackingLink({ orderId, orderNumber, storeId }: GenerateTrackingLinkProps) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const trackingUrl = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/track/${token}`
    : null

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/tracking-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string })) as { error?: string }
        setError(body?.error ?? 'Gagal membuat token')
        return
      }
      const json = await res.json() as { token: string }
      setToken(json.token)
    } catch {
      setError('Gagal membuat link pelacakan')
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    if (!trackingUrl) return
    navigator.clipboard.writeText(trackingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-2)]">Pelacakan Pesanan #{orderNumber}</p>
          <p className="text-xs text-[var(--text-3)]">Bagikan link ini ke pelanggan</p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
          {token ? 'Buat Ulang' : 'Buat Link'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {trackingUrl && (
        <div className="space-y-3 p-4 bg-[var(--bg-subtle)] rounded-xl border border-[var(--border)]">
          <QRCodeStub url={trackingUrl} />
          <button
            onClick={copy}
            className="w-full py-2 px-4 bg-[var(--bg-card)] border border-[var(--border-mid)] rounded-lg text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
          >
            {copied ? '✓ Disalin!' : 'Salin Link'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Dashboard tracking management page client ───────────────────────────────

interface TrackingOrder {
  id: string
  number: string
  status: string
  createdAt: string
  customerName: string | null
  total: number
}

interface OrderTrackingClientProps {
  storeId: string
  currency: string
}

export default function OrderTrackingClient({ storeId, currency }: OrderTrackingClientProps) {
  const [orders, setOrders] = useState<TrackingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<TrackingOrder | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/orders?limit=20&status=PENDING')
        if (res.ok) {
          const data = await res.json() as { data?: any[] } | any[]
          setOrders((Array.isArray(data) ? data : (data as { data?: any[] }).data ?? []) as any)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-1)]">Pelacakan Pesanan</h1>
        <p className="text-[var(--text-3)] text-sm mt-1">
          Buat link pelacakan untuk dibagikan ke pelanggan
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Order list */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="font-semibold text-[var(--text-1)] text-sm">Pesanan Aktif</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-3)]" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-3)] text-sm">
              Tidak ada pesanan aktif
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {orders.map((o) => (
                <li
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  className={cn(
                    'flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors',
                    selectedOrder?.id === o.id && 'bg-blue-50',
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text-1)]">#{o.number}</p>
                    <p className="text-xs text-[var(--text-3)]">{o.customerName ?? 'Tanpa nama'}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        o.status === 'PENDING' && 'bg-yellow-100 text-yellow-700',
                        o.status === 'PREPARING' && 'bg-blue-100 text-blue-700',
                        o.status === 'READY' && 'bg-green-100 text-green-700',
                        o.status === 'DELIVERED' && 'bg-[var(--bg-subtle)] text-[var(--text-2)]',
                        o.status === 'PAID' && 'bg-emerald-100 text-emerald-700',
                      )}
                    >
                      {o.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Generate link panel */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-sm p-5">
          {selectedOrder ? (
            <GenerateTrackingLink
              orderId={selectedOrder.id}
              orderNumber={selectedOrder.number}
              storeId={storeId}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-[var(--text-3)] text-sm gap-2">
              <QrCode className="w-10 h-10 text-gray-300" />
              <p>Pilih pesanan untuk membuat link pelacakan</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
