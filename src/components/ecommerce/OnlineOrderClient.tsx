'use client'

import { useEffect, useState, useCallback } from 'react'
import { useCurrentStore } from '@/context/StoreContext'
import {
  ShoppingCart,
  RefreshCw,
  Settings,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  Zap,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type OnlineChannel = 'WOOCOMMERCE' | 'TOKOPEDIA' | 'SHOPEE' | 'DIRECT'
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'FAILED'

export interface OrderItem {
  sku: string
  name: string
  qty: number
  price: number
}

export interface OnlineOrder {
  id: string
  storeId: string
  channel: OnlineChannel
  externalId: string
  customerName: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  createdAt: string
}

export interface ChannelConfig {
  id: string
  storeId: string
  channel: OnlineChannel
  apiKey: string | null
  storeUrl: string | null
  active: boolean
  lastSyncAt: string | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

export const CHANNELS: OnlineChannel[] = ['WOOCOMMERCE', 'TOKOPEDIA', 'SHOPEE', 'DIRECT']

export const CHANNEL_LABEL: Record<OnlineChannel, string> = {
  WOOCOMMERCE: 'WooCommerce',
  TOKOPEDIA: 'Tokopedia',
  SHOPEE: 'Shopee',
  DIRECT: 'Langsung',
}

export const CHANNEL_COLOR: Record<OnlineChannel, string> = {
  WOOCOMMERCE: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  TOKOPEDIA: 'bg-green-500/20 text-green-400 border-green-500/40',
  SHOPEE: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  DIRECT: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Menunggu',
  CONFIRMED: 'Dikonfirmasi',
  PROCESSING: 'Diproses',
  SHIPPED: 'Dikirim',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  REFUNDED: 'Dikembalikan',
  FAILED: 'Gagal',
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-500/20 text-amber-400',
  CONFIRMED: 'bg-blue-500/20 text-blue-400',
  PROCESSING: 'bg-violet-500/20 text-violet-400',
  SHIPPED: 'bg-cyan-500/20 text-cyan-400',
  COMPLETED: 'bg-emerald-500/20 text-emerald-400',
  CANCELLED: 'bg-red-500/20 text-red-400',
  REFUNDED: 'bg-rose-500/20 text-rose-400',
  FAILED: 'bg-red-500/20 text-red-400',
}

// ─── Pure helpers (exported for tests) ─────────────────────────────────────────

export function calcOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, i) => sum + i.qty * i.price, 0)
}

export function deduplicateOrders(
  existing: OnlineOrder[],
  incoming: OnlineOrder[],
): OnlineOrder[] {
  const seen = new Set(existing.map(o => `${o.channel}:${o.externalId}`))
  return incoming.filter(o => !seen.has(`${o.channel}:${o.externalId}`))
}

export function parseOrderItems(raw: string): OrderItem[] {
  try {
    return JSON.parse(raw) as OrderItem[]
  } catch {
    return []
  }
}

// ─── Settings Modal ─────────────────────────────────────────────────────────────

