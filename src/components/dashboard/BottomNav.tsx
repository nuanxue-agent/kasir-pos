'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingCart, Package, Receipt, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard',          icon: LayoutDashboard },
  { label: 'Kasir',     href: '/dashboard/pos',       icon: ShoppingCart },
  { label: 'Produk',    href: '/dashboard/products',  icon: Package },
  { label: 'Pesanan',   href: '/dashboard/orders',    icon: Receipt },
  { label: 'Laporan',   href: '/dashboard/reports',   icon: BarChart3 },
]

export function BottomNav() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-stone-100 safe-area-bottom">
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          const isPOS = href === '/dashboard/pos'
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative',
                active ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600',
                isPOS && 'relative'
              )}
            >
              {isPOS ? (
                // POS gets a floating button treatment
                <div className={cn(
                  'flex flex-col items-center justify-center w-12 h-12 rounded-2xl -mt-5 shadow-lg shadow-amber-200 transition-all',
                  active
                    ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                    : 'bg-gradient-to-br from-amber-400 to-orange-500'
                )}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              ) : (
                <>
                  <div className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-xl transition-all',
                    active ? 'bg-amber-50' : 'bg-transparent'
                  )}>
                    <Icon className={cn('h-5 w-5', active ? 'text-amber-600' : 'text-stone-400')} />
                  </div>
                </>
              )}
              <span className={cn(
                'text-[10px] font-medium leading-none',
                isPOS && active ? 'text-amber-600 mt-1' : '',
                isPOS && !active ? 'text-stone-400 mt-1' : ''
              )}>
                {label}
              </span>
              {active && !isPOS && (
                <span className="absolute top-1.5 w-1 h-1 rounded-full bg-amber-500" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
