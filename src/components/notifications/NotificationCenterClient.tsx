'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell,
  Package,
  ShoppingCart,
  CreditCard,
  Trophy,
  AlertCircle,
  CheckCheck,
  X,
  Filter,
  Settings2,
  Trash2,
  BellOff,
  BellRing,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  loadNotifications,
  saveNotifications,
  countUnread,
  markAllRead,
  formatTimeAgo,
  type AppNotification,
} from '@/components/ui/NotificationCenter'
import {
  subscribeToPush,
  unsubscribeFromPush,
  serializePushSubscription,
  VAPID_PUBLIC_KEY,
} from '@/lib/push-notifications'

// ── Extended notification types ────────────────────────────────────────────────

export type ExtendedNotificationType =
  'LOW_STOCK' | 'NEW_ORDER' | 'PAYMENT_RECEIVED' | 'GOAL_REACHED' | 'SYSTEM_ALERT'

export interface NotificationPreference {
  type: ExtendedNotificationType
  inApp: boolean
  push: boolean
  email: boolean
}

const DEFAULT_PREFERENCES: NotificationPreference[] = [
  { type: 'LOW_STOCK', inApp: true, push: true, email: false },
  { type: 'NEW_ORDER', inApp: true, push: true, email: false },
  { type: 'PAYMENT_RECEIVED', inApp: true, push: false, email: false },
  { type: 'GOAL_REACHED', inApp: true, push: true, email: true },
  { type: 'SYSTEM_ALERT', inApp: true, push: false, email: true },
]

const PREF_STORAGE_KEY = 'kasir_notification_prefs'

export function loadPreferences(): NotificationPreference[] {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const stored = JSON.parse(raw) as Partial<NotificationPreference>[]
    // Merge stored over defaults so new types always have a preference entry
    return mergePreferences(DEFAULT_PREFERENCES, stored as NotificationPreference[])
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function mergePreferences(
  defaults: NotificationPreference[],
  overrides: NotificationPreference[],
): NotificationPreference[] {
  const map = new Map(defaults.map(p => [p.type, { ...p }]))
  for (const o of overrides) {
    const existing = map.get(o.type)
    if (existing) {
      map.set(o.type, {
        ...existing,
        inApp: o.inApp ?? existing.inApp,
        push: o.push ?? existing.push,
        email: o.email ?? existing.email,
      })
    }
  }
  return Array.from(map.values())
}

export function savePreferences(prefs: NotificationPreference[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs))
}

// ── Type config ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  ExtendedNotificationType,
  { label: string; icon: React.ReactNode; dot: string; bg: string; iconColor: string }
> = {
  LOW_STOCK: {
    label: 'Stok Menipis',
    icon: <Package className="h-4 w-4" />,
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600',
  },
  NEW_ORDER: {
    label: 'Pesanan Baru',
    icon: <ShoppingCart className="h-4 w-4" />,
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600',
  },
  PAYMENT_RECEIVED: {
    label: 'Pembayaran',
    icon: <CreditCard className="h-4 w-4" />,
    dot: 'bg-sky-500',
    bg: 'bg-sky-50 dark:bg-sky-900/20',
    iconColor: 'text-sky-600',
  },
  GOAL_REACHED: {
    label: 'Target Tercapai',
    icon: <Trophy className="h-4 w-4" />,
    dot: 'bg-violet-500',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    iconColor: 'text-violet-600',
  },
  SYSTEM_ALERT: {
    label: 'Sistem',
    icon: <AlertCircle className="h-4 w-4" />,
    dot: 'bg-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-600',
  },
}

const ALL_TYPES = Object.keys(TYPE_CONFIG) as ExtendedNotificationType[]

// Map legacy types from the old NotificationCenter to extended types
function normalizeType(type: string): ExtendedNotificationType {
  if (type === 'SYSTEM') return 'SYSTEM_ALERT'
  if (type === 'SHIFT_REMINDER') return 'SYSTEM_ALERT'
  if ((ALL_TYPES as string[]).includes(type)) return type as ExtendedNotificationType
  return 'SYSTEM_ALERT'
}

