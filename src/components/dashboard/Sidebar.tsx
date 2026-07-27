'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  Zap,
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
  minRole?: Parameters<typeof isAtLeast>[1]
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
  userName?: string
  userEmail?: string | null
  open: boolean
  onClose: () => void
}

export function Sidebar({ userRole, isSuperAdmin, userName, userEmail, open, onClose }: SidebarProps) {
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

  const initials = (userName ?? 'U')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login'
    })
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-white font-bold text-base tracking-tight">Kasir</span>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden text-white/40 hover:text-white/80 p-1 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV_GROUPS.filter(canSeeGroup).map((group) => (
          <div key={group.title}>
            <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">
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
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/10 text-white border border-indigo-500/20'
                          : 'text-white/50 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'shrink-0 transition-colors',
                          active ? 'text-indigo-400' : 'text-white/30'
                        )}
                        style={{ width: 18, height: 18 }}
                      />
                      <span className="truncate">{item.label}</span>
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Settings link */}
      <div className="px-3 pb-2">
        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
            pathname.startsWith('/dashboard/settings')
              ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/10 text-white border border-indigo-500/20'
              : 'text-white/50 hover:text-white hover:bg-white/5'
          )}
        >
          <Settings
            className={cn(
              'shrink-0',
              pathname.startsWith('/dashboard/settings') ? 'text-indigo-400' : 'text-white/30'
            )}
            style={{ width: 18, height: 18 }}
          />
          Settings
        </Link>
      </div>

      {/* User section */}
      <div className="shrink-0 border-t border-white/5 p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName ?? 'User'}</p>
            {userEmail && (
              <p className="text-xs text-white/30 truncate">{userEmail}</p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-[240px] shrink-0 bg-[#0d0d14] border-r border-white/5 h-screen sticky top-0"
        aria-label="Main navigation"
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside
            className="relative z-50 w-[240px] bg-[#0d0d14] border-r border-white/5 h-full flex flex-col shadow-2xl"
            aria-label="Main navigation"
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
