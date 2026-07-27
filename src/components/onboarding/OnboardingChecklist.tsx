'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  ChevronRight,
  CheckCircle2,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Tour config ───────────────────────────────────────────────────────────────

const TOUR_KEY = 'product_tour_completed'
const TOUR_STEP_KEY = 'product_tour_step'

export interface TourStep {
  id: string
  title: string
  description: string
  /** data-tour attribute selector to highlight */
  target: string
  icon: React.ElementType
  route: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description:
      'Lihat ringkasan bisnis Anda secara real-time — penjualan hari ini, stok menipis, dan aktivitas terbaru.',
    target: '[data-tour="dashboard-summary"]',
    icon: LayoutDashboard,
    route: '/dashboard',
  },
  {
    id: 'pos',
    title: 'Point of Sale',
    description:
      'Proses transaksi dengan cepat. Cari produk, tambah ke keranjang, lalu checkout dengan berbagai metode pembayaran.',
    target: '[data-tour="pos-search"]',
    icon: ShoppingCart,
    route: '/dashboard/pos',
  },
  {
    id: 'add-product',
    title: 'Tambah Produk',
    description:
      'Kelola katalog produk Anda. Tambah produk baru lengkap dengan harga, stok, SKU, dan foto.',
    target: '[data-tour="add-product-btn"]',
    icon: Package,
    route: '/dashboard/products',
  },
  {
    id: 'create-customer',
    title: 'Buat Pelanggan',
    description:
      'Daftarkan pelanggan untuk melacak riwayat pembelian, poin loyalitas, dan informasi kontak.',
    target: '[data-tour="add-customer-btn"]',
    icon: Users,
    route: '/dashboard/customers',
  },
  {
    id: 'view-reports',
    title: 'Lihat Laporan',
    description:
      'Analisa performa bisnis Anda dengan laporan penjualan, produk terlaris, dan tren pendapatan.',
    target: '[data-tour="reports-nav"]',
    icon: BarChart3,
    route: '/dashboard/reports',
  },
]

// ─── Tour helpers (pure, exportable for tests) ────────────────────────────────

export function isTourCompleted(storage: Record<string, string>): boolean {
  return storage[TOUR_KEY] === 'true'
}

export function getCurrentTourStep(storage: Record<string, string>): number {
  const v = parseInt(storage[TOUR_STEP_KEY] ?? '0', 10)
  return isNaN(v) ? 0 : Math.min(v, TOUR_STEPS.length - 1)
}

export function getNextTourStep(current: number): number {
  return Math.min(current + 1, TOUR_STEPS.length - 1)
}

// ─── Tooltip overlay for highlighted element ──────────────────────────────────

function TourOverlay({
  step,
  stepIndex,
  total,
  onNext,
  onSkip,
}: {
  step: TourStep
  stepIndex: number
  total: number
  onNext: () => void
  onSkip: () => void
}) {
  const Icon = step.icon
  const isLast = stepIndex === total - 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Tour produk"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onSkip} />

      {/* Card */}
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--border,#e7e5e4)] bg-white p-5 shadow-2xl">
        {/* Progress */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium text-stone-400">
            Langkah {stepIndex + 1} dari {total}
          </span>
          <button
            onClick={onSkip}
            className="rounded-lg p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            aria-label="Lewati tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-1.5 rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
            style={{ width: `${((stepIndex + 1) / total) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-200">
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-stone-800">{step.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-stone-500">{step.description}</p>
          </div>
        </div>

        {/* Step dots */}
        <div className="mb-4 flex justify-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === stepIndex ? 'w-5 bg-amber-500' : 'w-1.5 bg-stone-200',
              )}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-50"
          >
            Lewati
          </button>
          <button
            onClick={onNext}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
          >
            {isLast ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Selesai
              </>
            ) : (
              <>
                Lanjut
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface ProductTourProps {
  /** Called when tour finishes or is skipped — parent should persist tourCompletedAt */
  onComplete?: () => void
  /** Auto-start if tour hasn't been completed */
  autoStart?: boolean
}

export function ProductTour({ onComplete, autoStart = true }: ProductTourProps) {
  const router = useRouter()
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (!autoStart) return
    try {
      const storage: Record<string, string> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!
        storage[k] = localStorage.getItem(k) ?? ''
      }
      if (!isTourCompleted(storage)) {
        const savedStep = getCurrentTourStep(storage)
        setStepIndex(savedStep)
        setActive(true)
      }
    } catch {
      // localStorage unavailable (SSR / private mode)
    }
  }, [autoStart])

  const completeTour = useCallback(async () => {
    setActive(false)
    try {
      localStorage.setItem(TOUR_KEY, 'true')
      localStorage.removeItem(TOUR_STEP_KEY)
    } catch {}
    // Persist to server (fire-and-forget; non-blocking)
    try {
      await fetch('/api/user/tour-complete', { method: 'POST' })
    } catch {}
    onComplete?.()
  }, [onComplete])

  const handleNext = useCallback(async () => {
    if (stepIndex === TOUR_STEPS.length - 1) {
      await completeTour()
      return
    }
    const next = stepIndex + 1
    setStepIndex(next)
    try {
      localStorage.setItem(TOUR_STEP_KEY, String(next))
    } catch {}
    // Navigate to the next step's route
    router.push(TOUR_STEPS[next].route)
  }, [stepIndex, completeTour, router])

  const handleSkip = useCallback(async () => {
    await completeTour()
  }, [completeTour])

  if (!active) return null

  return (
    <TourOverlay
      step={TOUR_STEPS[stepIndex]}
      stepIndex={stepIndex}
      total={TOUR_STEPS.length}
      onNext={handleNext}
      onSkip={handleSkip}
    />
  )
}

// ─── Checklist items (kept for backward compat with onboarding-checklist.test) ─

export const CHECKLIST_ITEMS = [
  {
    id: 'store_info',
    label: 'Lengkapi info toko',
    storageKey: 'onboarding_store_info',
    route: '/dashboard/settings',
  },
  {
    id: 'first_product',
    label: 'Tambah produk pertama',
    storageKey: 'onboarding_first_product',
    route: '/dashboard/products',
  },
  {
    id: 'first_sale',
    label: 'Buat transaksi pertama',
    storageKey: 'onboarding_first_sale',
    route: '/dashboard/pos',
  },
  {
    id: 'add_customer',
    label: 'Daftarkan pelanggan',
    storageKey: 'onboarding_add_customer',
    route: '/dashboard/customers',
  },
  {
    id: 'receipt_settings',
    label: 'Atur struk toko',
    storageKey: 'onboarding_receipt_settings',
    route: '/dashboard/settings',
  },
  {
    id: 'staff_accounts',
    label: 'Tambah akun staf',
    storageKey: 'onboarding_staff_accounts',
    route: '/dashboard/staff',
  },
] as const

export type ChecklistItemId = (typeof CHECKLIST_ITEMS)[number]['id']

export function readCompletionFromStorage(
  storage: Record<string, string>,
): Record<ChecklistItemId, boolean> {
  const result = {} as Record<ChecklistItemId, boolean>
  for (const item of CHECKLIST_ITEMS) {
    result[item.id] = storage[item.storageKey] === 'true'
  }
  return result
}

export function countCompleted(completion: Record<string, boolean>): number {
  return Object.values(completion).filter(Boolean).length
}
