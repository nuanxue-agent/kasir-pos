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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isAtLeast } from '@/lib/permissions'
import type { UserRole } from '@/lib/permissions'
import StoreSwitcher from '@/components/StoreSwitcher'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'

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

  // Filter nav items by module
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
    <div className="flex h-full flex-col border-r border-[var(--border)] bg-[var(--bg-card)]">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <a href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm shadow-amber-200/60">
            <ShoppingBag className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-base font-bold tracking-tight text-[var(--text-1)]">Lakoo</span>
        </a>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)] lg:hidden"
          aria-label="Tutup sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Store switcher */}
      {stores.length > 0 && (
        <div className="border-b border-[var(--border)] px-3 pt-3 pb-1">
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
        {NAV_GROUPS.filter(canSeeGroup).map(group => {
          const visibleItems = filterItems(group.items)
          if (visibleItems.length === 0) return null
          return (
            <div key={group.title}>
              <p className="mb-1.5 px-2 text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {visibleItems.map(item => {
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                          active
                            ? 'border border-amber-200/60 bg-[var(--primary-subtle)] text-amber-700'
                            : 'text-[var(--text-2)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]',
                        )}
                      >
                        <item.icon
                          className={cn(
                            'h-[17px] w-[17px] shrink-0',
                            active ? 'text-amber-600' : 'text-[var(--text-3)]',
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                        {active && (
                          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/70" />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* Settings */}
      <div className="px-3 pb-2">
        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
            pathname.startsWith('/dashboard/settings')
              ? 'border border-amber-200/60 bg-[var(--primary-subtle)] text-amber-700'
              : 'text-[var(--text-2)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]',
          )}
        >
          <Settings
            className={cn(
              'h-[17px] w-[17px] shrink-0',
              pathname.startsWith('/dashboard/settings')
                ? 'text-amber-600'
                : 'text-[var(--text-3)]',
            )}
          />
          Pengaturan
        </Link>
      </div>

      {/* User section */}
      <div className="shrink-0 space-y-2 border-t border-[var(--border)] p-3">
        <LocaleSwitcher showName={true} />
        <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-subtle)] px-2 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--text-1)]">
              {userName ?? 'Pengguna'}
            </p>
            {userEmail && <p className="truncate text-xs text-[var(--text-3)]">{userEmail}</p>}
          </div>
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-[var(--text-3)] transition-colors hover:bg-red-50 hover:text-red-500"
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
        className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col lg:flex"
        aria-label="Navigasi utama"
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside
            className="relative z-50 flex h-full w-[240px] flex-col shadow-2xl"
            aria-label="Navigasi utama"
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
