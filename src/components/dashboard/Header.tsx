'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronDown, Store, User, LogOut, Menu, Settings, AlertTriangle, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/permissions'

interface StoreOption { id: string; name: string }

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
  id: string; name: string; stock: number; lowStock: number; sku?: string | null
}

const ROLE_LABELS: Record<UserRole, { label: string; className: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', className: 'bg-violet-100 text-violet-700 border border-violet-200' },
  OWNER:       { label: 'Pemilik',     className: 'bg-amber-100 text-amber-700 border border-amber-200' },
  MANAGER:     { label: 'Manajer',     className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  CASHIER:     { label: 'Kasir',       className: 'bg-stone-100 text-stone-600 border border-stone-200' },
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':            'Dashboard',
  '/dashboard/pos':        'Kasir (POS)',
  '/dashboard/products':   'Produk',
  '/dashboard/categories': 'Kategori',
  '/dashboard/variants':   'Varian Produk',
  '/dashboard/orders':     'Pesanan',
  '/dashboard/customers':  'Pelanggan',
  '/dashboard/discounts':  'Diskon',
  '/dashboard/inventory':  'Stok & Inventori',
  '/dashboard/reports':    'Laporan',
  '/dashboard/staff':      'Staf',
  '/dashboard/stores':     'Toko',
  '/dashboard/settings':   'Pengaturan',
  '/dashboard/expenses':   'Pengeluaran',
  '/dashboard/shifts':     'Shift & Kas',
  '/admin/tenants':        'Tenant',
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

export function Header({ userName, userEmail, userImage, userRole, stores, currentStoreId, onStoreChange, onMenuToggle }: HeaderProps) {
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

  const currentStore = stores.find(s => s.id === currentStoreId) ?? stores[0]
  const roleStyle = ROLE_LABELS[userRole] ?? ROLE_LABELS.CASHIER
  const storeId = currentStore?.id

  const { data: lowStockItems = [] } = useQuery<LowStockProduct[]>({
    queryKey: ['low-stock-alerts', storeId],
    queryFn: () => storeId
      ? fetch(`/api/inventory?storeId=${storeId}&lowStockOnly=true`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!storeId,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  })
  const alertCount = lowStockItems.length

  const pageTitle = PAGE_TITLES[pathname] ?? 'Dashboard'
  const initials = userName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const handleLogout = () => { fetch('/api/auth/logout', { method: 'POST' }).then(() => { window.location.href = '/login' }) }

  return (
    <header className="h-14 bg-white border-b border-stone-100 flex items-center px-4 gap-3 shrink-0 sticky top-0 z-30">
      <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors" aria-label="Buka menu">
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden lg:block">
        <h1 className="text-sm font-semibold text-stone-800">{pageTitle}</h1>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {/* Store selector */}
        {stores.length > 0 && (
          <div ref={storeRef} className="relative hidden sm:block">
            <button
              onClick={() => setStoreOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-50 border border-stone-200 text-sm text-stone-600 hover:text-stone-800 hover:bg-stone-100 hover:border-stone-300 transition-all"
            >
              <Store className="h-3.5 w-3.5 text-stone-400 shrink-0" />
              <span className="max-w-[120px] truncate text-xs font-medium">{currentStore?.name ?? 'Pilih toko'}</span>
              {stores.length > 1 && <ChevronDown className={cn('h-3 w-3 text-stone-400 shrink-0 transition-transform', storeOpen && 'rotate-180')} />}
            </button>
            {storeOpen && stores.length > 1 && (
              <div className="absolute top-full right-0 mt-1.5 w-52 bg-white rounded-xl border border-stone-200 shadow-lg shadow-stone-100 py-1 z-50">
                {stores.map(store => (
                  <button key={store.id} onClick={() => { onStoreChange?.(store.id); setStoreOpen(false) }}
                    className={cn('w-full text-left px-4 py-2 text-sm hover:bg-stone-50 transition-colors', store.id === currentStore?.id ? 'text-amber-600 font-medium' : 'text-stone-600 hover:text-stone-800')}>
                    {store.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button onClick={() => setNotifOpen(v => !v)}
            className="relative p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            aria-label="Notifikasi"
          >
            <Bell style={{ width: 18, height: 18 }} />
            {alertCount > 0 ? (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center leading-none">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            ) : (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-stone-300 rounded-full" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-80 bg-white rounded-xl border border-stone-200 shadow-lg shadow-stone-100 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-800">Notifikasi</p>
                {alertCount > 0 && <span className="text-xs text-amber-600 font-medium">{alertCount} peringatan</span>}
              </div>

              {alertCount === 0 ? (
                <div className="py-8 text-center">
                  <Bell className="h-7 w-7 text-stone-200 mx-auto mb-2" />
                  <p className="text-xs text-stone-400">Tidak ada notifikasi baru</p>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-600 font-medium">Peringatan stok menipis</p>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-stone-100">
                    {lowStockItems.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-stone-700 truncate">{p.name}</p>
                          {p.sku && <p className="text-xs text-stone-400">{p.sku}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn('text-sm font-bold', p.stock === 0 ? 'text-red-500' : 'text-amber-500')}>
                            {p.stock === 0 ? 'Habis' : p.stock}
                          </p>
                          <p className="text-[10px] text-stone-400">min. {p.lowStock}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 border-t border-stone-100">
                    <Link href="/dashboard/inventory" onClick={() => setNotifOpen(false)}
                      className="text-xs text-amber-600 hover:text-amber-700 transition-colors font-medium">
                      Lihat semua stok →
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button onClick={() => setUserOpen(v => !v)}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            aria-label="Menu pengguna"
          >
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userImage} alt={userName} className="w-7 h-7 rounded-full object-cover ring-1 ring-stone-200" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
            )}
            <span className="hidden md:block text-xs font-medium text-stone-600 max-w-[100px] truncate">{userName}</span>
            <ChevronDown className={cn('hidden md:block h-3 w-3 text-stone-400 shrink-0 transition-transform', userOpen && 'rotate-180')} />
          </button>

          {userOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-56 bg-white rounded-xl border border-stone-200 shadow-lg shadow-stone-100 py-1 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <p className="text-sm font-semibold text-stone-800 truncate">{userName}</p>
                {userEmail && <p className="text-xs text-stone-400 truncate mt-0.5">{userEmail}</p>}
                <span className={cn('inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-medium', roleStyle.className)}>
                  {roleStyle.label}
                </span>
              </div>

              <Link href="/dashboard/profile" onClick={() => setUserOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-stone-500 hover:text-stone-800 hover:bg-stone-50 transition-colors">
                <User className="h-4 w-4 text-stone-400" /> Profil
              </Link>

              <Link href="/dashboard/settings" onClick={() => setUserOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-stone-500 hover:text-stone-800 hover:bg-stone-50 transition-colors">
                <Settings className="h-4 w-4 text-stone-400" /> Pengaturan
              </Link>

              <div className="border-t border-stone-100 mt-1 pt-1">
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-stone-500 hover:text-red-600 hover:bg-red-50 transition-colors">
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
