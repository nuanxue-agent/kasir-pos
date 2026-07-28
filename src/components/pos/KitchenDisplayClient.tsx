'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChefHat, RefreshCw, Clock, AlertTriangle, Loader2, CheckCircle2, PlayCircle, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type KitchenOrder,
  type KitchenOrderStatus,
  groupByStatus,
  isOverdue,
  elapsedMinutes,
  nextStatus,
} from '@/lib/kitchen-display'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  KitchenOrderStatus,
  { label: string; bg: string; border: string; badge: string; btnLabel: string; btnCls: string }
> = {
  NEW: {
    label: 'Baru',
    bg: 'bg-slate-500/5',
    border: 'border-slate-400/30',
    badge: 'bg-slate-500/15 text-slate-600',
    btnLabel: 'Mulai Proses',
    btnCls: 'bg-amber-500 text-white hover:bg-amber-600',
  },
  PREPARING: {
    label: 'Diproses',
    bg: 'bg-amber-500/5',
    border: 'border-amber-400/40',
    badge: 'bg-amber-500/15 text-amber-700',
    btnLabel: 'Tandai Siap',
    btnCls: 'bg-emerald-500 text-white hover:bg-emerald-600',
  },
  READY: {
    label: 'Siap',
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-400/40',
    badge: 'bg-emerald-500/15 text-emerald-700',
    btnLabel: 'Tandai Tersaji',
    btnCls: 'bg-blue-500 text-white hover:bg-blue-600',
  },
  SERVED: {
    label: 'Tersaji',
    bg: 'bg-blue-500/5',
    border: 'border-blue-400/30',
    badge: 'bg-blue-500/15 text-blue-700',
    btnLabel: '',
    btnCls: '',
  },
}

