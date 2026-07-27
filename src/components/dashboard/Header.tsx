'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Store, User, LogOut, Menu, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/permissions'
import { NotificationCenter } from '@/components/ui/NotificationCenter'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

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
  OWNER: { label: 'Pemilik', className: 'bg-amber-100 text-amber-700 border border-amber-200' },
  MANAGER: {
    label: 'Manajer',
    className: 'bg-orange-100 text-orange-700 border border-orange-200',
  },
  CASHIER: { label: 'Kasir', className: 'bg-stone-100 text-stone-600 border border-stone-200' },
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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-card)] px-4">
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-[var(--text-3)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)] lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden lg:block">
        <h1 className="text-sm font-semibold text-[var(--text-1)]">{pageTitle}</h1>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {/* Store selector */}
        {stores.length > 0 && (
          <div ref={storeRef} className="relative hidden sm:block">
            <button
              onClick={() => setStoreOpen(v => !v)}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-sm text-[var(--text-2)] transition-all hover:border-[var(--border-mid)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]"
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
                        ? 'font-medium text-amber-600'
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
        <NotificationCenter
          lowStockProducts={lowStockItems.map(p => ({ id: p.id, name: p.name, stock: p.stock }))}
        />

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
                className="h-7 w-7 rounded-full object-cover ring-1 ring-[var(--border-mid)]"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
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
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-red-50 hover:text-red-600"
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
