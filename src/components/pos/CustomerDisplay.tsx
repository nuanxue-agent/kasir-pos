'use client'

import { useEffect, useRef } from 'react'
import { Monitor } from 'lucide-react'

// BroadcastChannel key — must match what the display page listens on
export const DISPLAY_CHANNEL = 'kasir-customer-display'

export interface DisplayPayload {
  type: 'cart' | 'payment'
  storeName?: string
  currency?: string
  taxRate?: number
  items?: Array<{ name: string; qty: number; price: number; subtotal: number }>
  subtotal?: number
  taxAmt?: number
  total?: number
  // payment thank-you
  amountPaid?: number
  change?: number
}

interface CustomerDisplayProps {
  storeName: string
  currency: string
  taxRate: number
  items: Array<{ name: string; qty: number; price: number; subtotal: number }>
  subtotal: number
  taxAmt: number
  total: number
}

export function useCustomerDisplay() {
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      channelRef.current = new BroadcastChannel(DISPLAY_CHANNEL)
    }
    return () => {
      channelRef.current?.close()
    }
  }, [])

  function broadcast(payload: DisplayPayload) {
    channelRef.current?.postMessage(payload)
    // Also write to localStorage for same-origin windows that missed the broadcast
    try {
      localStorage.setItem(DISPLAY_CHANNEL, JSON.stringify({ ...payload, _ts: Date.now() }))
    } catch {}
  }

  return { broadcast }
}

export default function CustomerDisplayButton({
  storeName,
  currency,
  taxRate,
  items,
  subtotal,
  taxAmt,
  total,
}: CustomerDisplayProps) {
  const displayWindowRef = useRef<Window | null>(null)

  function openDisplay() {
    const w = window.open('/pos/display', 'kasir-display', 'width=800,height=600')
    if (w) displayWindowRef.current = w
  }

  return (
    <button
      onClick={openDisplay}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
      title="Buka layar pelanggan"
      aria-label="Buka layar pelanggan"
      type="button"
    >
      <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Display</span>
    </button>
  )
}
