'use client'

import { useEffect, useState } from 'react'
import { DISPLAY_CHANNEL, type DisplayPayload } from '@/components/pos/CustomerDisplay'

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency }).format(n)
}

export default function CustomerDisplayPage() {
  const [payload, setPayload] = useState<DisplayPayload | null>(null)
  const [storeName, setStoreName] = useState('Kasir POS')
  const [currency, setCurrency] = useState('IDR')

  useEffect(() => {
    // Load last known state from localStorage (handles page refresh)
    try {
      const saved = localStorage.getItem(DISPLAY_CHANNEL)
      if (saved) {
        const parsed: DisplayPayload = JSON.parse(saved)
        setPayload(parsed)
        if (parsed.storeName) setStoreName(parsed.storeName)
        if (parsed.currency) setCurrency(parsed.currency)
      }
    } catch {}

    // Listen for real-time updates
    let bc: BroadcastChannel | null = null
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel(DISPLAY_CHANNEL)
      bc.onmessage = (e: MessageEvent<DisplayPayload>) => {
        const data = e.data
        setPayload(data)
        if (data.storeName) setStoreName(data.storeName)
        if (data.currency) setCurrency(data.currency)
      }
    }

    // Fallback: storage events for cross-tab (same origin, different channel)
    function onStorage(e: StorageEvent) {
      if (e.key !== DISPLAY_CHANNEL || !e.newValue) return
      try {
        const data: DisplayPayload = JSON.parse(e.newValue)
        setPayload(data)
        if (data.storeName) setStoreName(data.storeName)
        if (data.currency) setCurrency(data.currency)
      } catch {}
    }
    window.addEventListener('storage', onStorage)

    return () => {
      bc?.close()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const isPayment = payload?.type === 'payment'
  const items = payload?.items ?? []
  const subtotal = payload?.subtotal ?? 0
  const taxAmt = payload?.taxAmt ?? 0
  const total = payload?.total ?? 0
  const change = payload?.change ?? 0

  return (
    <div className="min-h-screen bg-stone-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-stone-800 px-8 py-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-amber-400">{storeName}</h1>
        <span className="text-sm text-stone-400">Layar Pelanggan</span>
      </header>

      {/* Body */}
      <main className="flex-1 px-8 py-6 flex flex-col gap-4">
        {isPayment ? (
          /* ── Thank you screen ─────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
            <div className="rounded-full bg-emerald-500/20 p-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-20 w-20 text-emerald-400"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-4xl font-bold text-emerald-400">Terima Kasih!</h2>
            <p className="text-stone-300 text-lg">Pembayaran berhasil</p>
            {change > 0 && (
              <div className="rounded-2xl bg-amber-500/20 border border-amber-500/40 px-10 py-6">
                <p className="text-stone-400 text-sm mb-1">Kembalian</p>
                <p className="text-5xl font-bold text-amber-400">{fmt(change, currency)}</p>
              </div>
            )}
            <p className="text-stone-500 text-sm mt-4">Selamat berbelanja kembali</p>
          </div>
        ) : items.length === 0 ? (
          /* ── Idle screen ──────────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full bg-stone-800 p-10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-16 w-16 text-stone-500"
                aria-hidden="true"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <p className="text-stone-400 text-xl">Menunggu pesanan…</p>
            <p className="text-stone-600 text-sm">Silakan pilih item untuk ditampilkan di sini</p>
          </div>
        ) : (
          /* ── Cart screen ──────────────────────────────────────── */
          <>
            <h2 className="text-lg font-semibold text-stone-300">Detail Pesanan</h2>

            {/* Items table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-800 text-stone-400">
                    <th className="pb-2 text-left font-medium">Item</th>
                    <th className="pb-2 text-center font-medium w-12">Qty</th>
                    <th className="pb-2 text-right font-medium">Harga</th>
                    <th className="pb-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-stone-800/60">
                      <td className="py-3 text-white font-medium">{item.name}</td>
                      <td className="py-3 text-center text-stone-300">{item.qty}</td>
                      <td className="py-3 text-right text-stone-300">{fmt(item.price, currency)}</td>
                      <td className="py-3 text-right text-white">{fmt(item.subtotal, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-t border-stone-700 pt-4 space-y-2">
              <div className="flex justify-between text-stone-400 text-sm">
                <span>Subtotal</span>
                <span>{fmt(subtotal, currency)}</span>
              </div>
              {taxAmt > 0 && (
                <div className="flex justify-between text-stone-400 text-sm">
                  <span>Pajak</span>
                  <span>{fmt(taxAmt, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold text-amber-400 pt-2 border-t border-stone-700">
                <span>TOTAL</span>
                <span>{fmt(total, currency)}</span>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-800 px-8 py-3 text-center text-xs text-stone-600">
        Powered by Kasir POS
      </footer>
    </div>
  )
}
