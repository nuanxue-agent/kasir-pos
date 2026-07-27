'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Tag,
  Receipt,
  Users,
  Percent,
  Boxes,
  BarChart3,
  UserCog,
  Store,
  Building2,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isAtLeast } from '@/lib/permissions'
import type { UserRole } from '@/lib/permissions'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  title: string
  items: NavItem[]
  /** Minimum role required to see this group */
  minRole?: Parameters<typeof isAtLeast>[1]
  /** If true, only visible to SUPER_ADMIN */
  superAdminOnly?: boolean
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard',    href: '/dashboard',      icon: LayoutDashboard },
      { label: 'POS Terminal', href: '/dashboard/pos',  icon: ShoppingCart },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { label: 'Products',   href: '/dashboard/products',   icon: Package },
      { label: 'Categories', href: '/dashboard/categories', icon: Tag },
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Orders',    href: '/dashboard/orders',    icon: Receipt },
      { label: 'Customers', href: '/dashboard/customers', icon: Users },
      { label: 'Discounts', href: '/dashboard/discounts', icon: Percent },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Inventory', href: '/dashboard/inventory', icon: Boxes },
      { label: 'Reports',   href: '/dashboard/reports',   icon: BarChart3 },
    ],
  },
  {
    title: 'Management',
    minRole: 'MANAGER',
    items: [
      { label: 'Staff',  href: '/dashboard/staff',  icon: UserCog },
      { label: 'Stores', href: '/dashboard/stores', icon: Store },
    ],
  },
  {
    title: 'System',
    superAdminOnly: true,
    items: [
      { label: 'Tenants', href: '/admin/tenants', icon: Building2 },
    ],
  },
]

interface SidebarProps {
  userRole: UserRole
  isSuperAdmin: boolean
  /** Controls mobile visibility */
  open: boolean
  onClose: () => void
}

export function Sidebar({ userRole, isSuperAdmin, open, onClose }: SidebarProps) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  function canSeeGroup(group: NavGroup): boolean {
    if (group.superAdminOnly) return isSuperAdmin
    if (group.minRole) return isAtLeast(userRole, group.minRole)
    return true
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
            <ShoppingCart className="h-4 w-4 text-white" />
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">Kasir</span>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden text-slate-400 hover:text-white p-1 rounded"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV_GROUPS.filter(canSeeGroup).map((group) => (
          <div key={group.title}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        active
                          ? 'bg-indigo-500/20 text-indigo-300'
                          : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-100'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          active ? 'text-indigo-400' : 'text-slate-500'
                        )}
                      />
                      {item.label}
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="shrink-0 border-t border-slate-700/50 p-3 space-y-0.5">
        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            pathname.startsWith('/dashboard/settings')
              ? 'bg-indigo-500/20 text-indigo-300'
              : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-100'
          )}
        >
          <Settings className="h-4 w-4 shrink-0 text-slate-500" />
          Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Log out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-60 shrink-0 bg-[#1e293b] h-screen sticky top-0"
        aria-label="Main navigation"
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside
            className="relative z-50 w-60 bg-[#1e293b] h-full flex flex-col shadow-xl"
            aria-label="Main navigation"
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
