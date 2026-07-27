'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, X, ShoppingCart, Package, Users, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACTIONS = [
  {
    label: 'Pesanan Baru',
    href: '/dashboard/orders',
    icon: Receipt,
    color: 'bg-sky-500 hover:bg-sky-600',
  },
  {
    label: 'Pelanggan Baru',
    href: '/dashboard/customers',
    icon: Users,
    color: 'bg-purple-500 hover:bg-purple-600',
  },
  {
    label: 'Produk Baru',
    href: '/dashboard/products',
    icon: Package,
    color: 'bg-emerald-500 hover:bg-emerald-600',
  },
  {
    label: 'Penjualan Baru',
    href: '/dashboard/pos',
    icon: ShoppingCart,
    color: 'bg-amber-500 hover:bg-amber-600',
  },
]

export function QuickActions() {
  const [open, setOpen] = useState(false)

  return (
    // Only visible on mobile, positioned above BottomNav (h-16 = 64px, add 8px gap)
    <div className="fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+8px)] z-50 flex flex-col items-end gap-2 md:hidden">
      {/* Slide-up action menu */}
      <div
        className={cn(
          'flex origin-bottom flex-col items-end gap-2 transition-all duration-200',
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-4 scale-95 opacity-0',
        )}
        aria-hidden={!open}
      >
        {ACTIONS.map(({ label, href, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className="group flex items-center gap-2"
          >
            {/* Label pill */}
            <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium whitespace-nowrap text-[var(--text-1)] shadow-sm">
              {label}
            </span>
            {/* Icon button */}
            <span
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md transition-colors',
                color,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Tutup aksi cepat' : 'Buka aksi cepat'}
        aria-expanded={open}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-amber-300/50 transition-all active:scale-95',
          open
            ? 'rotate-45 bg-stone-600 hover:bg-stone-700'
            : 'bg-gradient-to-br from-amber-500 to-orange-500 hover:shadow-amber-400/60',
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  )
}
