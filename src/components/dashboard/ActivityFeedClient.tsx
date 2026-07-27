'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ShoppingCart,
  Package,
  Users,
  LogIn,
  Clock,
  RefreshCw,
  Activity,
  ArrowRight,
  UserPlus,
  TrendingDown,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ActivityEvent {
  id: string
  action: string
  resource: string | null
  userId: string
  userName: string | null
  createdAt: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function formatTimeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  if (isNaN(diffMs) || diffMs < 0) return 'baru saja'

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}d lalu`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}j lalu`
  const days = Math.floor(hours / 24)
  return `${days}h lalu`
}

export function getEventIcon(action: string): React.ReactNode {
  const a = action?.toUpperCase() ?? ''
  if (a.startsWith('ORDER')) return <ShoppingCart className="h-3.5 w-3.5" />
  if (a.startsWith('STOCK') || a === 'STOCK_ADJUST') return <TrendingDown className="h-3.5 w-3.5" />
  if (a === 'CUSTOMER_CREATE') return <UserPlus className="h-3.5 w-3.5" />
  if (a.startsWith('CUSTOMER')) return <Users className="h-3.5 w-3.5" />
  if (a === 'SHIFT_OPEN') return <Clock className="h-3.5 w-3.5" />
  if (a === 'SHIFT_CLOSE') return <Clock className="h-3.5 w-3.5" />
  if (a === 'LOGIN' || a === 'LOGOUT') return <LogIn className="h-3.5 w-3.5" />
  if (a.startsWith('PRODUCT')) return <Package className="h-3.5 w-3.5" />
  return <Activity className="h-3.5 w-3.5" />
}

export function getEventIconBg(action: string): string {
  const a = action?.toUpperCase() ?? ''
  if (a.startsWith('ORDER')) return 'bg-blue-50 text-blue-500'
  if (a.startsWith('STOCK') || a === 'STOCK_ADJUST') return 'bg-amber-50 text-amber-500'
  if (a.startsWith('CUSTOMER')) return 'bg-emerald-50 text-emerald-500'
  if (a === 'SHIFT_OPEN') return 'bg-violet-50 text-violet-500'
  if (a === 'SHIFT_CLOSE') return 'bg-rose-50 text-rose-500'
  if (a === 'LOGIN' || a === 'LOGOUT') return 'bg-sky-50 text-sky-500'
  if (a.startsWith('PRODUCT')) return 'bg-orange-50 text-orange-500'
  return 'bg-stone-100 text-stone-500'
}

export function getEventDescription(action: string, resource: string | null): string {
  const a = action?.toUpperCase() ?? ''
  const res = resource ? ` — ${resource}` : ''
  switch (a) {
    case 'ORDER_CREATE': return `Pesanan baru${res}`
    case 'ORDER_REFUND': return `Refund pesanan${res}`
    case 'ORDER_VOID': return `Pesanan dibatalkan${res}`
    case 'STOCK_ADJUST': return `Penyesuaian stok${res}`
    case 'CUSTOMER_CREATE': return `Pelanggan baru${res}`
    case 'CUSTOMER_UPDATE': return `Data pelanggan diperbarui${res}`
    case 'SHIFT_OPEN': return 'Shift dibuka'
    case 'SHIFT_CLOSE': return 'Shift ditutup'
    case 'LOGIN': return `Login${res}`
    case 'LOGOUT': return `Logout${res}`
    case 'PRODUCT_CREATE': return `Produk baru${res}`
    case 'PRODUCT_UPDATE': return `Produk diperbarui${res}`
    case 'PRODUCT_DELETE': return `Produk dihapus${res}`
    default: return action.replace(/_/g, ' ').toLowerCase()
  }
}

/**
 * Deduplicate events: if consecutive events share the same userId + action
 * within a 5-second window, only keep the first.
 */
export function deduplicateEvents(events: ActivityEvent[]): ActivityEvent[] {
  const seen = new Map<string, number>()
  return events.filter(ev => {
    const key = `${ev.userId}:${ev.action}`
    const t = new Date(ev.createdAt).getTime()
    const last = seen.get(key)
    if (last !== undefined && Math.abs(t - last) < 5000) return false
    seen.set(key, t)
    return true
  })
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface ActivityFeedClientProps {
  storeId: string
}

export default function ActivityFeedClient({ storeId }: ActivityFeedClientProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchEvents = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      else setRefreshing(true)
      try {
        const res = await fetch(`/api/activity?storeId=${storeId}&limit=20`)
        if (!res.ok) return
        const data: ActivityEvent[] = await res.json()
        setEvents(deduplicateEvents(data))
        setLastRefresh(new Date())
      } catch {
        // swallow – stale data is fine
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [storeId],
  )

  // Initial load
  useEffect(() => {
    fetchEvents(false)
  }, [fetchEvents])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => fetchEvents(true), 60_000)
    return () => clearInterval(id)
  }, [fetchEvents])

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
          <Activity className="h-3.5 w-3.5 text-amber-500" />
          Aktivitas Terbaru
          {refreshing && (
            <RefreshCw className="h-3 w-3 animate-spin text-[var(--text-3)]" />
          )}
        </h2>
        <Link
          href="/dashboard/audit"
          className="flex items-center gap-1 text-xs font-medium text-amber-600 transition-colors hover:text-amber-700"
        >
          Lihat semua <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-2 p-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-[var(--bg-subtle)]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--bg-subtle)]" />
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-[var(--bg-subtle)]" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <Activity className="h-7 w-7 text-stone-200" />
          <p className="text-xs text-[var(--text-3)]">Belum ada aktivitas</p>
        </div>
      ) : (
        <div className="divide-y divide-stone-50">
          {events.map(ev => (
            <div
              key={ev.id}
              className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-subtle)]"
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${getEventIconBg(ev.action)}`}
              >
                {getEventIcon(ev.action)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--text-1)]">
                  {getEventDescription(ev.action, ev.resource)}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--text-3)]">
                  {ev.userName ?? 'System'} · {formatTimeAgo(ev.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {lastRefresh && (
        <div className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-3)]">
          Diperbarui {formatTimeAgo(lastRefresh.toISOString())} · auto-refresh tiap 60d
        </div>
      )}
    </div>
  )
}