// ── Push permission helpers ────────────────────────────────────────────────────

function usePushState() {
  const [permState, setPermState] = useState<'default' | 'granted' | 'denied'>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setPermState(Notification.permission as 'default' | 'granted' | 'denied')

    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.getSubscription().then(sub => setIsSubscribed(!!sub)),
      )
    }
  }, [])

  const enable = useCallback(async (storeId?: string) => {
    setIsLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermState(perm as 'default' | 'granted' | 'denied')
      if (perm !== 'granted') return false

      const sub = await subscribeToPush()
      if (!sub) return false

      const payload = serializePushSubscription(sub)
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: payload, storeId }),
      })
      setIsSubscribed(true)
      return true
    } catch {
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setIsLoading(true)
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await fetch('/api/notifications/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
        }
      }
      await unsubscribeFromPush()
      setIsSubscribed(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { permState, isSubscribed, isLoading, enable, disable }
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface NotificationCenterClientProps {
  storeId?: string
}

// ── Component ──────────────────────────────────────────────────────────────────

export function NotificationCenterClient({ storeId }: NotificationCenterClientProps) {
  const [activeTab, setActiveTab] = useState<ExtendedNotificationType | 'ALL'>('ALL')
  const [showPrefs, setShowPrefs] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [preferences, setPreferences] = useState<NotificationPreference[]>(DEFAULT_PREFERENCES)
  const push = usePushState()
  const prefsPanelRef = useRef<HTMLDivElement>(null)

  // Load from storage on mount
  useEffect(() => {
    setNotifications(loadNotifications())
    setPreferences(loadPreferences())
  }, [])

  const allNormalized = notifications.map(n => ({
    ...n,
    type: normalizeType(n.type) as AppNotification['type'],
  }))

  const filtered =
    activeTab === 'ALL'
      ? allNormalized
      : allNormalized.filter(n => normalizeType(n.type) === activeTab)

  const unreadCount = countUnread(allNormalized)

  const handleMarkAllRead = useCallback(() => {
    setNotifications(prev => {
      const updated = markAllRead(prev)
      saveNotifications(updated)
      return updated
    })
  }, [])

  const handleDelete = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id)
      saveNotifications(updated)
      return updated
    })
  }, [])

  const handlePrefToggle = useCallback(
    (type: ExtendedNotificationType, channel: 'inApp' | 'push' | 'email') => {
      setPreferences(prev => {
        const updated = prev.map(p => (p.type === type ? { ...p, [channel]: !p[channel] } : p))
        savePreferences(updated)
        return updated
      })
    },
    [],
  )

  const tabCounts = ALL_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = allNormalized.filter(n => normalizeType(n.type) === t && !n.read).length
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-1)]">Pusat Notifikasi</h1>
            <p className="text-xs text-[var(--text-3)]">
              {unreadCount > 0 ? `${unreadCount} belum dibaca` : 'Semua sudah dibaca'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tandai semua dibaca
            </button>
          )}
          <button
            onClick={() => setShowPrefs(v => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              showPrefs
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)]',
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Preferensi
          </button>
        </div>
      </div>

      {/* ── Preferences Panel ── */}
      {showPrefs && (
        <div
          ref={prefsPanelRef}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Pengaturan Notifikasi</h2>
            <button
              onClick={() => setShowPrefs(false)}
              className="rounded-md p-1 text-[var(--text-3)] hover:bg-[var(--bg-subtle)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Push enable/disable */}
          <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
            <div className="flex items-center gap-2">
              {push.isSubscribed ? (
                <BellRing className="h-4 w-4 text-emerald-600" />
              ) : (
                <BellOff className="h-4 w-4 text-[var(--text-3)]" />
              )}
              <div>
                <p className="text-xs font-medium text-[var(--text-1)]">Push Notifications</p>
                <p className="text-[10px] text-[var(--text-3)]">
                  {push.isSubscribed
                    ? 'Aktif — notifikasi dikirim ke perangkat ini'
                    : push.permState === 'denied'
                      ? 'Diblokir — izinkan di pengaturan browser'
                      : 'Nonaktif — aktifkan untuk menerima pemberitahuan'}
                </p>
              </div>
            </div>
            {push.permState !== 'denied' && (
              <button
                onClick={() => (push.isSubscribed ? push.disable() : push.enable(storeId))}
                disabled={push.isLoading}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  push.isSubscribed
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-amber-500 text-white hover:bg-amber-600',
                )}
              >
                {push.isLoading ? '...' : push.isSubscribed ? 'Nonaktifkan' : 'Aktifkan Push'}
              </button>
            )}
          </div>

          {/* Per-type preferences table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="pb-2 text-left font-medium text-[var(--text-3)]">Tipe</th>
                  <th className="pb-2 text-center font-medium text-[var(--text-3)]">In-App</th>
                  <th className="pb-2 text-center font-medium text-[var(--text-3)]">Push</th>
                  <th className="pb-2 text-center font-medium text-[var(--text-3)]">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {preferences.map(pref => {
                  const cfg = TYPE_CONFIG[pref.type]
                  return (
                    <tr key={pref.type}>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-md',
                              cfg.bg,
                            )}
                          >
                            <span className={cfg.iconColor}>{cfg.icon}</span>
                          </span>
                          <span className="text-[var(--text-2)]">{cfg.label}</span>
                        </div>
                      </td>
                      {(['inApp', 'push', 'email'] as const).map(channel => (
                        <td key={channel} className="py-2.5 text-center">
                          <button
                            onClick={() => handlePrefToggle(pref.type, channel)}
                            className={cn(
                              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                              pref[channel] ? 'bg-amber-500' : 'bg-[var(--border-mid)]',
                            )}
                            role="switch"
                            aria-checked={pref[channel]}
                            aria-label={`${channel} for ${pref.type}`}
                          >
                            <span
                              className={cn(
                                'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                                pref[channel] ? 'translate-x-4' : 'translate-x-0.5',
                              )}
                            />
                          </button>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Filter Tabs ── */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
        <button
          onClick={() => setActiveTab('ALL')}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'ALL'
              ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
              : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
          )}
        >
          <Filter className="h-3 w-3" />
          Semua
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-500 px-1 py-0.5 text-[9px] leading-none text-white">
              {unreadCount}
            </span>
          )}
        </button>
        {ALL_TYPES.map(type => {
          const cfg = TYPE_CONFIG[type]
          const count = tabCounts[type] ?? 0
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === type
                  ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                  : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
              )}
            >
              <span className={cfg.iconColor}>{cfg.icon}</span>
              <span className="hidden sm:inline">{cfg.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1 py-0.5 text-[9px] leading-none text-white',
                    cfg.dot,
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Notification List ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Bell className="h-10 w-10 text-[var(--border-mid)]" />
            <p className="text-sm font-medium text-[var(--text-2)]">
              {activeTab === 'ALL'
                ? 'Belum ada notifikasi'
                : `Tidak ada notifikasi ${TYPE_CONFIG[activeTab as ExtendedNotificationType]?.label ?? ''}`}
            </p>
            <p className="text-xs text-[var(--text-3)]">
              Notifikasi akan muncul di sini saat ada aktivitas
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filtered.map((notif, i) => {
              const type = normalizeType(notif.type)
              const cfg = TYPE_CONFIG[type]
              return (
                <div
                  key={notif.id}
                  className={cn(
                    'group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--bg-subtle)]',
                    i === 0 && 'rounded-t-xl',
                    i === filtered.length - 1 && 'rounded-b-xl',
                    !notif.read && 'bg-amber-50/30 dark:bg-amber-900/5',
                  )}
                >
                  {/* Type icon */}
                  <div
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      cfg.bg,
                    )}
                  >
                    <span className={cfg.iconColor}>{cfg.icon}</span>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-[var(--text-1)]">
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cfg.dot)} />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-2)]">{notif.message}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                          cfg.bg,
                          cfg.iconColor,
                        )}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-[var(--text-3)]">
                        {formatTimeAgo(notif.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(notif.id)}
                    className="mt-0.5 shrink-0 rounded-md p-1.5 text-[var(--text-3)] opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                    aria-label="Hapus notifikasi"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
