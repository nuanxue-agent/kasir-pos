'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

// Global toast queue using a simple pub/sub pattern
type ToastListener = (toast: Toast) => void
const listeners: Set<ToastListener> = new Set()

export const toast = {
  success: (title: string, message?: string, duration = 4000) =>
    emit({ id: crypto.randomUUID(), type: 'success', title, message, duration }),
  error: (title: string, message?: string, duration = 6000) =>
    emit({ id: crypto.randomUUID(), type: 'error', title, message, duration }),
  warning: (title: string, message?: string, duration = 5000) =>
    emit({ id: crypto.randomUUID(), type: 'warning', title, message, duration }),
  info: (title: string, message?: string, duration = 4000) =>
    emit({ id: crypto.randomUUID(), type: 'info', title, message, duration }),
}

function emit(t: Toast) {
  listeners.forEach(l => l(t))
}

const ICONS: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
}

const STYLES: Record<ToastType, { wrapper: string; icon: string }> = {
  success: { wrapper: 'border-emerald-200 bg-[var(--bg-card)]', icon: 'text-emerald-500' },
  error:   { wrapper: 'border-red-200 bg-[var(--bg-card)]',     icon: 'text-red-500' },
  warning: { wrapper: 'border-amber-200 bg-[var(--bg-card)]',   icon: 'text-amber-500' },
  info:    { wrapper: 'border-blue-200 bg-[var(--bg-card)]',    icon: 'text-blue-500' },
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    const listener: ToastListener = (toast) => {
      setToasts(prev => [...prev.slice(-4), toast]) // max 5
      if (toast.duration && toast.duration > 0) {
        setTimeout(() => dismiss(toast.id), toast.duration)
      }
    }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [dismiss])

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map(t => {
        const Icon = ICONS[t.type]
        const style = STYLES[t.type]
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-lg shadow-stone-200/60 pointer-events-auto',
              'animate-in slide-in-from-right-4 fade-in duration-200',
              style.wrapper
            )}
          >
            <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', style.icon)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-stone-800">{t.title}</p>
              {t.message && <p className="text-xs text-stone-500 mt-0.5">{t.message}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-stone-300 hover:text-stone-500 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