function SettingsModal({
  storeId,
  configs,
  onClose,
  onSaved,
}: {
  storeId: string
  configs: ChannelConfig[]
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState<OnlineChannel | null>(null)
  const [form, setForm] = useState<
    Record<OnlineChannel, { apiKey: string; storeUrl: string; active: boolean }>
  >(() => {
    const init = {} as Record<OnlineChannel, { apiKey: string; storeUrl: string; active: boolean }>
    for (const ch of CHANNELS) {
      const cfg = configs.find(c => c.channel === ch)
      init[ch] = {
        apiKey: cfg?.apiKey ?? '',
        storeUrl: cfg?.storeUrl ?? '',
        active: cfg?.active ?? false,
      }
    }
    return init
  })

  async function saveChannel(ch: OnlineChannel) {
    setSaving(ch)
    try {
      await fetch('/api/ecommerce/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          channel: ch,
          apiKey: form[ch].apiKey || null,
          storeUrl: form[ch].storeUrl || null,
          active: form[ch].active,
        }),
      })
      onSaved()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan channel"
    >
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text-1)]">Pengaturan Channel</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
          >
            Tutup
          </button>
        </div>

        {CHANNELS.map(ch => (
          <div key={ch} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', CHANNEL_COLOR[ch])}>
                {CHANNEL_LABEL[ch]}
              </span>
              <label className="flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[ch].active}
                  onChange={e => setForm(f => ({ ...f, [ch]: { ...f[ch], active: e.target.checked } }))}
                  className="accent-blue-500"
                />
                Aktif
              </label>
            </div>

            {ch !== 'DIRECT' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">API Key</label>
                  <input
                    type="text"
                    value={form[ch].apiKey}
                    onChange={e => setForm(f => ({ ...f, [ch]: { ...f[ch], apiKey: e.target.value } }))}
                    placeholder={`API Key ${CHANNEL_LABEL[ch]}`}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">Store URL</label>
                  <input
                    type="text"
                    value={form[ch].storeUrl}
                    onChange={e => setForm(f => ({ ...f, [ch]: { ...f[ch], storeUrl: e.target.value } }))}
                    placeholder="https://toko.example.com"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <button
              onClick={() => saveChannel(ch)}
              disabled={saving === ch}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving === ch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving === ch ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Order Card ─────────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: OnlineOrder }) {
  const items = typeof order.items === 'string' ? parseOrderItems(order.items as unknown as string) : order.items

  return (
    <article
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-2.5"
      aria-label={`Pesanan ${order.externalId}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', CHANNEL_COLOR[order.channel])}>
            {CHANNEL_LABEL[order.channel]}
          </span>
          <span className="text-xs font-mono text-[var(--text-3)]">#{order.externalId.slice(-8)}</span>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_BADGE[order.status])}>
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <p className="text-sm font-medium text-[var(--text-1)]">{order.customerName}</p>

      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between text-xs text-[var(--text-2)]">
            <span className="truncate max-w-[60%]">{item.name}</span>
            <span>
              {item.qty}× Rp{item.price.toLocaleString('id-ID')}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
        <span className="text-xs text-[var(--text-3)]">
          {new Date(order.createdAt).toLocaleDateString('id-ID')}
        </span>
        <span className="text-sm font-bold text-[var(--text-1)]">
          Rp{order.total.toLocaleString('id-ID')}
        </span>
      </div>
    </article>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function OnlineOrderClient() {
  const currentStore = useCurrentStore()
  const storeId = currentStore?.id ?? ''

  const [orders, setOrders] = useState<OnlineOrder[]>([])
  const [configs, setConfigs] = useState<ChannelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<OnlineChannel | null>(null)
  const [tab, setTab] = useState<'orders' | 'settings'>('orders')
  const [filterChannel, setFilterChannel] = useState<OnlineChannel | 'ALL'>('ALL')
  const [showSettings, setShowSettings] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!storeId) return
    try {
      const [ordersRes, configsRes] = await Promise.all([
        fetch(`/api/ecommerce/orders?storeId=${storeId}`),
        fetch(`/api/ecommerce/channels?storeId=${storeId}`),
      ])
      const ordersData = await ordersRes.json() as { data?: OnlineOrder[] } | OnlineOrder[]
      const configsData = await configsRes.json() as ChannelConfig[]

      const orderList = Array.isArray(ordersData) ? ordersData : (ordersData as any).data ?? []
      setOrders(orderList)
      if (Array.isArray(configsData)) setConfigs(configsData)
    } catch {
      // silently retry
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function syncChannel(channel: OnlineChannel) {
    setSyncing(channel)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/ecommerce/sync/${channel}?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { imported?: number; skipped?: number }
      setSyncResult(
        `${CHANNEL_LABEL[channel]}: ${data.imported ?? 0} pesanan baru, ${data.skipped ?? 0} sudah ada`,
      )
      await fetchAll()
    } finally {
      setSyncing(null)
    }
  }

  const displayed = filterChannel === 'ALL'
    ? orders
    : orders.filter(o => o.channel === filterChannel)

  const channelCounts = CHANNELS.reduce<Record<string, number>>((acc, ch) => {
    acc[ch] = orders.filter(o => o.channel === ch).length
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-7 w-7 text-blue-500" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold text-[var(--text-1)]">E-Commerce</h1>
            <p className="text-xs text-[var(--text-3)]">
              Kelola pesanan dari semua channel online
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
            aria-label="Pengaturan channel"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Pengaturan
          </button>
          <button
            onClick={fetchAll}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {syncResult}
        </div>
      )}

      {/* Channel summary + sync buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CHANNELS.map(ch => {
          const cfg = configs.find(c => c.channel === ch)
          return (
            <div
              key={ch}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', CHANNEL_COLOR[ch])}>
                  {CHANNEL_LABEL[ch]}
                </span>
                {cfg?.active ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-label="Aktif" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-[var(--text-3)]" aria-label="Nonaktif" />
                )}
              </div>

              <p className="text-2xl font-bold text-[var(--text-1)]">{channelCounts[ch] ?? 0}</p>
              <p className="text-xs text-[var(--text-3)]">pesanan</p>

              {cfg?.lastSyncAt && (
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-3)]">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {new Date(cfg.lastSyncAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}

              <button
                onClick={() => syncChannel(ch)}
                disabled={syncing !== null}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] py-1.5 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text-1)] disabled:opacity-50 transition-colors"
                aria-label={`Sync ${CHANNEL_LABEL[ch]}`}
              >
                {syncing === ch ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {syncing === ch ? 'Sinkronisasi…' : 'Sync Orders'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-1 w-fit">
        {(['ALL', ...CHANNELS] as const).map(ch => (
          <button
            key={ch}
            onClick={() => setFilterChannel(ch)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              filterChannel === ch
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            {ch === 'ALL' ? 'Semua' : CHANNEL_LABEL[ch]}
            {ch !== 'ALL' && (
              <span className="ml-1.5 text-[10px] opacity-60">{channelCounts[ch] ?? 0}</span>
            )}
          </button>
        ))}
      </div>

      {/* Orders grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--text-3)]" aria-label="Memuat…" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-3)]">
          <Globe className="h-12 w-12 opacity-30" aria-hidden="true" />
          <p className="text-sm">Belum ada pesanan online</p>
          <p className="text-xs">Tekan &quot;Sync Orders&quot; untuk mengambil pesanan dari channel</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map(order => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          storeId={storeId}
          configs={configs}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false)
            fetchAll()
          }}
        />
      )}
    </div>
  )
}
