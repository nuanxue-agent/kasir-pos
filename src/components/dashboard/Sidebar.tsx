'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, Tag, Receipt,
  Users, Percent, Boxes, BarChart3, UserCog, Store,
  Building2, Settings, LogOut, X, ShoppingBag,
  TrendingDown, Clock, GitFork, FileText, Truck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isAtLeast } from '@/lib/permissions'
import type { UserRole } from '@/lib/permissions'

interface NavItem { label: string; href: string; icon: React.ComponentType<{ className?: string }> }
interface NavGroup { title: string; items: NavItem[]; minRole?: Parameters<typeof isAtLeast>[1]; superAdminOnly?: boolean }

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Utama',
    items: [
      { label: 'Dashboard',    href: '/dashboard',      icon: LayoutDashboard },
      { label: 'Kasir (POS)',  href: '/dashboard/pos',  icon: ShoppingCart },
    ],
  },
  {
    title: 'Katalog',
    items: [
      { label: 'Produk',    href: '/dashboard/products',   icon: Package },
      { label: 'Varian',    href: '/dashboard/variants',   icon: GitFork },
      { label: 'Kategori',  href: '/dashboard/categories', icon: Tag },
    ],
  },
  {
    title: 'Penjualan',
    items: [
      { label: 'Pesanan',     href: '/dashboard/orders',    icon: Receipt },
      { label: 'Pelanggan',   href: '/dashboard/customers', icon: Users },
      { label: 'Diskon',      href: '/dashboard/discounts', icon: Percent },
    ],
  },
  {
    title: 'Operasional',
    items: [
      { label: 'Stok',        href: '/dashboard/inventory', icon: Boxes },
      { label: 'Purchase Orders', href: '/dashboard/purchase-orders', icon: FileText },
      { label: 'Supplier',    href: '/dashboard/suppliers', icon: Truck },
      { label: 'Shift & Kas', href: '/dashboard/shifts',    icon: Clock },
      { label: 'Pengeluaran', href: '/dashboard/expenses',  icon: TrendingDown },
      { label: 'Akuntansi',   href: '/dashboard/accounting', icon: BarChart3 },
      { label: 'Laporan',     href: '/dashboard/reports',   icon: BarChart3 },
    ],
  },
  {
    title: 'Manajemen',
    minRole: 'MANAGER',
    items: [
      { label: 'SDM & Penggajian', href: '/dashboard/hr', icon: UserCog },
      { label: 'Staf',        href: '/dashboard/staff',  icon: UserCog },
      { label: 'Toko',        href: '/dashboard/stores', icon: Store },
    ],
  },
  {
    title: 'Sistem',
    superAdminOnly: true,
    items: [
      { label: 'Tenant',      href: '/admin/tenants', icon: Building2 },
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
  modules?: string[]
}

export function Sidebar({ userRole, isSuperAdmin, userName, userEmail, open, onClose, modules }: SidebarProps) {
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
      if (item.href === '/dashboard/pos')        return enabledModules.includes('pos')
      if (item.href === '/dashboard/inventory')  return enabledModules.includes('inventory')
      if (item.href === '/dashboard/customers')  return enabledModules.includes('customers')
      if (item.href === '/dashboard/discounts')  return enabledModules.includes('discounts')
      if (item.href === '/dashboard/reports')    return enabledModules.includes('reports')
      return true
    })
  }

  const initials = (userName ?? 'U').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => { window.location.href = '/login' })
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-stone-100">
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 shrink-0 border-b border-stone-100">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-200">
            <ShoppingBag className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-stone-800 font-bold text-base tracking-tight">Lakoo</span>
        </a>
        <button
          onClick={onClose}
          className="lg:hidden text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"
          aria-label="Tutup sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV_GROUPS.filter(canSeeGroup).map((group) => {
            const visibleItems = filterItems(group.items)
            if (visibleItems.length === 0) return null
            return (
          <div key={group.title}>
            <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {visibleItems.map((item) => {
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                      )}
                    >
                      <item.icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-amber-500' : 'text-stone-400')} />
                      <span className="truncate">{item.label}</span>
                      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
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
            'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
            pathname.startsWith('/dashboard/settings')
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
          )}
        >
          <Settings className={cn('h-[18px] w-[18px] shrink-0', pathname.startsWith('/dashboard/settings') ? 'text-amber-500' : 'text-stone-400')} />
          Pengaturan
        </Link>
      </div>

      {/* User section */}
      <div className="shrink-0 border-t border-stone-100 p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-stone-50">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-stone-800 truncate">{userName ?? 'Pengguna'}</p>
            {userEmail && <p className="text-xs text-stone-400 truncate">{userEmail}</p>}
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
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
      <aside className="hidden lg:flex flex-col w-[240px] shrink-0 h-screen sticky top-0" aria-label="Navigasi utama">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <aside className="relative z-50 w-[240px] h-full flex flex-col shadow-2xl" aria-label="Navigasi utama">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
