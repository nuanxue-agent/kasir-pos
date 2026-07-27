'use client'

import { useState, useRef, useEffect } from 'react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'
import {
  Bell,
  Search,
  ChevronDown,
  Store,
  User,
  LogOut,
  Menu,
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
  SUPER_ADMIN: { label: 'Super Admin', className: 'bg-purple-100 text-purple-700' },
  OWNER:       { label: 'Owner',       className: 'bg-blue-100 text-blue-700' },
  MANAGER:     { label: 'Manager',     className: 'bg-green-100 text-green-700' },
  CASHIER:     { label: 'Cashier',     className: 'bg-gray-100 text-gray-600' },
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
  const [storeOpen, setStoreOpen]   = useState(false)
  const [userOpen, setUserOpen]     = useState(false)
  const [notifOpen, setNotifOpen]   = useState(false)

  const storeRef = useRef<HTMLDivElement>(null)
  const userRef  = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  useClickOutside(storeRef, () => setStoreOpen(false))
  useClickOutside(userRef,  () => setUserOpen(false))
  useClickOutside(notifRef, () => setNotifOpen(false))

  const currentStore = stores.find((s) => s.id === currentStoreId) ?? stores[0]
  const roleStyle = ROLE_LABELS[userRole] ?? ROLE_LABELS.CASHIER

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center px-4 gap-3 shrink-0 sticky top-0 z-30">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Store selector */}
      {stores.length > 0 && (
        <div ref={storeRef} className="relative hidden sm:block">
          <button
            onClick={() => setStoreOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
          >
            <Store className="h-4 w-4 text-gray-400" />
            <span className="max-w-[140px] truncate font-medium">
              {currentStore?.name ?? 'Select store'}
            </span>
            {stores.length > 1 && <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
          </button>

          {storeOpen && stores.length > 1 && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-xl border border-gray-100 shadow-lg py-1 z-50">
              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => {
                    onStoreChange?.(store.id)
                    setStoreOpen(false)
                  }}
                  className={cn(
                    'w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors',
                    store.id === currentStore?.id
                      ? 'text-indigo-600 font-medium'
                      : 'text-gray-700'
                  )}
                >
                  {store.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="flex-1 max-w-md">
        <label className="sr-only" htmlFor="global-search">Search</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            id="global-search"
            type="search"
            placeholder="Search products, orders…"
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {/* Unread badge placeholder */}
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full" />
          </button>

          {notifOpen && (
            <div className="absolute top-full right-0 mt-1 w-72 bg-white rounded-xl border border-gray-100 shadow-lg z-50">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-800">Notifications</p>
              </div>
              <div className="py-6 text-center">
                <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No new notifications</p>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="User menu"
          >
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt={userName}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                {initials}
              </div>
            )}
            <span className="hidden md:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
              {userName}
            </span>
            <ChevronDown className="hidden md:block h-3.5 w-3.5 text-gray-400 shrink-0" />
          </button>

          {userOpen && (
            <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-xl border border-gray-100 shadow-lg py-1 z-50">
              {/* User info */}
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-800 truncate">{userName}</p>
                {userEmail && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{userEmail}</p>
                )}
                <span
                  className={cn(
                    'inline-block mt-1.5 px-2 py-0.5 rounded text-xs font-medium',
                    roleStyle.className
                  )}
                >
                  {roleStyle.label}
                </span>
              </div>

              <Link
                href="/dashboard/profile"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="h-4 w-4 text-gray-400" />
                Profile
              </Link>

              <div className="border-t border-gray-50 mt-1 pt-1">
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
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
