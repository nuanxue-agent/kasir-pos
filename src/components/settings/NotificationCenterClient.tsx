'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  BellOff,
  Plus,
  Trash2,
  CheckCheck,
  Package,
  ShoppingCart,
  MessageSquare,
  CreditCard,
  Gift,
  RefreshCw,
  Clock,
  Loader2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ──────────────────────────────────────────────────────────────────────

export type NotificationEvent =
  | 'LOW_STOCK'
  | 'NEW_ORDER'
  | 'COMPLAINT'
  | 'PAYMENT_DUE'
  | 'BIRTHDAY'
  | 'REORDER_NEEDED'
  | 'ATTENDANCE_LATE'

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'WHATSAPP'

export interface NotificationRule {
  id: string
  storeId: string
  event: NotificationEvent
  channel: NotificationChannel
  threshold: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface NotificationLog {
  id: string
  storeId: string
  ruleId: string | null
  event: string
  message: string
  channel: NotificationChannel
  status: 'SENT' | 'FAILED' | 'PENDING'
  read: boolean
  createdAt: string
}

interface NotificationCenterClientProps {
  storeId: string
}

// ── Config ─────────────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<
  NotificationEvent,
  { label: string; description: string; icon: React.ReactNode; color: string }
> = {
  LOW_STOCK: {
    label: 'Stok Rendah',
    description: 'Notifikasi saat stok produk di bawah ambang batas',
    icon: <Package size={16} />,
    color: 'text-orange-500',
  },
  NEW_ORDER: {
    label: 'Pesanan Baru',
    description: 'Notifikasi saat pesanan baru masuk',
    icon: <ShoppingCart size={16} />,
    color: 'text-blue-500',
  },
  COMPLAINT: {
    label: 'Komplain',
    description: 'Notifikasi saat ada komplain pelanggan',
    icon: <MessageSquare size={16} />,
    color: 'text-red-500',
  },
  PAYMENT_DUE: {
    label: 'Tagihan Jatuh Tempo',
    description: 'Notifikasi saat tagihan akan jatuh tempo',
    icon: <CreditCard size={16} />,
    color: 'text-yellow-500',
  },
  BIRTHDAY: {
    label: 'Ulang Tahun',
    description: 'Notifikasi ulang tahun pelanggan',
    icon: <Gift size={16} />,
    color: 'text-pink-500',
  },
  REORDER_NEEDED: {
    label: 'Perlu Reorder',
    description: 'Notifikasi saat produk perlu dipesan ulang',
    icon: <RefreshCw size={16} />,
    color: 'text-purple-500',
  },
  ATTENDANCE_LATE: {
    label: 'Keterlambatan',
    description: 'Notifikasi saat karyawan terlambat',
    icon: <Clock size={16} />,
    color: 'text-teal-500',
  },
}

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: 'In-App',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
}

const ALL_EVENTS: NotificationEvent[] = [
  'LOW_STOCK', 'NEW_ORDER', 'COMPLAINT', 'PAYMENT_DUE',
  'BIRTHDAY', 'REORDER_NEEDED', 'ATTENDANCE_LATE',
]

const ALL_CHANNELS: NotificationChannel[] = ['IN_APP', 'EMAIL', 'WHATSAPP']

// ── Unread bell count helper (exported for tests) ──────────────────────────────

