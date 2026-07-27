'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, CheckCircle2, Circle, ChevronRight, Rocket } from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

export const ONBOARDING_DISMISSED_KEY = 'onboarding_dismissed'

export const CHECKLIST_ITEMS = [
  {
    id: 'store_info',
    label: 'Set up store info',
    labelId: 'Lengkapi info toko',
    href: '/dashboard/settings',
    storageKey: 'onboarding_store_info',
  },
  {
    id: 'first_product',
    label: 'Add your first product',
    labelId: 'Tambah produk pertama',
    href: '/dashboard/products/new',
    storageKey: 'onboarding_first_product',
  },
  {
    id: 'first_sale',
    label: 'Make your first sale',
    labelId: 'Catat penjualan pertama',
    href: '/dashboard/pos',
    storageKey: 'onboarding_first_sale',
  },
  {
    id: 'add_customer',
    label: 'Add a customer',
    labelId: 'Tambah pelanggan',
    href: '/dashboard/customers/new',
    storageKey: 'onboarding_add_customer',
  },
  {
    id: 'receipt_settings',
    label: 'Configure receipt settings',
    labelId: 'Atur pengaturan struk',
    href: '/dashboard/settings#receipt',
    storageKey: 'onboarding_receipt_settings',
  },
  {
    id: 'staff_accounts',
    label: 'Set up staff accounts',
    labelId: 'Buat akun staf',
    href: '/dashboard/staff',
    storageKey: 'onboarding_staff_accounts',
  },
] as const

export type ChecklistItemId = (typeof CHECKLIST_ITEMS)[number]['id']

// ─── Helpers (exported for tests) ────────────────────────────────────────────

export function readCompletionFromStorage(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  const result: Record<string, boolean> = {}
  for (const item of CHECKLIST_ITEMS) {
    result[item.id] = localStorage.getItem(item.storageKey) === 'true'
  }
  return result
}

export function countCompleted(completion: Record<string, boolean>): number {
  return Object.values(completion).filter(Boolean).length
}

export function shouldAutoShow(): boolean {
  if (typeof window === 'undefined') return false
  const dismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY)
  if (dismissed === 'true') return false
  const completed = readCompletionFromStorage()
  return countCompleted(completed) < CHECKLIST_ITEMS.length
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingChecklistProps {
  open: boolean
  onClose: () => void
}

export default function OnboardingChecklist({ open, onClose }: OnboardingChecklistProps) {
  const [completion, setCompletion] = useState<Record<string, boolean>>({})

  // Read completion from localStorage on mount and when panel opens
  useEffect(() => {
    if (open) {
      setCompletion(readCompletionFromStorage())
    }
  }, [open])

  const toggleItem = useCallback((id: string, storageKey: string) => {
    setCompletion(prev => {
      const next = { ...prev, [id]: !prev[id] }
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, String(next[id]))
      }
      return next
    })
  }, [])

  const handleDismiss = useCallback(
    (dontShowAgain: boolean) => {
      if (dontShowAgain && typeof window !== 'undefined') {
        localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true')
      }
      onClose()
    },
    [onClose],
  )

  const completed = countCompleted(completion)
  const total = CHECKLIST_ITEMS.length
  const pct = Math.round((completed / total) * 100)

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
          onClick={() => handleDismiss(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Getting Started checklist"
        className={[
          'fixed top-0 right-0 z-50 flex h-full w-full max-w-sm flex-col overflow-hidden',
          'border-l border-[var(--border)] bg-[var(--bg-card)] shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500">
              <Rocket className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-1)]">Getting Started</h2>
              <p className="text-[11px] text-[var(--text-3)]">
                {completed}/{total} selesai
              </p>
            </div>
          </div>
          <button
            onClick={() => handleDismiss(false)}
            aria-label="Tutup panel"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-3)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-2)]">Progress</span>
            <span className="text-[11px] font-semibold text-amber-600">{pct}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-stone-200"
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {completed === total && (
            <p className="mt-2 text-center text-[11px] font-semibold text-emerald-600">
              🎉 Semua langkah selesai!
            </p>
          )}
        </div>

        {/* Checklist */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {CHECKLIST_ITEMS.map(item => {
            const done = !!completion[item.id]
            return (
              <div
                key={item.id}
                className={[
                  'group flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                  done
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-[var(--border)] bg-[var(--bg-page)] hover:border-amber-300 hover:bg-amber-50/40',
                ].join(' ')}
              >
                {/* Checkbox toggle */}
                <button
                  onClick={() => toggleItem(item.id, item.storageKey)}
                  aria-label={done ? `Unmark: ${item.label}` : `Mark as done: ${item.label}`}
                  className="shrink-0 transition-transform active:scale-90"
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-stone-300 group-hover:text-amber-400" />
                  )}
                </button>

                {/* Label + link */}
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      'text-sm font-medium',
                      done ? 'text-emerald-700 line-through' : 'text-[var(--text-1)]',
                    ].join(' ')}
                  >
                    {item.labelId}
                  </p>
                  <p className="text-[10px] text-[var(--text-3)]">{item.label}</p>
                </div>

                {/* Arrow link */}
                {!done && (
                  <Link
                    href={item.href}
                    onClick={() => handleDismiss(false)}
                    aria-label={`Go to ${item.label}`}
                    className="shrink-0 rounded-lg p-1.5 text-amber-500 transition-colors hover:bg-amber-100"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-5 py-4 space-y-2">
          <button
            onClick={() => handleDismiss(true)}
            className="w-full rounded-xl border border-[var(--border)] py-2.5 text-sm text-[var(--text-3)] transition-colors hover:border-stone-300 hover:text-[var(--text-2)]"
          >
            Jangan tampilkan lagi
          </button>
        </div>
      </div>
    </>
  )
}
