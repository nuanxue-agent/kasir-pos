'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingCart, Package, Receipt, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const ALL_NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard',          icon: LayoutDashboard, module: null },
  { label: 'Kasir',     href: '/dashboard/pos',       icon: ShoppingCart,    module: 'pos' },
  { label: 'Produk',    href: '/dashboard/products',  icon: Package,         module: null },
  { label: 'Pesanan',   href: '/dashboard/orders',    icon: Receipt,         module: null },
  { label: 'Laporan',   href: '/dashboard/reports',   icon: BarChart3,       module: 'reports' },
]

interface BottomNavProps {
  modules?: string[]
}

export function BottomNav({ modules }: BottomNavProps) {
  const pathname = usePathname()
  const enabledModules = modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports']

  const navItems = ALL_NAV_ITEMS.filter(item =>
    item.module === null || enabledModules.includes(item.module)
  )

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-card)] border-t border-[var(--border)] pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-stretch h-16">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          const isPOS = href === '/dashboard/pos'
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative',
                active ? 'text-amber-600' : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
              )}
            >
              {isPOS ? (
                <div className={cn(
                  'flex flex-col items-center justify-center w-12 h-12 rounded-2xl -mt-5 shadow-md shadow-amber-200/50 transition-all',
                  active
                    ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                    : 'bg-gradient-to-br from-amber-400 to-orange-500'
                )}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              ) : (
                <div className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-xl transition-all',
                  active ? 'bg-[var(--primary-subtle)]' : 'bg-transparent'
                )}>
                  <Icon className={cn('h-5 w-5', active ? 'text-amber-600' : 'text-[var(--text-3)]')} />
                </div>
              )}
              <span className={cn(
                'text-[10px] font-medium leading-none',
                isPOS ? 'mt-1' : '',
                active ? 'text-amber-600' : 'text-[var(--text-3)]'
              )}>
                {label}
              </span>
              {active && !isPOS && (
                <span className="absolute top-1.5 w-1 h-1 rounded-full bg-amber-500/70" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
