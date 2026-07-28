'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Store, User, LogOut, Menu, Settings, Bell, Search, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/permissions'
import { NotificationCenter } from '@/components/ui/NotificationCenter'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { countUnread, loadNotifications } from '@/components/ui/NotificationCenter'

interface StoreOption {
  id: string
  name: string
  [key: string]: unknown
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

interface LowStockProduct {
  id: string
  name: string
  stock: number
  lowStock: number
  sku?: string | null
}

const ROLE_LABELS: Record<UserRole, { label: string; className: string }> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    className: 'bg-violet-100 text-violet-700 border border-violet-200',
  },
  OWNER: { label: 'Pemilik', className: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
  MANAGER: {
    label: 'Manajer',
    className: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
  CASHIER: { label: 'Kasir', className: 'bg-slate-100 text-slate-600 border border-slate-200' },
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/pos': 'Kasir (POS)',
  '/dashboard/products': 'Produk',
  '/dashboard/categories': 'Kategori',
  '/dashboard/variants': 'Varian Produk',
  '/dashboard/orders': 'Pesanan',
  '/dashboard/customers': 'Pelanggan',
  '/dashboard/discounts': 'Diskon',
  '/dashboard/inventory': 'Stok & Inventori',
  '/dashboard/reports': 'Laporan',
  '/dashboard/staff': 'Staf',
  '/dashboard/stores': 'Toko',
  '/dashboard/settings': 'Pengaturan',
  '/dashboard/expenses': 'Pengeluaran',
  '/dashboard/shifts': 'Shift & Kas',
  '/dashboard/notifications': 'Notifikasi',
  '/admin/tenants': 'Tenant',
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

function Breadcrumb({ pathname }: { pathname: string }) {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length <= 1) return null

  return (
    <nav className="hidden items-center gap-1 text-xs text-[var(--text-3)] md:flex" aria-label="Breadcrumb">
      <Link href="/dashboard" className="flex items-center gap-1 transition-colors hover:text-[var(--text-2)]">
        <Home className="h-3 w-3" />
      </Link>
      {segments.slice(1).map((seg, i) => {
        const href = '/' + segments.slice(0, i + 2).join('/')
        const label = PAGE_TITLES[href] ?? seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        const isLast = i === segments.length - 2
        return (
          <span key={href} className="flex items-center gap-1">
            <span className="text-[var(--border-mid)]">/</span>
            {isLast ? (
              <span className="font-medium text-[var(--text-1)]">{label}</span>
            ) : (
              <Link href={href} className="transition-colors hover:text-[var(--text-2)]">{label}</Link>
            )}
          </span>
        )
      })}
    </nav>
  )
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
  const [userOpen, setUserOpen] = useState(false)

  const storeRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  useClickOutside(storeRef, () => setStoreOpen(false))
  useClickOutside(userRef, () => setUserOpen(false))

  const currentStore = stores.find(s => s.id === currentStoreId) ?? stores[0]
  const roleStyle = ROLE_LABELS[userRole] ?? ROLE_LABELS.CASHIER
  const storeId = currentStore?.id

  const { data: lowStockItems = [] } = useQuery<LowStockProduct[]>({
    queryKey: ['low-stock-alerts', storeId],
    queryFn: () =>
      storeId
        ? fetch(`/api/inventory?storeId=${storeId}&lowStockOnly=true`).then(r => r.json())
        : Promise.resolve([]),
    enabled: !!storeId,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  })
  const alertCount = lowStockItems.length

  const { data: serverUnread = 0 } = useQuery<number>({
    queryKey: ['unread-count', storeId],
    queryFn: async () => {
      if (!storeId) return 0
      try {
        const res = await fetch(`/api/notifications/unread-count?storeId=${storeId}`)
        const json = await res.json()
        return (json as { count: number }).count ?? 0
      } catch {
        return 0
      }
    },
    enabled: !!storeId,
    refetchInterval: 30_000,
    staleTime: 25_000,
  })

  const [localUnread, setLocalUnread] = useState(0)
  useEffect(() => {
    setLocalUnread(countUnread(loadNotifications()))
    const id = setInterval(() => {
      setLocalUnread(countUnread(loadNotifications()))
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  const totalUnread = Math.max(serverUnread, localUnread)

  const pageTitle = PAGE_TITLES[pathname] ?? 'Dashboard'
  const initials = userName
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

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[var(--bg-card)]/70 px-4 backdrop-blur-md dark:border-white/5 dark:bg-[#111827]/80">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-[var(--text-3)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)] lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title / breadcrumb */}
      <div className="hidden lg:block">
        <Breadcrumb pathname={pathname} />
        {pathname === '/dashboard' && (
          <h1 className="text-sm font-semibold text-[var(--text-1)]">{pageTitle}</h1>
        )}
      </div>

      <div className="flex-1" />

      {/* Search bar */}
      <div className="hidden items-center sm:flex">
        <button className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-3)] transition-all hover:border-indigo-300 hover:bg-[var(--bg-card)] hover:text-[var(--text-2)] dark:hover:border-indigo-700">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden w-28 text-left md:block">Cari...</span>
          <kbd className="hidden rounded border border-[var(--border)] bg-[var(--bg-card)] px-1 py-0.5 text-[10px] font-medium text-[var(--text-3)] md:block">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1">
        {/* Store selector */}
        {stores.length > 0 && (
          <div ref={storeRef} className="relative hidden sm:block">
            <button
              onClick={() => setStoreOpen(v => !v)}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-sm text-[var(--text-2)] transition-all hover:border-indigo-300 hover:bg-[var(--bg-card)] hover:text-[var(--text-1)] dark:hover:border-indigo-700"
            >
              <Store className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
              <span className="max-w-[120px] truncate text-xs font-medium">
                {currentStore?.name ?? 'Pilih toko'}
              </span>
              {stores.length > 1 && (
                <ChevronDown
                  className={cn(
                    'h-3 w-3 shrink-0 text-[var(--text-3)] transition-transform',
                    storeOpen && 'rotate-180',
                  )}
                />
              )}
            </button>
            {storeOpen && stores.length > 1 && (
              <div className="absolute top-full right-0 z-50 mt-1.5 w-52 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[var(--shadow-md)]">
                {stores.map(store => (
                  <button
                    key={store.id}
                    onClick={() => {
                      onStoreChange?.(store.id)
                      setStoreOpen(false)
                    }}
                    className={cn(
                      'w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-subtle)]',
                      store.id === currentStore?.id
                        ? 'font-medium text-indigo-600 dark:text-indigo-400'
                        : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
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
        <div className="relative">
          <NotificationCenter
            lowStockProducts={lowStockItems.map(p => ({ id: p.id, name: p.name, stock: p.stock }))}
          />
          {totalUnread > 0 && (
            <Link
              href="/dashboard/notifications"
              className="pointer-events-none absolute top-0.5 right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-0.5 text-[9px] leading-none font-bold text-white"
              aria-label={`${totalUnread} notifikasi belum dibaca`}
            >
              {totalUnread > 9 ? '9+' : totalUnread}
            </Link>
          )}
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setUserOpen(v => !v)}
            className="flex items-center gap-2 rounded-lg py-1.5 pr-2.5 pl-2 transition-colors hover:bg-[var(--bg-subtle)]"
            aria-label="Menu pengguna"
          >
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt={userName}
                className="h-7 w-7 rounded-full object-cover ring-2 ring-indigo-200 dark:ring-indigo-800"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm">
                {initials}
              </div>
            )}
            <span className="hidden max-w-[100px] truncate text-xs font-medium text-[var(--text-2)] md:block">
              {userName}
            </span>
            <ChevronDown
              className={cn(
                'hidden h-3 w-3 shrink-0 text-[var(--text-3)] transition-transform md:block',
                userOpen && 'rotate-180',
              )}
            />
          </button>

          {userOpen && (
            <div className="absolute top-full right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[var(--shadow-lg)]">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <p className="truncate text-sm font-semibold text-[var(--text-1)]">{userName}</p>
                {userEmail && (
                  <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">{userEmail}</p>
                )}
                <span
                  className={cn(
                    'mt-2 inline-block rounded-md px-2 py-0.5 text-[10px] font-medium',
                    roleStyle.className,
                  )}
                >
                  {roleStyle.label}
                </span>
              </div>

              <Link
                href="/dashboard/profile"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
              >
                <User className="h-4 w-4 text-[var(--text-3)]" /> Profil
              </Link>

              <Link
                href="/dashboard/settings"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
              >
                <Settings className="h-4 w-4 text-[var(--text-3)]" /> Pengaturan
              </Link>

              <div className="mt-1 border-t border-[var(--border)] pt-1">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                >
                  <LogOut className="h-4 w-4" /> Keluar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
