'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronRight } from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

export const POS_TOUR_DONE_KEY = 'pos_tour_done'
export const POS_ORDERS_COUNT_KEY = 'pos_orders_count'

export interface TourStep {
  id: string
  title: string
  description: string
  /** CSS selector or data-tour attribute target */
  target: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'search',
    title: 'Cari produk di sini',
    description: 'Search for products here — ketik nama atau scan barcode.',
    target: '[data-tour="search"]',
  },
  {
    id: 'product-grid',
    title: 'Klik produk untuk ditambah',
    description: 'Click a product to add it to cart — ketuk untuk memilih.',
    target: '[data-tour="product-grid"]',
  },
  {
    id: 'cart-panel',
    title: 'Keranjang belanja',
    description: 'Review your cart here — lihat item, harga, dan diskon.',
    target: '[data-tour="cart-panel"]',
  },
  {
    id: 'checkout-button',
    title: 'Tap Checkout ketika siap',
    description: 'Tap Checkout when ready — pilih metode pembayaran dan selesaikan.',
    target: '[data-tour="checkout-button"]',
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function shouldShowTour(): boolean {
  if (typeof window === 'undefined') return false
  const done = localStorage.getItem(POS_TOUR_DONE_KEY)
  if (done === 'true') return false
  const ordersCount = parseInt(localStorage.getItem(POS_ORDERS_COUNT_KEY) ?? '0', 10)
  return ordersCount === 0
}

export function markTourDone(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(POS_TOUR_DONE_KEY, 'true')
  }
}

// ─── Spotlight helper ─────────────────────────────────────────────────────────

function getTargetRect(selector: string): DOMRect | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector(selector)
  if (!el) return null
  return el.getBoundingClientRect()
}

interface SpotlightProps {
  rect: DOMRect | null
}

function Spotlight({ rect }: SpotlightProps) {
  if (!rect) {
    // No target found — just dim the whole screen
    return (
      <div
        className="fixed inset-0 z-[60] bg-black/60"
        aria-hidden="true"
      />
    )
  }

  const pad = 8
  const x = rect.left - pad
  const y = rect.top - pad
  const w = rect.width + pad * 2
  const h = rect.height + pad * 2

  // Use SVG clip-path to cut a hole over the target element
  const svgId = 'tour-spotlight-clip'

  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
      aria-hidden="true"
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh' }}
    >
      <defs>
        <clipPath id={svgId}>
          <path
            fillRule="evenodd"
            d={`M0,0 H${window.innerWidth} V${window.innerHeight} H0 Z
               M${x},${y} h${w} v${h} h-${w} Z`}
          />
        </clipPath>
      </defs>
      <rect
        x="0"
        y="0"
        width={window.innerWidth}
        height={window.innerHeight}
        fill="rgba(0,0,0,0.60)"
        clipPath={`url(#${svgId})`}
      />
      {/* Highlight ring around target */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="8"
        ry="8"
        fill="none"
        stroke="rgba(245,158,11,0.9)"
        strokeWidth="2"
      />
    </svg>
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipProps {
  step: TourStep
  stepIndex: number
  total: number
  rect: DOMRect | null
  onNext: () => void
  onSkip: () => void
}

function Tooltip({ step, stepIndex, total, rect, onNext, onSkip }: TooltipProps) {
  // Position tooltip below the target (or centered if no target)
  let style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 70,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
  }

  if (rect) {
    const pad = 12
    const tooltipH = 140
    const below = rect.bottom + pad + tooltipH < window.innerHeight
    style = {
      position: 'fixed',
      zIndex: 70,
      left: Math.min(Math.max(rect.left, 16), window.innerWidth - 288),
      top: below ? rect.bottom + pad : rect.top - pad - tooltipH,
    }
  }

  return (
    <div
      role="tooltip"
      className="w-72 rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl shadow-amber-200/40"
      style={style}
    >
      {/* Step counter */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-wider text-amber-600 uppercase">
          Langkah {stepIndex + 1} / {total}
        </span>
        <button
          onClick={onSkip}
          aria-label="Skip tour"
          className="text-stone-400 transition-colors hover:text-stone-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <h3 className="mb-1 text-sm font-bold text-stone-800">{step.title}</h3>
      <p className="mb-4 text-xs leading-relaxed text-stone-500">{step.description}</p>

      {/* Dot indicators */}
      <div className="mb-3 flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={[
              'h-1.5 rounded-full transition-all',
              i === stepIndex ? 'w-4 bg-amber-500' : 'w-1.5 bg-stone-200',
            ].join(' ')}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSkip}
          className="flex-1 rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700"
        >
          Lewati tur
        </button>
        <button
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 py-2 text-xs font-semibold text-white shadow-md shadow-amber-200 transition-opacity hover:opacity-90"
        >
          {stepIndex < total - 1 ? (
            <>
              Lanjut <ChevronRight className="h-3.5 w-3.5" />
            </>
          ) : (
            'Selesai'
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Main POSTour Component ───────────────────────────────────────────────────

interface POSTourProps {
  /** Call this to signal the parent the tour is complete/skipped */
  onDone: () => void
}

export default function POSTour({ onDone }: POSTourProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)

  const currentStep = TOUR_STEPS[stepIndex]

  // Measure target element position
  const measureTarget = useCallback(() => {
    if (!currentStep) return
    // Small delay to let layout settle
    setTimeout(() => {
      setRect(getTargetRect(currentStep.target))
    }, 80)
  }, [currentStep])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) measureTarget()
  }, [mounted, stepIndex, measureTarget])

  // Re-measure on resize/scroll
  useEffect(() => {
    if (!mounted) return
    window.addEventListener('resize', measureTarget)
    window.addEventListener('scroll', measureTarget, true)
    return () => {
      window.removeEventListener('resize', measureTarget)
      window.removeEventListener('scroll', measureTarget, true)
    }
  }, [mounted, measureTarget])

  const handleNext = useCallback(() => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex(i => i + 1)
    } else {
      markTourDone()
      onDone()
    }
  }, [stepIndex, onDone])

  const handleSkip = useCallback(() => {
    markTourDone()
    onDone()
  }, [onDone])

  if (!mounted || !currentStep) return null

  return (
    <>
      <Spotlight rect={rect} />
      <Tooltip
        step={currentStep}
        stepIndex={stepIndex}
        total={TOUR_STEPS.length}
        rect={rect}
        onNext={handleNext}
        onSkip={handleSkip}
      />
    </>
  )
}
