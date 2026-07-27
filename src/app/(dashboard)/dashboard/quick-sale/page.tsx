'use client'

/**
 * Quick Sale — mobile-optimized kiosk POS page.
 *
 * Designed for tablet/phone use: large product grid, category pills,
 * floating cart FAB, and a slide-up cart sheet.
 */

import { useState, useEffect, useCallback } from 'react'
import { ShoppingCart, X, Plus, Minus, Trash2, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  stock: number
  trackStock: boolean
  image?: string | null
  category?: { id: string; name: string; color?: string | null; icon?: string | null } | null
}

interface CartItem {
  id: string
  productId: string
  name: string
  price: number
  qty: number
  subtotal: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'IDR') {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(n)
}

// ─── Quick Sale Page ──────────────────────────────────────────────────────────

export default function QuickSalePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Array<{ id: string; name: string; icon?: string | null }>>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [currency, setCurrency] = useState('IDR')
  const [loading, setLoading] = useState(true)

  // Load products + categories from the existing POS API route
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const storeId = params.get('storeId') ?? ''

    Promise.all([
      fetch(`/api/products?storeId=${storeId}&active=true`).then(r => r.ok ? r.json() : { data: [] }),
      fetch(`/api/categories?storeId=${storeId}`).then(r => r.ok ? r.json() : { data: [] }),
    ])
      .then(([prods, cats]) => {
        setProducts(Array.isArray(prods.data) ? prods.data : Array.isArray(prods) ? prods : [])
        setCategories(Array.isArray(cats.data) ? cats.data : Array.isArray(cats) ? cats : [])
        if (prods.currency) setCurrency(prods.currency)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0)

  const filtered = selectedCategory
    ? products.filter(p => p.category?.id === selectedCategory)
    : products

  const addToCart = useCallback((product: Product) => {
    if (product.trackStock && product.stock <= 0) return
    // Haptic feedback on supported devices
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10)
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id)
      if (existing) {
        return prev.map(i =>
          i.productId === product.id
            ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
            : i,
        )
      }
      return [
        ...prev,
        {
          id: `${product.id}-${Date.now()}`,
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: 1,
          subtotal: product.price,
        },
      ]
    })
  }, [])

  const updateQty = (id: string, qty: number) => {
    setCart(prev =>
      qty <= 0 ? prev.filter(i => i.id !== id) : prev.map(i => i.id === id ? { ...i, qty, subtotal: qty * i.price } : i),
    )
  }

  const removeItem = (id: string) => setCart(prev => prev.filter(i => i.id !== id))

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] bg-[var(--bg-base)] overflow-hidden">

      {/* ── Category pills ── */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none shrink-0">
        <button
          onClick={() => setSelectedCategory(null)}
          className={cn(
            'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
            selectedCategory === null
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-[var(--bg-card)] text-[var(--text-2)] border border-[var(--border)]',
          )}
        >
          Semua
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap',
              selectedCategory === cat.id
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-[var(--bg-card)] text-[var(--text-2)] border border-[var(--border)]',
            )}
          >
            {cat.icon && <span className="mr-1">{cat.icon}</span>}
            {cat.name}
          </button>
        ))}
      </div>

      {/* ── Product grid ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-36 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-[var(--text-3)]">
            <Package className="h-12 w-12" />
            <p className="text-sm">Tidak ada produk</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filtered.map(p => {
              const outOfStock = p.trackStock && p.stock <= 0
              const inCart = cart.find(i => i.productId === p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={outOfStock}
                  className={cn(
                    // Large tap targets — min 100px tall, full padding
                    'relative flex flex-col items-start rounded-2xl border p-4 text-left',
                    'transition-all duration-150 active:scale-[0.96] min-h-[120px]',
                    outOfStock
                      ? 'opacity-40 cursor-not-allowed border-[var(--border)] bg-[var(--bg-card)]'
                      : 'cursor-pointer border-[var(--border)] bg-[var(--bg-card)] hover:border-amber-400/60 hover:bg-amber-500/5',
                  )}
                >
                  {/* Category color dot */}
                  {p.category?.color && (
                    <span
                      className="absolute top-3 right-3 w-2 h-2 rounded-full"
                      style={{ background: p.category.color }}
                    />
                  )}
                  {/* Icon / emoji */}
                  <div className="text-3xl mb-2 leading-none">
                    {p.category?.icon ?? '📦'}
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold text-[var(--text-1)] leading-tight">
                    {p.name}
                  </p>
                  {/* Price — larger on mobile */}
                  <p className="mt-auto pt-2 text-base font-bold text-amber-600 sm:text-sm">
                    {fmt(p.price, currency)}
                  </p>
                  {/* In-cart badge */}
                  {inCart && (
                    <span className="absolute top-2 left-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                      {inCart.qty}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Floating cart button ── */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          aria-label={`Buka keranjang, ${cartCount} item`}
          className={cn(
            'fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-2xl',
            'bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3.5',
            'text-white font-semibold shadow-lg shadow-amber-300/40',
            'transition-all active:scale-95',
          )}
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 8px)' }}
        >
          <ShoppingCart className="h-5 w-5" />
          <span>{cartCount} item</span>
          <span className="opacity-80">·</span>
          <span>{fmt(subtotal, currency)}</span>
          <ChevronUp className="h-4 w-4 ml-1" />
        </button>
      )}

      {/* ── Cart bottom sheet ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setCartOpen(false)}
          />
          {/* Sheet */}
          <div className="relative z-10 flex flex-col max-h-[80dvh] rounded-t-3xl bg-[var(--bg-card)] shadow-2xl overflow-hidden">
            {/* Drag handle */}
            <div className="flex justify-center py-3 shrink-0">
              <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
            </div>
            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 pb-3 shrink-0 border-b border-[var(--border)]">
              <h2 className="text-base font-bold text-[var(--text-1)]">Keranjang</h2>
              <button
                onClick={() => setCartOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-subtle)]"
                aria-label="Tutup keranjang"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Items list */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-1)] truncate">{item.name}</p>
                    <p className="text-xs text-[var(--text-3)]">{fmt(item.price, currency)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-2)]"
                      aria-label="Kurang"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold text-[var(--text-1)]">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-2)]"
                      aria-label="Tambah"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50"
                      aria-label="Hapus"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="w-20 text-right text-sm font-semibold text-amber-600 shrink-0">
                    {fmt(item.subtotal, currency)}
                  </p>
                </div>
              ))}
            </div>
            {/* Footer total + checkout */}
            <div
              className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-card)] px-4 pt-3 pb-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--text-2)]">Total</span>
                <span className="text-lg font-bold text-[var(--text-1)]">{fmt(subtotal, currency)}</span>
              </div>
              <Link
                href="/dashboard/pos"
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-2xl py-4',
                  'bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-base',
                  'shadow-md shadow-amber-300/30 active:scale-[0.98] transition-transform',
                )}
              >
                <ShoppingCart className="h-5 w-5" />
                Lanjut ke Kasir
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Needed for the empty-product icon — import Package here since it wasn't in the top-level import
function Package({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <line x1="12" x2="12" y1="22" y2="12" />
    </svg>
  )
}
