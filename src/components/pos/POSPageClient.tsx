'use client'

import { useState, useEffect } from 'react'
import { useCartStore } from '@/store/cart'
import CartPanel from '@/components/pos/CartPanel'
import CheckoutModal from '@/components/pos/CheckoutModal'
import { Search, Grid3x3, List, Tag } from 'lucide-react'
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
  storeId, taxRate, currency, staffId, initialProducts, categories
}: POSPageClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showCheckout, setShowCheckout] = useState(false)
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null)

  const { addItem, setStore } = useCartStore()

  useEffect(() => { setStore(storeId) }, [storeId, setStore])

  // Filter products
  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || p.category?.id === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleAddToCart = (product: Product, variantId?: string) => {
    const variant = variantId ? product.variants.find(v => v.id === variantId) : undefined
    const price = variant?.price ?? product.price
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
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Left: Product catalog */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* View toggle */}
          <div className="flex border border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-2', viewMode === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white')}
            >
              <Grid3x3 size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-2', viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white')}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 px-4 py-2.5 border-b border-slate-800 overflow-x-auto bg-slate-900">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              !selectedCategory ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            )}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                selectedCategory === cat.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              )}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
              <Tag size={40} strokeWidth={1} />
              <p className="text-sm">No products found</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  currency={currency}
                  onAdd={handleAddToCart}
                />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 overflow-hidden">
              {filtered.map(product => (
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

      {/* Right: Cart */}
      <div className="w-80 xl:w-96 shrink-0">
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium z-50">
          ✓ Order paid successfully!
        </div>
      )}
    </div>
  )
}

function ProductCard({ product, currency, onAdd }: {
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
        'flex flex-col p-3 rounded-xl border text-left transition-all',
        outOfStock
          ? 'border-slate-800 bg-slate-900 opacity-50 cursor-not-allowed'
          : 'border-slate-700 bg-slate-800 hover:border-indigo-500 hover:bg-slate-750 active:scale-95'
      )}
    >
      {/* Category color dot */}
      {product.category?.color && (
        <div className="w-2 h-2 rounded-full mb-2" style={{ background: product.category.color }} />
      )}

      <div className="flex-1">
        <p className="text-sm font-medium text-white leading-tight mb-1">{product.name}</p>
        {product.category && (
          <p className="text-xs text-slate-500">{product.category.icon} {product.category.name}</p>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between">
        <p className="text-sm font-bold text-indigo-400">{fmt(product.price)}</p>
        {product.trackStock && (
          <p className={cn('text-xs', product.stock <= 5 ? 'text-orange-400' : 'text-slate-500')}>
            {product.stock} left
          </p>
        )}
      </div>
    </button>
  )
}

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
        'w-full flex items-center gap-4 px-4 py-3 bg-slate-900 text-left transition-colors',
        outOfStock ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-800'
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{product.name}</p>
        {product.category && (
          <p className="text-xs text-slate-500">{product.category.icon} {product.category.name}</p>
        )}
      </div>
      {product.trackStock && (
        <p className={cn('text-xs shrink-0', product.stock <= 5 ? 'text-orange-400' : 'text-slate-500')}>
          {product.stock} left
        </p>
      )}
      <p className="text-sm font-bold text-indigo-400 shrink-0">{fmt(product.price)}</p>
    </button>
  )
}
