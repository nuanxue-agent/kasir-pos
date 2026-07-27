'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bell,
  Package,
  ShoppingCart,
  Clock,
  Settings,
  X,
  CheckCheck,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type NotificationType = 'LOW_STOCK' | 'NEW_ORDER' | 'SHIFT_REMINDER' | 'SYSTEM'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string // ISO string
  read: boolean
}

const STORAGE_KEY = 'kasir_notifications'
const MAX_NOTIFICATIONS = 50

// ── helpers ────────────────────────────────────────────────────────────────

export function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'Baru saja'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} menit lalu`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} jam lalu`
  const days = Math.floor(hrs / 24)
  return `${days} hari lalu`
}

export function loadNotifications(): AppNotification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AppNotification[]) : []
  } catch {
    return []
  }
}

export function saveNotifications(notifications: AppNotification[]): void {
  if (typeof window === 'undefined') return
  // keep latest MAX_NOTIFICATIONS
  const trimmed = notifications.slice(0, MAX_NOTIFICATIONS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
}

export function countUnread(notifications: AppNotification[]): number {
  return notifications.filter(n => !n.read).length
}

export function markAllRead(notifications: AppNotification[]): AppNotification[] {
  return notifications.map(n => ({ ...n, read: true }))
}

export function buildLowStockNotification(productName: string, stock: number): AppNotification {
  return {
    id: `low-stock-${productName}-${Date.now()}`,
    type: 'LOW_STOCK',
    title: 'Stok Menipis',
    message: `${productName} tersisa ${stock} unit`,
    createdAt: new Date().toISOString(),
    read: false,
  }
}

export function addNotificationIfNew(
  existing: AppNotification[],
  candidate: AppNotification,
): AppNotification[] {
  // De-dupe by id
  if (existing.some(n => n.id === candidate.id)) return existing
  return [candidate, ...existing]
}

// ── type config ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: React.ReactNode; dot: string; bg: string; iconColor: string }
> = {
  LOW_STOCK: {
    icon: <AlertTriangle className="h-4 w-4" />,
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    iconColor: 'text-amber-600',
  },
  NEW_ORDER: {
    icon: <ShoppingCart className="h-4 w-4" />,
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  SHIFT_REMINDER: {
    icon: <Clock className="h-4 w-4" />,
    dot: 'bg-sky-500',
    bg: 'bg-sky-50',
    iconColor: 'text-sky-600',
  },
  SYSTEM: {
    icon: <Settings className="h-4 w-4" />,
    dot: 'bg-stone-400',
    bg: 'bg-stone-100',
    iconColor: 'text-stone-500',
  },
}

// ── click-outside hook ─────────────────────────────────────────────────────

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}

// ── props ──────────────────────────────────────────────────────────────────

interface NotificationCenterProps {
  /** Optionally seed low-stock items for auto-notification generation */
  lowStockProducts?: Array<{ id: string; name: string; stock: number }>
}

// ── component ──────────────────────────────────────────────────────────────

export function NotificationCenter({ lowStockProducts }: NotificationCenterProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  useClickOutside(panelRef, () => setOpen(false))

  // Load from localStorage on mount
  useEffect(() => {
    setNotifications(loadNotifications())
  }, [])

  // Auto-generate LOW_STOCK notifications when lowStockProducts changes
  useEffect(() => {
    if (!lowStockProducts || lowStockProducts.length === 0) return

    setNotifications(prev => {
      let updated = [...prev]
      // Only add for products not already notified today
      const today = new Date().toDateString()
      for (const p of lowStockProducts) {
        const dedupKey = `low-stock-${p.id}-${today}`
        if (!updated.some(n => n.id === dedupKey)) {
          const notif: AppNotification = {
            id: dedupKey,
            type: 'LOW_STOCK',
            title: 'Stok Menipis',
            message: `${p.name} tersisa ${p.stock} unit`,
            createdAt: new Date().toISOString(),
            read: false,
          }
          updated = [notif, ...updated]
        }
      }
      if (updated.length !== prev.length) {
        saveNotifications(updated)
        return updated
      }
      return prev
    })
  }, [lowStockProducts])

  const unreadCount = countUnread(notifications)

  const handleMarkAllRead = useCallback(() => {
    setNotifications(prev => {
      const updated = markAllRead(prev)
      saveNotifications(updated)
      return updated
    })
  }, [])

  const handleDismiss = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id)
      saveNotifications(updated)
      return updated
    })
  }, [])

  const handleOpen = () => {
    setOpen(v => !v)
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative rounded-lg p-2 text-[var(--text-3)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
        aria-label="Notifikasi"
        aria-expanded={open}
      >
        <Bell style={{ width: 18, height: 18 }} />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] leading-none font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : (
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--border-mid)]" />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text-1)]">Notifikasi</p>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                  {unreadCount} baru
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-medium text-amber-600 transition-colors hover:text-amber-700"
                aria-label="Tandai semua sudah dibaca"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tandai dibaca
              </button>
            )}
          </div>

          {/* Body */}
          {notifications.length === 0 ? (
            <div className="py-8 text-center">
              <Bell className="mx-auto mb-2 h-7 w-7 text-[var(--border-mid)]" />
              <p className="text-xs text-[var(--text-3)]">Tidak ada notifikasi</p>
            </div>
          ) : (
            <div className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto">
              {notifications.map(notif => {
                const cfg = TYPE_CONFIG[notif.type]
                return (
                  <div
                    key={notif.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]',
                      !notif.read && 'bg-amber-50/40',
                    )}
                  >
                    {/* Icon */}
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
                        <p className="truncate text-xs font-semibold text-[var(--text-1)]">
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cfg.dot)} />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-2)]">
                        {notif.message}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--text-3)]">
                        {formatTimeAgo(notif.createdAt)}
                      </p>
                    </div>

                    {/* Dismiss */}
                    <button
                      onClick={() => handleDismiss(notif.id)}
                      className="mt-0.5 shrink-0 rounded-md p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]"
                      aria-label="Hapus notifikasi"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5">
              <button
                onClick={() => {
                  setNotifications([])
                  saveNotifications([])
                }}
                className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
              >
                Hapus semua notifikasi
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
