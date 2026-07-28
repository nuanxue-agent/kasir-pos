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
  ShoppingBag,
  TrendingDown,
  Clock,
  GitFork,
  FileText,
  Truck,
  Cog,
  Heart,
  UtensilsCrossed,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isAtLeast } from '@/lib/permissions'
import type { UserRole } from '@/lib/permissions'
import StoreSwitcher from '@/components/StoreSwitcher'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { useState } from 'react'

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
    title: 'Utama',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Kasir (POS)', href: '/dashboard/pos', icon: ShoppingCart },
    ],
  },
  {
    title: 'Katalog',
    items: [
      { label: 'Produk', href: '/dashboard/products', icon: Package },
      { label: 'Varian', href: '/dashboard/variants', icon: GitFork },
      { label: 'Kategori', href: '/dashboard/categories', icon: Tag },
    ],
  },
  {
    title: 'Penjualan',
    items: [
      { label: 'Pesanan', href: '/dashboard/orders', icon: Receipt },
      { label: 'Meja', href: '/dashboard/tables', icon: UtensilsCrossed },
      { label: 'Pelanggan', href: '/dashboard/customers', icon: Users },
      { label: 'Diskon', href: '/dashboard/discounts', icon: Percent },
      { label: 'Loyalitas', href: '/dashboard/loyalty', icon: Heart },
    ],
  },
  {
    title: 'Operasional',
    items: [
      { label: 'Stok', href: '/dashboard/inventory', icon: Boxes },
      { label: 'Purchase Orders', href: '/dashboard/purchase-orders', icon: FileText },
      { label: 'Supplier', href: '/dashboard/suppliers', icon: Truck },
      { label: 'Shift & Kas', href: '/dashboard/shifts', icon: Clock },
      { label: 'Pengeluaran', href: '/dashboard/expenses', icon: TrendingDown },
      { label: 'Akuntansi', href: '/dashboard/accounting', icon: BarChart3 },
      { label: 'Laporan', href: '/dashboard/reports', icon: BarChart3 },
      { label: 'Manufaktur', href: '/dashboard/manufacturing', icon: Cog },
    ],
  },
  {
    title: 'Manajemen',
    minRole: 'MANAGER',
    items: [
      { label: 'Franchise', href: '/dashboard/franchise', icon: Building2 },
      { label: 'CRM Pipeline', href: '/dashboard/crm', icon: Users },
      { label: 'SDM & Penggajian', href: '/dashboard/hr', icon: UserCog },
      { label: 'Staf', href: '/dashboard/staff', icon: UserCog },
      { label: 'Toko', href: '/dashboard/stores', icon: Store },
    ],
  },
  {
    title: 'Sistem',
    superAdminOnly: true,
    items: [{ label: 'Tenant', href: '/admin/tenants', icon: Building2 }],
  },
]

interface SidebarProps {
  userRole: UserRole
  isSuperAdmin: boolean
  userName?: string
  userEmail?: string | null
  open: boolean
  onClose: () => void
  modules?: string[]
  stores?: { id: string; name: string; address?: string; currency?: string }[]
  currentStoreId?: string
  onStoreChange?: (storeId: string) => void
}

function NavGroupSection({
  group,
  isActive,
  onClose,
  filterItems,
}: {
  group: NavGroup
  isActive: (href: string) => boolean
  onClose: () => void
  filterItems: (items: NavItem[]) => NavItem[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const visibleItems = filterItems(group.items)
  if (visibleItems.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setCollapsed(v => !v)}
        className="mb-1.5 flex w-full items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-widest text-indigo-300/60 hover:text-indigo-200/80 transition-colors"
      >
        <span>{group.title}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform duration-200',
            collapsed && '-rotate-90',
          )}
        />
      </button>
      {!collapsed && (
        <ul className="space-y-0.5">
          {visibleItems.map(item => {
            const active = isActive(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
                    active
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/40'
                      : 'text-slate-400 hover:bg-[var(--bg-card)]/5 hover:text-slate-100',
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-[17px] w-[17px] shrink-0',
                      active ? 'text-white' : 'text-slate-500',
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-300/70" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function Sidebar({
  userRole,
  isSuperAdmin,
  userName,
  userEmail,
  open,
  onClose,
  modules,
  stores = [],
  currentStoreId,
  onStoreChange,
}: SidebarProps) {
  const pathname = usePathname()
  const enabledModules = modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports']

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  function canSeeGroup(group: NavGroup): boolean {
    if (group.superAdminOnly) return isSuperAdmin
    if (group.minRole) return isAtLeast(userRole, group.minRole)
    return true
  }

  function filterItems(items: NavItem[]): NavItem[] {
    return items.filter(item => {
      if (item.href === '/dashboard/pos') return enabledModules.includes('pos')
      if (item.href === '/dashboard/inventory') return enabledModules.includes('inventory')
      if (item.href === '/dashboard/customers') return enabledModules.includes('customers')
      if (item.href === '/dashboard/discounts') return enabledModules.includes('discounts')
      if (item.href === '/dashboard/reports') return enabledModules.includes('reports')
      return true
    })
  }

  const initials = (userName ?? 'U')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login'
    })
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#0f172a] dark:bg-[#0a0f1e]">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
        <a href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-900/50">
            <ShoppingBag className="h-4.5 w-4.5 text-white" strokeWidth={2.5} style={{ width: 18, height: 18 }} />
          </div>
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-lg font-bold tracking-tight text-transparent">
            Lakoo
          </span>
        </a>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-[var(--bg-card)]/5 hover:text-slate-300 lg:hidden"
          aria-label="Tutup sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Store switcher */}
      {stores.length > 0 && (
        <div className="border-b border-white/5 px-4 pt-3 pb-2">
          <StoreSwitcher
            stores={stores}
            currentStoreId={currentStoreId ?? stores[0]?.id}
            onSwitch={id => {
              onStoreChange?.(id)
              onClose()
            }}
          />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.filter(canSeeGroup).map(group => (
          <NavGroupSection
            key={group.title}
            group={group}
            isActive={isActive}
            onClose={onClose}
            filterItems={filterItems}
          />
        ))}
      </nav>

      {/* Settings */}
      <div className="px-3 pb-2">
        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
            pathname.startsWith('/dashboard/settings')
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/40'
              : 'text-slate-400 hover:bg-[var(--bg-card)]/5 hover:text-slate-100',
          )}
        >
          <Settings
            className={cn(
              'h-[17px] w-[17px] shrink-0',
              pathname.startsWith('/dashboard/settings') ? 'text-white' : 'text-slate-500',
            )}
          />
          Pengaturan
        </Link>
      </div>

      {/* User section */}
      <div className="shrink-0 space-y-2 border-t border-white/5 p-3">
        <LocaleSwitcher showName={true} />
        <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-card)]/5 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">
              {userName ?? 'Pengguna'}
            </p>
            {userEmail && <p className="truncate text-xs text-slate-500">{userEmail}</p>}
          </div>
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
            aria-label="Keluar"
            title="Keluar"
          >
            <LogOut className="h-[15px] w-[15px]" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside
        className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col lg:flex"
        aria-label="Navigasi utama"
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside
            className="relative z-50 flex h-full w-72 flex-col shadow-2xl"
            aria-label="Navigasi utama"
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
