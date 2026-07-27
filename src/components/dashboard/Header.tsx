'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  ChevronDown,
  Store,
  User,
  LogOut,
  Menu,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/permissions'

interface StoreOption {
  id: string
  name: string
}

interface HeaderProps {
  userName: string
  userEmail?: string | null
  userImage?: string | null
  userRole: UserRole
  stores: StoreOption[]
  currentStoreId?: string
  onStoreChange?: (storeId: string) => void
  onMenuToggle: () => void
}

const ROLE_LABELS: Record<UserRole, { label: string; className: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', className: 'bg-violet-500/20 text-violet-300 border border-violet-500/20' },
  OWNER:       { label: 'Owner',       className: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20' },
  MANAGER:     { label: 'Manager',     className: 'bg-blue-500/20 text-blue-300 border border-blue-500/20' },
  CASHIER:     { label: 'Cashier',     className: 'bg-white/10 text-white/50 border border-white/10' },
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':            'Dashboard',
  '/dashboard/pos':        'POS Terminal',
  '/dashboard/products':   'Products',
  '/dashboard/categories': 'Categories',
  '/dashboard/orders':     'Orders',
  '/dashboard/customers':  'Customers',
  '/dashboard/discounts':  'Discounts',
  '/dashboard/inventory':  'Inventory',
  '/dashboard/reports':    'Reports',
  '/dashboard/staff':      'Staff',
  '/dashboard/stores':     'Stores',
  '/dashboard/settings':   'Settings',
  '/admin/tenants':        'Tenants',
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}

export function Header({
  userName,
  userEmail,
  userImage,
  userRole,
  stores,
  currentStoreId,
  onStoreChange,
  onMenuToggle,
}: HeaderProps) {
  const pathname = usePathname()
  const [storeOpen, setStoreOpen] = useState(false)
  const [userOpen,  setUserOpen]  = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  const storeRef = useRef<HTMLDivElement>(null)
  const userRef  = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  useClickOutside(storeRef, () => setStoreOpen(false))
  useClickOutside(userRef,  () => setUserOpen(false))
  useClickOutside(notifRef, () => setNotifOpen(false))

  const currentStore = stores.find((s) => s.id === currentStoreId) ?? stores[0]
  const roleStyle = ROLE_LABELS[userRole] ?? ROLE_LABELS.CASHIER

  const pageTitle = PAGE_TITLES[pathname] ?? 'Dashboard'

  const initials = userName
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

  return (
    <header className="h-14 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5 flex items-center px-4 gap-3 shrink-0 sticky top-0 z-30">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <div className="hidden lg:block">
        <h1 className="text-sm font-semibold text-white">{pageTitle}</h1>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-1">

        {/* Store selector */}
        {stores.length > 0 && (
          <div ref={storeRef} className="relative hidden sm:block">
            <button
              onClick={() => setStoreOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all"
            >
              <Store className="h-3.5 w-3.5 text-white/40 shrink-0" />
              <span className="max-w-[120px] truncate text-xs font-medium">
                {currentStore?.name ?? 'Select store'}
              </span>
              {stores.length > 1 && (
                <ChevronDown className={cn(
                  'h-3 w-3 text-white/30 shrink-0 transition-transform',
                  storeOpen && 'rotate-180'
                )} />
              )}
            </button>

            {storeOpen && stores.length > 1 && (
              <div className="absolute top-full right-0 mt-1.5 w-52 bg-[#0d0d14] rounded-xl border border-white/10 shadow-2xl shadow-black/50 py-1 z-50">
                {stores.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => { onStoreChange?.(store.id); setStoreOpen(false) }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors',
                      store.id === currentStore?.id
                        ? 'text-indigo-400 font-medium'
                        : 'text-white/60 hover:text-white'
                    )}
                  >
                    {store.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-indigo-500 rounded-full" />
          </button>

          {notifOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-72 bg-[#0d0d14] rounded-xl border border-white/10 shadow-2xl shadow-black/50 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-sm font-semibold text-white">Notifications</p>
              </div>
              <div className="py-8 text-center">
                <Bell className="h-7 w-7 text-white/10 mx-auto mb-2" />
                <p className="text-xs text-white/30">No new notifications</p>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            aria-label="User menu"
          >
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt={userName}
                className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
            )}
            <span className="hidden md:block text-xs font-medium text-white/70 max-w-[100px] truncate">
              {userName}
            </span>
            <ChevronDown className={cn(
              'hidden md:block h-3 w-3 text-white/30 shrink-0 transition-transform',
              userOpen && 'rotate-180'
            )} />
          </button>

          {userOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-56 bg-[#0d0d14] rounded-xl border border-white/10 shadow-2xl shadow-black/50 py-1 z-50 overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-sm font-semibold text-white truncate">{userName}</p>
                {userEmail && (
                  <p className="text-xs text-white/30 truncate mt-0.5">{userEmail}</p>
                )}
                <span className={cn('inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-medium', roleStyle.className)}>
                  {roleStyle.label}
                </span>
              </div>

              <Link
                href="/dashboard/profile"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                <User className="h-4 w-4 text-white/30" />
                Profile
              </Link>

              <Link
                href="/dashboard/settings"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Settings className="h-4 w-4 text-white/30" />
                Settings
              </Link>

              <div className="border-t border-white/5 mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