const LANE_ORDER: KitchenOrderStatus[] = ['NEW', 'PREPARING', 'READY', 'SERVED']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(createdAt: string): string {
  const mins = elapsedMinutes(createdAt)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${Math.floor(mins)}m`
  return `${Math.floor(mins / 60)}j ${Math.floor(mins % 60)}m`
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onAction,
  acting,
}: {
  order: KitchenOrder
  onAction: (order: KitchenOrder, to: KitchenOrderStatus) => void
  acting: boolean
}) {
  const cfg = STATUS_CONFIG[order.status]
  const next = nextStatus(order.status)
  const overdue = isOverdue(order)

  return (
    <article
      className={cn(
        'rounded-xl border-2 p-4 space-y-3 transition-colors',
        overdue ? 'border-red-500/60 bg-red-500/8' : `${cfg.border} ${cfg.bg}`,
      )}
      aria-label={`Pesanan ${order.orderNumber}${order.tableNumber ? `, meja ${order.tableNumber}` : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[var(--text-1)] leading-tight">{order.orderNumber}</p>
          {order.tableNumber != null && (
            <p className="text-xs text-[var(--text-3)] flex items-center gap-1 mt-0.5">
              <UtensilsCrossed className="h-3 w-3" aria-hidden="true" />
              Meja {order.tableNumber}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', cfg.badge)}>
            {cfg.label}
          </span>
          {order.priority > 0 && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-600">
              P{order.priority}
            </span>
          )}
        </div>
      </div>

      {/* Elapsed */}
      <div className={cn('flex items-center gap-1 text-xs', overdue ? 'text-red-500 font-semibold' : 'text-[var(--text-3)]')}>
        {overdue ? (
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Clock className="h-3 w-3" aria-hidden="true" />
        )}
        <span>{formatElapsed(order.createdAt)}</span>
        {overdue && <span>— terlambat!</span>}
      </div>

      {/* Items */}
      <ul className="space-y-1" aria-label="Item pesanan">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="min-w-[22px] font-bold text-[var(--text-1)]">{item.qty}×</span>
            <div className="min-w-0">
              <span className="text-[var(--text-1)]">{item.name}</span>
              {item.category && (
                <span className="ml-1.5 text-[10px] text-[var(--text-4)] font-medium uppercase tracking-wide">
                  {item.category}
                </span>
              )}
              {item.note && (
                <p className="text-[10px] italic text-amber-600 mt-0.5">{item.note}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Action */}
      {next && (
        <button
          onClick={() => onAction(order, next)}
          disabled={acting}
          className={cn(
            'w-full rounded-lg py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50',
            cfg.btnCls,
          )}
        >
          {acting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : order.status === 'NEW' ? (
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {acting ? 'Memperbarui…' : cfg.btnLabel}
        </button>
      )}
    </article>
  )
}

// ─── Lane column ──────────────────────────────────────────────────────────────

function LaneColumn({
  status,
  orders,
  onAction,
  actingId,
}: {
  status: KitchenOrderStatus
  orders: KitchenOrder[]
  onAction: (order: KitchenOrder, to: KitchenOrderStatus) => void
  actingId: string | null
}) {
  const cfg = STATUS_CONFIG[status]

  return (
    <section
      className="flex flex-col gap-3 min-w-0"
      aria-label={`Lane ${cfg.label}`}
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-[var(--text-2)]">{cfg.label}</h2>
        <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--text-3)]">
          {orders.length}
        </span>
      </div>
      <div className="space-y-3">
        {orders.map(o => (
          <OrderCard
            key={o.id}
            order={o}
            onAction={onAction}
            acting={actingId === o.id}
          />
        ))}
        {orders.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-6 text-center">
            <p className="text-xs text-[var(--text-4)]">Tidak ada pesanan</p>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface KitchenDisplayClientProps {
  storeId: string
}

export default function KitchenDisplayClient({ storeId }: KitchenDisplayClientProps) {
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [error, setError] = useState('')

  const fetchOrders = useCallback(async () => {
    if (!storeId) return
    setError('')
    try {
      const res = await fetch(`/api/kitchen/orders?storeId=${storeId}`)
      if (!res.ok) throw new Error('Gagal memuat pesanan dapur')
      const data = await res.json() as KitchenOrder[]
      setOrders(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e.message ?? 'Error')
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }, [storeId])

  // Initial load + auto-refresh every 10s
  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 10_000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  const handleAction = useCallback(async (order: KitchenOrder, to: KitchenOrderStatus) => {
    setActingId(order.id)
    try {
      const res = await fetch(`/api/kitchen/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to, storeId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Gagal memperbarui status')
      }
      const now = new Date().toISOString()
      setOrders(prev =>
        prev.map(o => {
          if (o.id !== order.id) return o
          return {
            ...o,
            status: to,
            updatedAt: now,
            startedAt: to === 'PREPARING' ? now : o.startedAt,
            readyAt: to === 'READY' ? now : o.readyAt,
            servedAt: to === 'SERVED' ? now : o.servedAt,
          }
        }),
      )
    } catch (e: any) {
      setError(e.message ?? 'Error')
    } finally {
      setActingId(null)
    }
  }, [storeId])

  const grouped = groupByStatus(orders)
  const totalActive = grouped.NEW.length + grouped.PREPARING.length + grouped.READY.length

  return (
    <div className="flex h-full flex-col bg-[var(--bg-page)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
        <div className="flex items-center gap-3">
          <ChefHat className="h-5 w-5 text-amber-500" aria-hidden="true" />
          <div>
            <h1 className="text-base font-semibold text-[var(--text-1)]">Kitchen Display System</h1>
            <p className="text-xs text-[var(--text-3)]">
              {totalActive} aktif · refresh otomatis 10d · terakhir:{' '}
              {lastRefresh.toLocaleTimeString('id-ID')}
            </p>
          </div>
        </div>
        <button
          onClick={fetchOrders}
          disabled={loading}
          aria-label="Refresh pesanan dapur"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)] disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {/* Lanes */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" aria-label="Memuat…" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {LANE_ORDER.map(status => (
              <LaneColumn
                key={status}
                status={status}
                orders={grouped[status]}
                onAction={handleAction}
                actingId={actingId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
