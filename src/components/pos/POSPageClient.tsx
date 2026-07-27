'use client'

import { useState, useEffect } from 'react'
import { useCartStore } from '@/store/cart'
import CartPanel from '@/components/pos/CartPanel'
import CheckoutModal from '@/components/pos/CheckoutModal'
import { Search, Grid3x3, List, Tag, Package } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

interface Product {
  id: string
  name: string
  price: number
  stock: number
  trackStock: boolean
  image?: string | null
  category?: { id: string; name: string; color?: string | null; icon?: string | null } | null
  variants: Array<{ id: string; name: string; price?: number | null; stock: number }>
}

interface Category {
  id: string
  name: string
  color?: string | null
  icon?: string | null
}

interface POSPageClientProps {
  storeId: string
  taxRate: number
  currency: string
  staffId: string
  initialProducts: Product[]
  categories: Category[]
}

export default function POSPageClient({
  storeId, taxRate, currency, staffId, initialProducts, categories,
}: POSPageClientProps) {
  const [products]          = useState<Product[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showCheckout, setShowCheckout]     = useState(false)
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null)

  const { addItem, setStore } = useCartStore()

  useEffect(() => { setStore(storeId) }, [storeId, setStore])

  const filtered = products.filter((p) => {
    const matchesSearch   = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || p.category?.id === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleAddToCart = (product: Product, variantId?: string) => {
    const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined
    const price   = variant?.price ?? product.price
    addItem({
      id: `${product.id}-${variantId ?? 'base'}-${Date.now()}`,
      productId: product.id,
      variantId,
      name: product.name,
      variantName: variant?.name,
      price,
      qty: 1,
      discount: 0,
    })
  }

  const handleCheckoutSuccess = (orderId: string) => {
    setShowCheckout(false)
    setSuccessOrderId(orderId)
    setTimeout(() => setSuccessOrderId(null), 3000)
  }

  return (
    <div className="flex h-screen bg-[#0a0a0f] overflow-hidden">

      {/* Left: Product catalog */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0d0d14]">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition"
            />
          </div>

          {/* View toggle */}
          <div className="flex border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white'
                  : 'text-white/30 hover:text-white hover:bg-white/5'
              )}
              aria-label="Grid view"
            >
              <Grid3x3 size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white'
                  : 'text-white/30 hover:text-white hover:bg-white/5'
              )}
              aria-label="List view"
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 px-4 py-2.5 border-b border-white/5 overflow-x-auto bg-[#0d0d14] scrollbar-none">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
              !selectedCategory
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10'
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10'
              )}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products area */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20">
              <Tag size={36} strokeWidth={1.5} />
              <p className="text-sm font-medium">No products found</p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  currency={currency}
                  onAdd={handleAddToCart}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
              {filtered.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  currency={currency}
                  onAdd={handleAddToCart}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart panel */}
      <div className="w-80 xl:w-96 shrink-0 border-l border-white/5">
        <CartPanel
          storeId={storeId}
          taxRate={taxRate}
          currency={currency}
          onCheckout={() => setShowCheckout(true)}
        />
      </div>

      {/* Checkout modal */}
      {showCheckout && (
        <CheckoutModal
          storeId={storeId}
          taxRate={taxRate}
          currency={currency}
          staffId={staffId}
          onClose={() => setShowCheckout(false)}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {/* Success toast */}
      {successOrderId && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl shadow-emerald-500/20 text-sm font-semibold z-50 flex items-center gap-2">
          <span className="text-base">✓</span>
          Order paid successfully!
        </div>
      )}
    </div>
  )
}

// ── Product card (grid) ────────────────────────────────────────────────────────

function ProductCard({ product, currency, onAdd }: {
  product: Product
  currency: string
  onAdd: (p: Product, variantId?: string) => void
}) {
  const outOfStock = product.trackStock && product.stock <= 0
  const fmt = (n: number) => formatCurrency(n, currency)
  const lowStock = product.trackStock && product.stock > 0 && product.stock <= 5

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={cn(
        'flex flex-col p-3.5 rounded-xl border text-left transition-all duration-150',
        outOfStock
          ? 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
          : 'border-white/10 bg-white/5 hover:border-indigo-500/40 hover:bg-white/[0.08] active:scale-[0.98]'
      )}
    >
      {/* Category color indicator */}
      {product.category?.color && (
        <div
          className="w-2 h-2 rounded-full mb-2.5"
          style={{ background: product.category.color }}
        />
      )}

      {/* No image → icon placeholder */}
      {!product.image && (
        <div className="w-full aspect-square rounded-lg bg-white/5 flex items-center justify-center mb-3">
          <Package className="h-6 w-6 text-white/15" />
        </div>
      )}

      {product.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image}
          alt={product.name}
          className="w-full aspect-square rounded-lg object-cover mb-3 bg-white/5"
        />
      )}

      <p className="text-sm font-medium text-white leading-snug truncate">{product.name}</p>
      {product.category && (
        <p className="text-xs text-white/30 mt-0.5 truncate">
          {product.category.icon} {product.category.name}
        </p>
      )}

      <div className="mt-3 flex items-end justify-between gap-1">
        <p className="text-sm font-bold text-indigo-400">{fmt(product.price)}</p>
        {product.trackStock && (
          <p className={cn(
            'text-[11px] font-medium',
            outOfStock  ? 'text-red-400'    :
            lowStock    ? 'text-amber-400'  :
                          'text-white/25'
          )}>
            {outOfStock ? 'Out' : `${product.stock}`}
          </p>
        )}
      </div>
    </button>
  )
}

// ── Product row (list) ─────────────────────────────────────────────────────────

function ProductRow({ product, currency, onAdd }: {
  product: Product
  currency: string
  onAdd: (p: Product, variantId?: string) => void
}) {
  const outOfStock = product.trackStock && product.stock <= 0
  const fmt = (n: number) => formatCurrency(n, currency)

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={cn(
        'w-full flex items-center gap-4 px-4 py-3 bg-[#0d0d14] text-left transition-colors',
        outOfStock
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-white/5'
      )}
    >
      <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
        {product.category?.color ? (
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: product.category.color }} />
        ) : (
          <Package className="h-4 w-4 text-white/20" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{product.name}</p>
        {product.category && (
          <p className="text-xs text-white/30 mt-0.5 truncate">
            {product.category.icon} {product.category.name}
          </p>
        )}
      </div>
      {product.trackStock && (
        <p className={cn(
          'text-xs shrink-0 font-medium',
          product.stock === 0 ? 'text-red-400' :
          product.stock <= 5  ? 'text-amber-400' :
                                'text-white/25'
        )}>
          {product.stock === 0 ? 'Out' : `${product.stock} left`}
        </p>
      )}
      <p className="text-sm font-bold text-indigo-400 shrink-0">{fmt(product.price)}</p>
    </button>
  )
}