export function calcUnreadCount(logs: NotificationLog[]): number {
  return logs.filter(l => !l.read && l.channel === 'IN_APP').length
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function NotificationCenterClient({ storeId }: NotificationCenterClientProps) {
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [logs, setLogs] = useState<NotificationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [activeTab, setActiveTab] = useState<'rules' | 'inbox'>('rules')

  // New rule form state
  const [newEvent, setNewEvent] = useState<NotificationEvent>('LOW_STOCK')
  const [newChannel, setNewChannel] = useState<NotificationChannel>('IN_APP')
  const [newThreshold, setNewThreshold] = useState(0)

  const fetchAll = useCallback(async () => {
    try {
      const [rulesRes, logsRes] = await Promise.all([
        fetch(`/api/notification-rules?storeId=${storeId}`),
        fetch(`/api/notifications?storeId=${storeId}`),
      ])
      const rulesData = (await rulesRes.json()) as any
      const logsData = (await logsRes.json()) as any
      if (!rulesData.error) setRules(rulesData)
      if (!logsData.error) setLogs(logsData)
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleAddRule = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/notification-rules?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: newEvent, channel: newChannel, threshold: newThreshold }),
      })
      const json = (await res.json()) as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Aturan notifikasi ditambahkan')
      setShowAddForm(false)
      setNewEvent('LOW_STOCK')
      setNewChannel('IN_APP')
      setNewThreshold(0)
      await fetchAll()
    } finally {
      setSaving(false)
    }
  }

  const handleToggleRule = async (rule: NotificationRule) => {
    try {
      const res = await fetch(`/api/notification-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !rule.active }),
      })
      const json = (await res.json()) as any
      if (json.error) { toast.error(json.error); return }
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r))
    } catch {
      toast.error('Gagal memperbarui aturan')
    }
  }

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch(`/api/notifications/mark-all-read?storeId=${storeId}`, {
        method: 'POST',
      })
      const json = (await res.json()) as any
      if (json.error) { toast.error(json.error); return }
      setLogs(prev => prev.map(l => ({ ...l, read: true })))
      toast.success('Semua notifikasi ditandai telah dibaca')
    } catch {
      toast.error('Gagal menandai semua notifikasi')
    }
  }

  const handleMarkOneRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
      setLogs(prev => prev.map(l => l.id === id ? { ...l, read: true } : l))
    } catch {
      // silently ignore
    }
  }

  const unreadCount = calcUnreadCount(logs)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[var(--text-3)]" size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell size={24} className="text-[var(--primary)]" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-1)]">Pusat Notifikasi</h1>
            <p className="text-sm text-[var(--text-3)]">
              Kelola aturan dan preferensi notifikasi toko Anda
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] p-1">
        {(['rules', 'inbox'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            {tab === 'rules' ? 'Aturan Notifikasi' : (
              <span className="flex items-center justify-center gap-1.5">
                Kotak Masuk
                {unreadCount > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-3)]">
              {rules.length} aturan dikonfigurasi
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <Plus size={16} />
              Tambah Aturan
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[var(--text-1)]">Aturan Baru</h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-[var(--text-3)] hover:text-[var(--text-1)]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">Event</label>
                  <select
                    value={newEvent}
                    onChange={e => setNewEvent(e.target.value as NotificationEvent)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                  >
                    {ALL_EVENTS.map(ev => (
                      <option key={ev} value={ev}>{EVENT_CONFIG[ev].label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">Kanal</label>
                  <select
                    value={newChannel}
                    onChange={e => setNewChannel(e.target.value as NotificationChannel)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                  >
                    {ALL_CHANNELS.map(ch => (
                      <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-2)]">
                    Ambang Batas {newEvent === 'LOW_STOCK' ? '(unit)' : newEvent === 'ATTENDANCE_LATE' ? '(menit)' : ''}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newThreshold}
                    onChange={e => setNewThreshold(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]"
                >
                  Batal
                </button>
                <button
                  onClick={handleAddRule}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Simpan
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] py-12 text-center">
              <BellOff size={32} className="mx-auto mb-3 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-3)]">Belum ada aturan notifikasi</p>
              <p className="mt-1 text-xs text-[var(--text-3)]">
                Tambahkan aturan untuk mulai menerima notifikasi otomatis
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map(rule => {
                const cfg = EVENT_CONFIG[rule.event as NotificationEvent]
                return (
                  <div
                    key={rule.id}
                    className={cn(
                      'flex items-center gap-4 rounded-xl border px-5 py-4 transition-colors',
                      rule.active
                        ? 'border-[var(--border)] bg-[var(--bg-card)]'
                        : 'border-[var(--border)] bg-[var(--bg-2)] opacity-60',
                    )}
                  >
                    <span className={cn('flex-shrink-0', cfg?.color ?? 'text-[var(--text-3)]')}>
                      {cfg?.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-1)]">
                          {cfg?.label ?? rule.event}
                        </span>
                        <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-xs text-[var(--text-3)]">
                          {CHANNEL_LABELS[rule.channel]}
                        </span>
                        {rule.threshold > 0 && (
                          <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-xs text-[var(--text-3)]">
                            ≤ {rule.threshold}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-3)] truncate">
                        {cfg?.description}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleRule(rule)}
                      className={cn(
                        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
                        rule.active ? 'bg-[var(--primary)]' : 'bg-[var(--border)]',
                      )}
                      aria-label={rule.active ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
                          rule.active ? 'translate-x-4' : 'translate-x-0',
                        )}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Inbox Tab */}
      {activeTab === 'inbox' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-3)]">
              {unreadCount} notifikasi belum dibaca
            </p>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 text-sm text-[var(--primary)] hover:underline"
              >
                <CheckCheck size={14} />
                Tandai semua dibaca
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] py-12 text-center">
              <Bell size={32} className="mx-auto mb-3 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-3)]">Tidak ada notifikasi</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map(log => {
                const cfg = EVENT_CONFIG[log.event as NotificationEvent]
                return (
                  <div
                    key={log.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
                      log.read
                        ? 'border-[var(--border)] bg-[var(--bg-card)]'
                        : 'border-[var(--primary)] bg-[var(--bg-card)] shadow-sm',
                    )}
                  >
                    {!log.read && (
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--primary)]" />
                    )}
                    <span
                      className={cn(
                        'mt-0.5 flex-shrink-0',
                        cfg?.color ?? 'text-[var(--text-3)]',
                        log.read && 'opacity-50',
                      )}
                    >
                      {cfg?.icon ?? <Bell size={16} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', log.read ? 'text-[var(--text-2)]' : 'font-medium text-[var(--text-1)]')}>
                        {log.message}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">
                        {new Date(log.createdAt).toLocaleString('id-ID', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {!log.read && (
                      <button
                        onClick={() => handleMarkOneRead(log.id)}
                        className="flex-shrink-0 text-[var(--text-3)] hover:text-[var(--text-1)]"
                        aria-label="Tandai dibaca"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
