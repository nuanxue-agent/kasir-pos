'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ShoppingCart, Plus, Minus, X, ImageIcon, Loader2 } from 'lucide-react'

interface PublicMenu {
  id: string
  name: string
  primaryColor: string
  logoUrl: string | null
  welcomeMessage: string | null
}

interface PublicMenuItem {
  id: string
  menuId: string
  productId: string
  displayName: string | null
  description: string | null
  imageUrl: string | null
  price: number
  sortOrder: number
  categoryId: string | null
}

interface CartItem extends PublicMenuItem {
  qty: number
}

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

function groupByCategory(items: PublicMenuItem[]): Record<string, PublicMenuItem[]> {
  return items.reduce<Record<string, PublicMenuItem[]>>((acc, item) => {
    const key = item.categoryId ?? 'Lainnya'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
}

export default function PublicMenuPage() {
  const { menuId } = useParams<{ menuId: string }>()
  const [menu, setMenu] = useState<PublicMenu | null>(null)
  const [items, setItems] = useState<PublicMenuItem[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [ordered, setOrdered] = useState(false)

  useEffect(() => {
    if (!menuId) return
    fetch(`/api/digital-menus/${menuId}/public`)
      .then(r => r.json() as Promise<any>)
      .then(data => {
        if (data.error) { setError(data.error); return }
        setMenu(data.menu)
        setItems(data.items ?? [])
      })
      .catch(() => setError('Gagal memuat menu'))
      .finally(() => setLoading(false))
  }, [menuId])

  function addToCart(item: PublicMenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...item, qty: 1 }]
    })
  }

  function changeQty(id: string, delta: number) {
    setCart(prev => {
      const next = prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
      return next.filter(c => c.qty > 0)
    })
  }

  function removeFromCart(id: string) {
    setCart(prev => prev.filter(c => c.id !== id))
  }

  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const grouped = groupByCategory(items)
  const primaryColor = menu?.primaryColor ?? '#4f46e5'

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (error || !menu) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-lg font-semibold text-slate-700">Menu tidak tersedia</p>
        <p className="mt-1 text-sm text-slate-500">{error ?? 'Menu tidak ditemukan'}</p>
      </div>
    )
  }

  if (ordered) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <span className="text-3xl">✓</span>
          </div>
          <p className="text-xl font-bold text-slate-800">Pesanan Diterima!</p>
          <p className="mt-2 text-sm text-slate-500">Silakan tunggu, pesanan Anda sedang diproses.</p>
          <button
            onClick={() => { setOrdered(false); setCart([]) }}
            className="mt-6 rounded-lg px-6 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Pesan Lagi
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Hero header */}
      <div className="px-4 pb-5 pt-6 text-white" style={{ backgroundColor: primaryColor }}>
        {menu.logoUrl && (
          <img src={menu.logoUrl} alt="logo" className="mb-3 h-12 w-12 rounded-xl object-cover" />
        )}
        <h1 className="text-2xl font-bold">{menu.name}</h1>
        {menu.welcomeMessage && (
          <p className="mt-1 text-sm opacity-80">{menu.welcomeMessage}</p>
        )}
      </div>

      {/* Menu items grouped by category */}
      <div className="mx-auto max-w-lg px-4 py-4 space-y-6">
        {Object.keys(grouped).length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">Belum ada menu tersedia</p>
        )}
        {Object.entries(grouped).map(([catId, catItems]) => (
          <div key={catId}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {catId === 'Lainnya' ? 'Lainnya' : catId}
            </h2>
            <div className="space-y-3">
              {catItems.map(item => {
                const inCart = cart.find(c => c.id === item.id)
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                        <ImageIcon className="h-6 w-6 text-slate-300" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {item.displayName ?? item.productId}
                      </p>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</p>
                      )}
                      <p className="mt-1 text-sm font-bold" style={{ color: primaryColor }}>
                        {formatRp(item.price)}
                      </p>
                    </div>
                    {inCart ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => changeQty(item.id, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-5 text-center text-sm font-semibold">{inCart.qty}</span>
                        <button
                          onClick={() => changeQty(item.id, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && !showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed bottom-6 left-1/2 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-center justify-between rounded-xl px-5 py-4 text-white shadow-xl"
          style={{ backgroundColor: primaryColor }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
            {cartCount}
          </span>
          <span className="text-sm font-semibold">Lihat Pesanan</span>
          <span className="text-sm font-bold">{formatRp(cartTotal)}</span>
        </button>
      )}

      {/* Cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCart(false)} />
          <div className="relative w-full max-w-lg rounded-t-2xl bg-white px-4 pb-8 pt-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Pesanan Anda
              </p>
              <button onClick={() => setShowCart(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-3">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {item.displayName ?? item.productId}
                    </p>
                    <p className="text-xs text-slate-500">{formatRp(item.price)} × {item.qty}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{formatRp(item.price * item.qty)}</p>
                  <button onClick={() => removeFromCart(item.id)}>
                    <X className="h-4 w-4 text-slate-300 hover:text-red-400" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-700">Total</p>
              <p className="text-base font-bold text-slate-900">{formatRp(cartTotal)}</p>
            </div>
            <button
              onClick={() => { setShowCart(false); setOrdered(true) }}
              className="mt-4 w-full rounded-xl py-3 text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              Pesan Sekarang
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
