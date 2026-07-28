'use client'

import { useEffect, useState, useCallback } from 'react'
import { use } from 'react'
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Loader2, ImageIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuCategory {
  id: string
  name: string
  displayOrder: number
  imageUrl: string | null
}

interface MenuItemPublic {
  id: string
  categoryId: string
  productId: string
  productName: string
  productPrice: number
  productImage: string | null
  featured: boolean
  displayOrder: number
}

interface CartItem {
  menuItemId: string
  productId: string
  name: string
  price: number
  image: string | null
  qty: number
}

type OrderStatus = 'idle' | 'submitting' | 'success' | 'error'

function sortByOrder<T extends { displayOrder: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.displayOrder - b.displayOrder)
}

// ─── Cart panel ───────────────────────────────────────────────────────────────

function CartPanel({
  cart,
  onUpdateQty,
  onRemove,
  onSubmit,
  submitting,
  tableNumber,
  onTableChange,
}: {
  cart: CartItem[]
  onUpdateQty: (menuItemId: string, delta: number) => void
  onRemove: (menuItemId: string) => void
  onSubmit: () => void
  submitting: boolean
  tableNumber: string
  onTableChange: (v: string) => void
}) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Pesanan Saya</h2>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
          {cart.reduce((s, i) => s + i.qty, 0)} item
        </span>
      </div>

      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-slate-400">
          <ShoppingCart className="h-10 w-10 text-slate-200" />
          <p className="text-sm">Keranjang kosong</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {cart.map(item => (
            <div key={item.menuItemId} className="flex items-center gap-3 px-4 py-3">
              {item.image ? (
                <img src={item.image} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <ImageIcon className="h-5 w-5 text-slate-300" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{item.name}</p>
                <p className="text-xs text-indigo-600">Rp {item.price.toLocaleString('id-ID')}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onUpdateQty(item.menuItemId, -1)}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                <button
                  onClick={() => onUpdateQty(item.menuItemId, 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <button onClick={() => onRemove(item.menuItemId)} className="text-slate-300 hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-3">
          <input
            value={tableNumber}
            onChange={e => onTableChange(e.target.value)}
            placeholder="Nomor meja (opsional)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Total</span>
            <span className="font-bold text-slate-800">Rp {total.toLocaleString('id-ID')}</span>
          </div>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Kirim Pesanan
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Success overlay ──────────────────────────────────────────────────────────

function SuccessOverlay({ onReset }: { onReset: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Pesanan Terkirim!</h2>
        <p className="mt-2 text-sm text-slate-500">Pesanan Anda sedang diproses. Silakan tunggu konfirmasi dari kasir.</p>
        <button
          onClick={onReset}
          className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Pesan Lagi
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PublicMenuPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = use(params)

  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItemPublic[]>([])
  const [storeName, setStoreName] = useState('')
  const [storeId, setStoreId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [tableNumber, setTableNumber] = useState('')
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // ── Load menu ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchMenu() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/menu/${storeSlug}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({} as {error?:string})) as {error?:string}
          throw new Error(data.error ?? 'Menu tidak ditemukan')
        }
        const data = await res.json() as any
        setCategories(data.categories ?? [])
        setItems(data.items ?? [])
        setStoreName(data.storeName ?? '')
        setStoreId(data.storeId ?? '')
        if (data.categories?.length) setActiveCategory(data.categories[0].id)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchMenu()
  }, [storeSlug])

  // ── Cart ops ───────────────────────────────────────────────────────────────

  function addToCart(item: MenuItemPublic) {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id)
      if (existing) {
        return prev.map(c => c.menuItemId === item.id ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, {
        menuItemId: item.id,
        productId: item.productId,
        name: item.productName,
        price: item.productPrice,
        image: item.productImage,
        qty: 1,
      }]
    })
  }

  function updateQty(menuItemId: string, delta: number) {
    setCart(prev =>
      prev
        .map(c => c.menuItemId === menuItemId ? { ...c, qty: c.qty + delta } : c)
        .filter(c => c.qty > 0)
    )
  }

  function removeFromCart(menuItemId: string) {
    setCart(prev => prev.filter(c => c.menuItemId !== menuItemId))
  }

  async function submitOrder() {
    if (cart.length === 0) return
    setOrderStatus('submitting')
    setSubmitError(null)
    try {
      const total = cart.reduce((s, i) => s + i.price * i.qty, 0)
      const res = await fetch('/api/kiosk-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          tableNumber: tableNumber || null,
          items: cart.map(c => ({ productId: c.productId, name: c.name, price: c.price, qty: c.qty })),
          total,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as {error?:string})) as {error?:string}
        throw new Error(data.error ?? 'Gagal mengirim pesanan')
      }
      setOrderStatus('success')
    } catch (e: any) {
      setSubmitError(e.message)
      setOrderStatus('error')
    }
  }

  function resetAfterSuccess() {
    setCart([])
    setTableNumber('')
    setCartOpen(false)
    setOrderStatus('idle')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const sortedCategories = sortByOrder(categories)
  const visibleItems = activeCategory ? items.filter(i => i.categoryId === activeCategory) : items

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="rounded-2xl bg-white p-8 shadow-sm max-w-sm w-full">
          <p className="text-4xl mb-4">😕</p>
          <h1 className="text-lg font-bold text-slate-800">Menu Tidak Ditemukan</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {orderStatus === 'success' && <SuccessOverlay onReset={resetAfterSuccess} />}

      {/* Hero */}
      <div className="bg-indigo-600 px-4 pb-6 pt-8 text-white">
        <h1 className="text-2xl font-bold">{storeName || 'Menu'}</h1>
        <p className="mt-1 text-sm text-indigo-200">Pilih menu favorit Anda</p>
      </div>

      {/* Category tabs */}
      {sortedCategories.length > 0 && (
        <div className="sticky top-0 z-10 overflow-x-auto bg-white shadow-sm">
          <div className="flex gap-1 px-4 py-2">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                activeCategory === null
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              Semua
            </button>
            {sortedCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  activeCategory === cat.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items grid */}
      <div className="p-4 pb-28">
        {visibleItems.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">Tidak ada item tersedia</div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {sortByOrder(visibleItems).map(item => {
            const inCart = cart.find(c => c.menuItemId === item.id)
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100"
              >
                {item.productImage ? (
                  <img src={item.productImage} alt={item.productName} className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-slate-100">
                    <ImageIcon className="h-8 w-8 text-slate-300" />
                  </div>
                )}
                <div className="p-3">
                  {item.featured && (
                    <span className="mb-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      ★ Unggulan
                    </span>
                  )}
                  <p className="text-sm font-medium text-slate-800 line-clamp-2">{item.productName}</p>
                  <p className="mt-1 text-sm font-bold text-indigo-600">
                    Rp {item.productPrice.toLocaleString('id-ID')}
                  </p>
                  {inCart ? (
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        onClick={() => updateQty(item.id, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-semibold">{inCart.qty}</span>
                      <button
                        onClick={() => updateQty(item.id, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(item)}
                      className="mt-2 w-full flex items-center justify-center gap-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Tambah
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 z-30">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full max-w-sm items-center justify-between rounded-2xl bg-indigo-600 px-5 py-3.5 text-white shadow-lg hover:bg-indigo-700"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              <span className="font-semibold">{cartCount} item</span>
            </span>
            <span className="font-bold">
              Rp {cart.reduce((s, i) => s + i.price * i.qty, 0).toLocaleString('id-ID')}
            </span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40" onClick={() => setCartOpen(false)}>
          <div
            className="max-h-[80vh] w-full overflow-hidden rounded-t-2xl bg-white flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setCartOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
            {submitError && (
              <div className="px-4 pt-3">
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{submitError}</div>
              </div>
            )}
            <CartPanel
              cart={cart}
              onUpdateQty={updateQty}
              onRemove={removeFromCart}
              onSubmit={submitOrder}
              submitting={orderStatus === 'submitting'}
              tableNumber={tableNumber}
              onTableChange={setTableNumber}
            />
          </div>
        </div>
      )}
    </div>
  )
}
