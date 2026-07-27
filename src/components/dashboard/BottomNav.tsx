'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  BarChart3,
  Boxes,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// The 5 tabs specified for the bottom nav
const ALL_NAV_ITEMS = [
  { label: 'Home',      href: '/dashboard',              icon: LayoutDashboard, module: null },
  { label: 'POS',       href: '/dashboard/quick-sale',   icon: ShoppingCart,    module: 'pos' },
  { label: 'Reports',   href: '/dashboard/reports',      icon: BarChart3,       module: 'reports' },
  { label: 'Inventory', href: '/dashboard/inventory',    icon: Boxes,           module: 'inventory' },
  { label: 'More',      href: '/dashboard/more',         icon: MoreHorizontal,  module: null },
]

interface BottomNavProps {
  modules?: string[]
}

export function BottomNav({ modules }: BottomNavProps) {
  const pathname = usePathname()
  const enabledModules = modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports']

  const navItems = ALL_NAV_ITEMS.filter(
    item => item.module === null || enabledModules.includes(item.module),
  )

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    // Treat quick-sale as active when on pos too
    if (href === '/dashboard/quick-sale') {
      return pathname === '/dashboard/quick-sale' || pathname.startsWith('/dashboard/pos')
    }
    return pathname.startsWith(href)
  }

  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-card)] border-t border-[var(--border)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch h-16">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          const isPOS = href === '/dashboard/quick-sale'
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative',
                // Minimum 44×44 tap target (handled by flex-1 + h-16)
                'min-w-[44px]',
                active ? 'text-amber-600' : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
              )}
            >
              {isPOS ? (
                // Elevated POS button — floats above the bar
                <div
                  className={cn(
                    'flex flex-col items-center justify-center w-12 h-12 rounded-2xl -mt-5 shadow-md transition-all',
                    active
                      ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-300/60'
                      : 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200/50',
                  )}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
              ) : (
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-xl transition-all',
                    active ? 'bg-[var(--primary-subtle)]' : 'bg-transparent',
                  )}
                >
                  <Icon
                    className={cn('h-5 w-5', active ? 'text-amber-600' : 'text-[var(--text-3)]')}
                  />
                </div>
              )}
              <span
                className={cn(
                  'text-[10px] font-medium leading-none',
                  isPOS ? 'mt-1' : '',
                  active ? 'text-amber-600' : 'text-[var(--text-3)]',
                )}
              >
                {label}
              </span>
              {/* Active dot indicator */}
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
